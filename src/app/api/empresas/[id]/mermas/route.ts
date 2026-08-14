import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const registrarMermaSchema = z.object({
  insumoId: z.string(),
  cantidad: z.number().positive(),
  motivo: z.enum(["vencimiento", "desperdicio_preparacion", "robo_diferencia", "otro"]),
  observacion: z.string().optional(),
});

// GET /api/empresas/[id]/mermas — historial de mermas.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const mermas = await prisma.merma.findMany({
    where: { empresaId },
    include: { insumo: true },
    orderBy: { fecha: "desc" },
    take: 100,
  });

  return NextResponse.json(
    mermas.map((m) => ({
      id: m.id.toString(),
      insumo: m.insumo.nombre,
      cantidad: m.cantidad.toString(),
      motivo: m.motivo,
      costoEstimado: m.costoEstimado.toString(),
      fecha: m.fecha,
      observacion: m.observacion,
    }))
  );
}

// POST /api/empresas/[id]/mermas — registra una merma (RN-040 a RN-042):
// descuenta stock, exige motivo de catálogo cerrado, calcula el costo
// estimado con el costo promedio actual del insumo.
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
  const parsed = registrarMermaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const datos = parsed.data;

  const insumoId = BigInt(datos.insumoId);
  const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, empresaId } });
  if (!insumo) return NextResponse.json({ error: "Insumo no encontrado" }, { status: 404 });

  const stockActual = Number(insumo.stockActual);
  if (datos.cantidad > stockActual) {
    return NextResponse.json(
      { error: `No puedes reportar una merma mayor al stock actual (${stockActual})` },
      { status: 400 }
    );
  }

  // RN-042: costo estimado = cantidad × costo_promedio_actual
  const costoEstimado = datos.cantidad * Number(insumo.costoPromedioActual);

  const merma = await prisma.$transaction(async (tx) => {
    const nuevaMerma = await tx.merma.create({
      data: {
        empresaId,
        insumoId,
        cantidad: datos.cantidad,
        motivo: datos.motivo,
        costoEstimado,
        usuarioId: usuarioActual.id,
        observacion: datos.observacion || null,
      },
    });

    // RN-040: genera movimiento de salida y descuenta stock.
    await tx.movimientoInventario.create({
      data: {
        empresaId,
        insumoId,
        tipo: "merma",
        cantidad: -datos.cantidad,
        costoUnitario: insumo.costoPromedioActual,
        referenciaTipo: "merma",
        referenciaId: nuevaMerma.id,
        usuarioId: usuarioActual.id,
      },
    });
    await tx.insumo.update({
      where: { id: insumoId },
      data: { stockActual: { decrement: datos.cantidad } },
    });

    return nuevaMerma;
  });

  return NextResponse.json({ id: merma.id.toString() }, { status: 201 });
}
