import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PATCH /api/empresas/[id]/alertas-costo/[alertaId] — marca la alerta como
// revisada (no elimina el registro, queda como historial).
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; alertaId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "compras");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const alerta = await prisma.alertaAnomaliaCosto.findFirst({
    where: { id: BigInt(params.alertaId), empresaId },
  });
  if (!alerta) return NextResponse.json({ error: "Alerta no encontrada" }, { status: 404 });

  await prisma.alertaAnomaliaCosto.update({ where: { id: alerta.id }, data: { estado: "revisado" } });

  return NextResponse.json({ ok: true });
}
