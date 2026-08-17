import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/insumos/[insumoId]/kardex — lotes vigentes y
// últimos movimientos de inventario de este insumo, con su lote asociado.
export async function GET(
  request: Request,
  { params }: { params: { id: string; insumoId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "insumos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const insumoId = BigInt(params.insumoId);
  const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, empresaId } });
  if (!insumo) return NextResponse.json({ error: "Insumo no encontrado" }, { status: 404 });

  const [lotes, movimientos] = await Promise.all([
    prisma.loteCompra.findMany({
      where: { insumoId },
      orderBy: { fechaIngreso: "asc" },
    }),
    prisma.movimientoInventario.findMany({
      where: { insumoId },
      orderBy: { fecha: "desc" },
      take: 100,
      include: { lote: true },
    }),
  ]);

  return NextResponse.json({
    insumo: { id: insumo.id.toString(), nombre: insumo.nombre, stockActual: insumo.stockActual.toString(), costoPromedioActual: insumo.costoPromedioActual.toString() },
    lotes: lotes.map((l) => ({
      id: l.id.toString(),
      origen: l.origen,
      fechaIngreso: l.fechaIngreso,
      cantidadInicial: l.cantidadInicial.toString(),
      cantidadDisponible: l.cantidadDisponible.toString(),
      costoUnitario: l.costoUnitario.toString(),
      agotado: Number(l.cantidadDisponible) <= 0,
    })),
    movimientos: movimientos.map((m) => ({
      id: m.id.toString(),
      tipo: m.tipo,
      cantidad: m.cantidad.toString(),
      costoUnitario: m.costoUnitario.toString(),
      fecha: m.fecha,
      loteOrigen: m.lote?.origen ?? null,
      loteFechaIngreso: m.lote?.fechaIngreso ?? null,
    })),
  });
}
