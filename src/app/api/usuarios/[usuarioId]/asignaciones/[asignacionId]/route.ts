import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, requiereSuperadmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// DELETE /api/usuarios/[usuarioId]/asignaciones/[asignacionId]
// Revoca el acceso de un usuario a una empresa. No se borra físicamente
// (queda estado = 'inactivo') para conservar el historial de auditoría —
// si más adelante se le vuelve a asignar la misma empresa, se reactiva.
export async function DELETE(
  request: Request,
  { params }: { params: { usuarioId: string; asignacionId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  try {
    requiereSuperadmin(usuarioActual);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const asignacionId = BigInt(params.asignacionId);
  const asignacion = await prisma.usuarioEmpresa.findFirst({
    where: { id: asignacionId, usuarioId: params.usuarioId },
  });
  if (!asignacion) {
    return NextResponse.json({ error: "Asignación no encontrada" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.usuarioEmpresa.update({ where: { id: asignacionId }, data: { estado: "inactivo" } }),
    prisma.auditoria.create({
      data: {
        usuarioId: usuarioActual!.id,
        empresaId: asignacion.empresaId,
        tablaAfectada: "usuario_empresa",
        registroId: asignacionId,
        accion: "eliminar",
        valorAnterior: { usuarioId: params.usuarioId, estado: "activo" },
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
