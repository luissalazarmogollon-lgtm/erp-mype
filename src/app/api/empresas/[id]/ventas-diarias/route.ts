import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const registroSchema = z.object({
  localId: z.string().optional(),
  fecha: z.string(), // YYYY-MM-DD
  montoEfectivo: z.number().min(0).default(0),
  montoYape: z.number().min(0).default(0),
  montoPlin: z.number().min(0).default(0),
  montoTarjeta: z.number().min(0).default(0),
  observacion: z.string().optional(),
});

// GET /api/empresas/[id]/ventas-diarias — historial (más recientes primero).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const registros = await prisma.registroVentaDiaria.findMany({
    where: { empresaId },
    include: { local: true },
    orderBy: { fecha: "desc" },
    take: 90,
  });

  return NextResponse.json(
    registros.map((r) => ({
      id: r.id.toString(),
      local: r.local?.nombre ?? null,
      fecha: r.fecha,
      montoEfectivo: r.montoEfectivo.toString(),
      montoYape: r.montoYape.toString(),
      montoPlin: r.montoPlin.toString(),
      montoTarjeta: r.montoTarjeta.toString(),
      total: (
        Number(r.montoEfectivo) + Number(r.montoYape) + Number(r.montoPlin) + Number(r.montoTarjeta)
      ).toFixed(2),
      observacion: r.observacion,
    }))
  );
}

// POST /api/empresas/[id]/ventas-diarias — crea o actualiza (upsert) el
// resumen del día. Un registro por empresa+fecha+local: si ya existe para
// esa combinación, se sobreescribe (permite corregir un día sin duplicar).
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
  const parsed = registroSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const datos = parsed.data;

  const localId = datos.localId ? BigInt(datos.localId) : null;

  const registro = await prisma.registroVentaDiaria.upsert({
    where: { empresaId_fecha_localId: { empresaId, fecha: new Date(datos.fecha), localId } },
    update: {
      montoEfectivo: datos.montoEfectivo,
      montoYape: datos.montoYape,
      montoPlin: datos.montoPlin,
      montoTarjeta: datos.montoTarjeta,
      observacion: datos.observacion || null,
    },
    create: {
      empresaId,
      localId,
      fecha: new Date(datos.fecha),
      montoEfectivo: datos.montoEfectivo,
      montoYape: datos.montoYape,
      montoPlin: datos.montoPlin,
      montoTarjeta: datos.montoTarjeta,
      observacion: datos.observacion || null,
      usuarioId: usuarioActual.id,
    },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: usuarioActual.id,
      empresaId,
      tablaAfectada: "registros_venta_diaria",
      registroId: registro.id,
      accion: "crear",
      valorNuevo: { fecha: datos.fecha, total: (datos.montoEfectivo + datos.montoYape + datos.montoPlin + datos.montoTarjeta).toString() },
    },
  });

  return NextResponse.json({ id: registro.id.toString() }, { status: 201 });
}
