import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/empresas/[id]/actividades/tareas/limpiar-completadas
// "Limpia" las tareas completadas de la vista del equipo — pero ARCHIVA,
// no borra: pasan a estado "archivada" y quedan fuera de las listas y
// reportes por defecto, pero se conservan en la base de datos para
// historial, auditoría y consumo de horas por cliente (que sigue
// contándolas — ver clientes/[asignacionId]/route.ts).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "actividades");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const resultado = await prisma.tarea.updateMany({
    where: { empresaId, estado: "completada" },
    data: { estado: "archivada" },
  });

  if (resultado.count > 0) {
    await prisma.auditoria.create({
      data: {
        usuarioId: usuarioActual.id,
        empresaId,
        tablaAfectada: "tareas",
        registroId: BigInt(0), // afecta varias filas — el detalle queda en valorNuevo
        accion: "editar",
        valorNuevo: { accion: "limpiar_completadas", cantidadArchivada: resultado.count },
      },
    });
  }

  return NextResponse.json({ ok: true, archivadas: resultado.count });
}
