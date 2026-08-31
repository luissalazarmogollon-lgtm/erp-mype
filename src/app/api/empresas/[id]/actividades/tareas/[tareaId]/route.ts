import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const editarTareaSchema = z.object({
  titulo: z.string().min(2).optional(),
  descripcion: z.string().optional(),
  horasEstimadas: z.number().min(0.1).optional(),
  horasReales: z.number().min(0).optional(),
  estado: z.enum(["pendiente", "en_progreso", "completada", "archivada"]).optional(),
  marcarWhatsappEnviado: z.boolean().optional(),
});

// GET /api/empresas/[id]/actividades/tareas/[tareaId] — detalle de la
// tarea. Esta es la pantalla a la que apunta el link que se manda por
// WhatsApp al trabajador.
export async function GET(
  request: Request,
  { params }: { params: { id: string; tareaId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "actividades");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const tareaId = BigInt(params.tareaId);
  const tarea = await prisma.tarea.findFirst({
    where: { id: tareaId, empresaId },
    include: { empleado: true, cliente: true, tipoActividad: true },
  });
  if (!tarea) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });

  return NextResponse.json({
    id: tarea.id.toString(),
    empleadoId: tarea.empleadoId.toString(),
    empleadoNombre: `${tarea.empleado.nombres} ${tarea.empleado.apellidos}`,
    empleadoTelefono: tarea.empleado.telefono,
    clienteId: tarea.clienteId ? tarea.clienteId.toString() : null,
    clienteNombre: tarea.cliente?.nombre ?? null,
    tipoActividadNombre: tarea.tipoActividad?.nombre ?? null,
    titulo: tarea.titulo,
    descripcion: tarea.descripcion,
    fecha: tarea.fecha,
    horasEstimadas: Number(tarea.horasEstimadas),
    horasReales: tarea.horasReales ? Number(tarea.horasReales) : null,
    estado: tarea.estado,
    whatsappEnviadoEn: tarea.whatsappEnviadoEn,
  });
}

// PATCH /api/empresas/[id]/actividades/tareas/[tareaId] — edita la tarea,
// la marca como completada (con horas reales), o registra que se avisó
// por WhatsApp (whatsappEnviadoEn), sin necesidad de tocar los demás
// campos.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; tareaId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "actividades");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const tareaId = BigInt(params.tareaId);
  const existente = await prisma.tarea.findFirst({ where: { id: tareaId, empresaId } });
  if (!existente) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });

  const body = await request.json();
  const parsed = editarTareaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  await prisma.tarea.update({
    where: { id: tareaId },
    data: {
      ...(datos.titulo !== undefined ? { titulo: datos.titulo } : {}),
      ...(datos.descripcion !== undefined ? { descripcion: datos.descripcion || null } : {}),
      ...(datos.horasEstimadas !== undefined ? { horasEstimadas: datos.horasEstimadas } : {}),
      ...(datos.horasReales !== undefined ? { horasReales: datos.horasReales } : {}),
      ...(datos.estado ? { estado: datos.estado } : {}),
      ...(datos.marcarWhatsappEnviado ? { whatsappEnviadoEn: new Date() } : {}),
    },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: usuarioActual.id,
      empresaId,
      tablaAfectada: "tareas",
      registroId: tareaId,
      accion: "editar",
      valorAnterior: { estado: existente.estado },
      valorNuevo: { estado: datos.estado ?? existente.estado },
    },
  });

  return NextResponse.json({ ok: true });
}
