import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ajusteSchema = z.object({
  cantidad: z.number().refine((v) => v !== 0, "La cantidad no puede ser 0"),
  costoUnitario: z.number().min(0),
  observacion: z.string().optional(),
});

// POST /api/empresas/[id]/insumos/[insumoId]/ajuste
// Movimiento manual de inventario (tipo ajuste_manual) — mecanismo temporal
// para cargar stock inicial mientras no existe el módulo de Compras
// (Sprint 4, que generará entrada_compra automáticamente vía RN-030).
// Aplica RN-031 (promedio ponderado) solo cuando la cantidad es positiva.
export async function POST(
  request: Request,
  { params }: { params: { id: string; insumoId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = ajusteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const datos = parsed.data;

  const insumoId = BigInt(params.insumoId);
  const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, empresaId } });
  if (!insumo) {
    return NextResponse.json({ error: "Insumo no encontrado" }, { status: 404 });
  }

  const stockActual = Number(insumo.stockActual);
  const costoActual = Number(insumo.costoPromedioActual);
  const nuevoStock = stockActual + datos.cantidad;

  // RN-033: el stock no puede quedar negativo.
  if (nuevoStock < 0) {
    return NextResponse.json(
      { error: `El ajuste dejaría el stock en negativo (actual: ${stockActual}, ajuste: ${datos.cantidad})` },
      { status: 400 }
    );
  }

  // RN-031: promedio ponderado solo al aumentar stock. Al reducirlo
  // manualmente (ej. corrección de conteo), el costo promedio no cambia.
  const nuevoCosto =
    datos.cantidad > 0
      ? (stockActual * costoActual + datos.cantidad * datos.costoUnitario) / nuevoStock
      : costoActual;

  const [insumoActualizado] = await prisma.$transaction([
    prisma.insumo.update({
      where: { id: insumoId },
      data: { stockActual: nuevoStock, costoPromedioActual: nuevoCosto },
    }),
    prisma.movimientoInventario.create({
      data: {
        empresaId,
        insumoId,
        tipo: "ajuste_manual",
        cantidad: datos.cantidad,
        costoUnitario: datos.costoUnitario,
        usuarioId: usuarioActual.id,
        referenciaTipo: "ajuste_manual",
      },
    }),
  ]);

  return NextResponse.json({
    stockActual: insumoActualizado.stockActual.toString(),
    costoPromedioActual: insumoActualizado.costoPromedioActual.toString(),
  });
}
