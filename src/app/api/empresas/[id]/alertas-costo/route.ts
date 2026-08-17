import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/alertas-costo — alertas de anomalía de costo,
// pendientes primero.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "compras");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const alertas = await prisma.alertaAnomaliaCosto.findMany({
    where: { empresaId },
    include: { insumo: true },
    orderBy: [{ estado: "asc" }, { fecha: "desc" }],
  });

  return NextResponse.json(
    alertas.map((a) => ({
      id: a.id.toString(),
      insumoNombre: a.insumo.nombre,
      costoAnterior: a.costoAnterior.toString(),
      costoNuevo: a.costoNuevo.toString(),
      variacionPct: a.variacionPct.toString(),
      fecha: a.fecha,
      estado: a.estado,
    }))
  );
}
