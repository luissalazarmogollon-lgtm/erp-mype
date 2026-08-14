import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// PATCH /api/empresas/[id]/adelantos/[adelantoId] — marca el adelanto
// como "descontado" (aplicado ya en el sueldo del trabajador).
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; adelantoId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "rrhh");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const adelantoId = BigInt(params.adelantoId);
  const adelanto = await prisma.adelantoSueldo.findFirst({ where: { id: adelantoId, empresaId } });
  if (!adelanto) return NextResponse.json({ error: "Adelanto no encontrado" }, { status: 404 });

  await prisma.adelantoSueldo.update({ where: { id: adelantoId }, data: { estado: "descontado" } });

  return NextResponse.json({ ok: true });
}
