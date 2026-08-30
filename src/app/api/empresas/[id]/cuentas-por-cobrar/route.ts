import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const crearCxcSchema = z.object({
  clienteId: z.string(),
  numeroFactura: z.string().optional(),
  montoTotal: z.number().positive(),
  descripcion: z.string().optional(),
  fechaVencimiento: z.string().optional(),
});

// GET /api/empresas/[id]/cuentas-por-cobrar — listado con saldo pendiente.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "creditos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const cxcs = await prisma.cuentaPorCobrar.findMany({
    where: { empresaId },
    include: { cliente: true, cobros: true },
    orderBy: { fechaEmision: "desc" },
  });

  return NextResponse.json(
    cxcs.map((c) => ({
      id: c.id.toString(),
      cliente: c.cliente.nombre,
      clienteRuc: c.cliente.docIdentidad,
      numeroFactura: c.numeroFactura,
      descripcion: c.descripcion,
      montoTotal: c.montoTotal.toString(),
      saldoPendiente: c.saldoPendiente.toString(),
      fechaEmision: c.fechaEmision,
      fechaVencimiento: c.fechaVencimiento,
      estado: c.estado,
      cobros: c.cobros.map((p) => ({
        monto: p.monto.toString(),
        fecha: p.fecha,
        medioPago: p.medioPago,
      })),
    }))
  );
}

// POST /api/empresas/[id]/cuentas-por-cobrar — registra un nuevo crédito
// a un cliente ("fiado"), con su factura de referencia. Se acumula: un
// mismo cliente puede tener varias filas abiertas si se le da crédito
// varias veces.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "creditos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearCxcSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const cxc = await prisma.cuentaPorCobrar.create({
    data: {
      empresaId,
      clienteId: BigInt(datos.clienteId),
      numeroFactura: datos.numeroFactura || null,
      montoTotal: datos.montoTotal,
      saldoPendiente: datos.montoTotal,
      descripcion: datos.descripcion || null,
      fechaVencimiento: datos.fechaVencimiento ? new Date(datos.fechaVencimiento) : null,
      usuarioId: usuarioActual.id,
    },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: usuarioActual.id,
      empresaId,
      tablaAfectada: "cuentas_por_cobrar",
      registroId: cxc.id,
      accion: "crear",
      valorNuevo: { montoTotal: cxc.montoTotal.toString(), numeroFactura: datos.numeroFactura ?? null },
    },
  });

  return NextResponse.json({ id: cxc.id.toString() }, { status: 201 });
}
