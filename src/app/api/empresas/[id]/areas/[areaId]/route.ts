import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// DELETE /api/empresas/[id]/areas/[areaId] — desactiva el área (no la
// borra físicamente, para no romper el historial de solicitudes que ya
// la usaron). Deja de aparecer en el selector de nuevas solicitudes.
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; areaId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "aprobar_solicitudes_pedido");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const area = await prisma.area.findFirst({ where: { id: BigInt(params.areaId), empresaId } });
  if (!area) return NextResponse.json({ error: "Área no encontrada" }, { status: 404 });

  await prisma.area.update({ where: { id: area.id }, data: { estado: "inactivo" } });

  return NextResponse.json({ ok: true });
}
