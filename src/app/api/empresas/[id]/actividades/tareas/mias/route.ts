import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/actividades/tareas/mias — las tareas del
// trabajador vinculado a la cuenta que está logueada ahora mismo
// ("Mis actividades"). Si el usuario actual no tiene una ficha de RRHH
// vinculada (es un asesor/admin, no un trabajador de campo con acceso),
// devuelve vinculado:false y la pantalla simplemente no muestra nada acá
// — es información normal, no un error.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "actividades");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const empleado = await prisma.empleado.findFirst({
    where: { empresaId, usuarioId: usuarioActual.id },
  });

  if (!empleado) {
    return NextResponse.json({ vinculado: false, tareas: [] });
  }

  const tareas = await prisma.tarea.findMany({
    where: { empresaId, empleadoId: empleado.id, estado: { in: ["pendiente", "en_progreso"] } },
    include: { cliente: true, tipoActividad: true },
    orderBy: [{ fecha: "asc" }],
  });

  return NextResponse.json({
    vinculado: true,
    empleadoId: empleado.id.toString(),
    tareas: tareas.map((t) => ({
      id: t.id.toString(),
      titulo: t.titulo,
      clienteNombre: t.cliente?.nombre ?? null,
      tipoActividadNombre: t.tipoActividad?.nombre ?? null,
      fecha: t.fecha,
      horasEstimadas: Number(t.horasEstimadas),
      estado: t.estado,
      atrasada: t.estado !== "completada" && new Date(t.fecha) < new Date(new Date().toISOString().slice(0, 10)),
    })),
  });
}
