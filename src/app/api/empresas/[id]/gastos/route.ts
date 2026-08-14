import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const registrarGastoSchema = z.object({
  categoriaId: z.string().optional(),
  proveedorNombre: z.string().optional(),
  descripcion: z.string().min(2, "Describe brevemente el gasto"),
  tipoComprobante: z.enum(["boleta", "factura", "recibo_honorarios", "ticket", "sin_comprobante"]),
  montoTotal: z.number().positive(),
  fecha: z.string(), // YYYY-MM-DD
  esCostoDirecto: z.boolean(),
  condicion: z.enum(["contado", "credito"]),
  medioPago: z.string().optional(),
  fechaVencimiento: z.string().optional(),
});

// GET /api/empresas/[id]/gastos — historial de gastos/costos.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const gastos = await prisma.gasto.findMany({
    where: { empresaId },
    include: { categoria: true, cuentaPorPagar: true },
    orderBy: { fecha: "desc" },
    take: 100,
  });

  return NextResponse.json(
    gastos.map((g) => ({
      id: g.id.toString(),
      categoria: g.categoria?.nombre ?? "Sin categoría",
      proveedorNombre: g.proveedorNombre,
      descripcion: g.descripcion,
      tipoComprobante: g.tipoComprobante,
      montoTotal: g.montoTotal.toString(),
      fecha: g.fecha,
      esCostoDirecto: g.esCostoDirecto,
      condicion: g.condicion,
      medioPago: g.medioPago,
      estadoPago: g.cuentaPorPagar?.estado ?? "pagado",
    }))
  );
}

// POST /api/empresas/[id]/gastos — registra un gasto/costo (RN-070).
// Si condicion = 'credito', genera automáticamente su CuentaPorPagar
// (equivalente a RN-032, aplicado aquí a gastos en vez de compras).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = registrarGastoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const datos = parsed.data;

  if (datos.condicion === "contado" && !datos.medioPago) {
    return NextResponse.json({ error: "Indica el medio de pago para un gasto al contado" }, { status: 400 });
  }

  const gasto = await prisma.$transaction(async (tx) => {
    const nuevoGasto = await tx.gasto.create({
      data: {
        empresaId,
        categoriaId: datos.categoriaId ? BigInt(datos.categoriaId) : null,
        proveedorNombre: datos.proveedorNombre || null,
        descripcion: datos.descripcion,
        tipoComprobante: datos.tipoComprobante,
        montoTotal: datos.montoTotal,
        fecha: new Date(datos.fecha),
        esCostoDirecto: datos.esCostoDirecto,
        condicion: datos.condicion,
        medioPago: datos.condicion === "contado" ? datos.medioPago : null,
        usuarioId: usuarioActual.id,
      },
    });

    if (datos.condicion === "credito") {
      await tx.cuentaPorPagar.create({
        data: {
          empresaId,
          gastoId: nuevoGasto.id,
          proveedorNombre: datos.proveedorNombre || null,
          montoTotal: datos.montoTotal,
          saldoPendiente: datos.montoTotal,
          fechaVencimiento: datos.fechaVencimiento ? new Date(datos.fechaVencimiento) : null,
        },
      });
    }

    await tx.auditoria.create({
      data: {
        usuarioId: usuarioActual.id,
        empresaId,
        tablaAfectada: "gastos",
        registroId: nuevoGasto.id,
        accion: "crear",
        valorNuevo: { descripcion: nuevoGasto.descripcion, montoTotal: nuevoGasto.montoTotal.toString() },
      },
    });

    return nuevoGasto;
  });

  return NextResponse.json({ id: gasto.id.toString() }, { status: 201 });
}
