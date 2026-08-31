import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoAlguno } from "@/lib/auth";
import { alertaVencimiento } from "@/lib/actividades";

export const dynamic = "force-dynamic";

const editarTareaSchema = z.object({
  titulo: z.string().min(2).optional(),
  descripcion: z.string().optional(),
  horasEstimadas: z.number().min(0.1).optional(),
  horasReales: z.number().min(0).optional(),
  estado: z.enum(["pendiente", "en_progreso", "completada", "archivada"]).optional(),
  marcarWhatsappEnviado: z.boolean().optional(),
  marcarRecibido: z.boolean().optional(),
});

// Campos que puede tocar alguien que SOLO tiene "actividades_propias"
// (auto-servicio) sobre SU PROPIA tarea: avanzar el estado (sin volver a
// "pendiente" ni archivar — eso es gestión del equipo), registrar horas
// reales, marcar que ya la vio, y reenviarse el aviso de WhatsApp. No
// puede cambiar título, descripción, horas estimadas, ni tocar tareas de
// otro trabajador.
const CAMPOS_AUTOSERVICIO = new Set(["horasReales", "estado", "marcarWhatsappEnviado", "marcarRecibido"]);
const ESTADOS_AUTOSERVICIO = new Set(["en_progreso", "completada"]);

// Alguien con solo "actividades_propias" (auto-servicio) solo puede ver o
// tocar SU PROPIA tarea — la que está asignada al Empleado vinculado a su
// cuenta. Devuelve accesoCompleto:false y, si corresponde, el error a
// responder (403) cuando la tarea no es suya.
async function resolverAcceso(usuarioId: string, empresaId: bigint, empleadoIdTarea: bigint) {
  const acceso = await verificarAccesoAlguno(usuarioId, empresaId, ["actividades", "actividades_propias"]);
  const accesoCompleto = acceso.accesoTotal || acceso.permisos.includes("actividades");
  if (accesoCompleto) return { accesoCompleto: true as const, autorizado: true as const };

  const miEmpleado = await prisma.empleado.findFirst({ where: { empresaId, usuarioId } });
  const autorizado = !!miEmpleado && miEmpleado.id === empleadoIdTarea;
  return { accesoCompleto: false as const, autorizado };
}

// GET /api/empresas/[id]/actividades/tareas/[tareaId] — detalle de la
// tarea. Esta es la pantalla a la que apunta el link que se manda por
// WhatsApp al trabajador, y también la que abre "Mis actividades" para
// quien solo tiene acceso de auto-servicio.
export async function GET(
  request: Request,
  { params }: { params: { id: string; tareaId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  const tareaId = BigInt(params.tareaId);
  const tarea = await prisma.tarea.findFirst({
    where: { id: tareaId, empresaId },
    include: { empleado: true, cliente: true, tipoActividad: true },
  });
  if (!tarea) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });

  let acceso;
  try {
    acceso = await resolverAcceso(usuarioActual.id, empresaId, tarea.empleadoId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }
  if (!acceso.autorizado) {
    return NextResponse.json({ error: "No tienes acceso a esta tarea" }, { status: 403 });
  }

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
    recibidoEn: tarea.recibidoEn,
    alertaVencimiento: alertaVencimiento(tarea.fecha, tarea.estado),
    accesoCompleto: acceso.accesoCompleto,
  });
}

// PATCH /api/empresas/[id]/actividades/tareas/[tareaId] — edita la tarea,
// la marca como completada (con horas reales), registra que se avisó por
// WhatsApp, o que el trabajador ya la vio (marcarRecibido). Alguien con
// solo "actividades_propias" puede usar esta misma ruta sobre SU PROPIA
// tarea, pero con permisos recortados: ver CAMPOS_AUTOSERVICIO/ESTADOS_AUTOSERVICIO
// arriba — no puede editar título/descripción/horas estimadas, ni tocar
// tareas de otro trabajador, ni devolver una tarea a "pendiente" o archivarla.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; tareaId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  const tareaId = BigInt(params.tareaId);
  const existente = await prisma.tarea.findFirst({ where: { id: tareaId, empresaId } });
  if (!existente) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });

  let acceso;
  try {
    acceso = await resolverAcceso(usuarioActual.id, empresaId, existente.empleadoId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }
  if (!acceso.autorizado) {
    return NextResponse.json({ error: "No tienes acceso a esta tarea" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = editarTareaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  if (!acceso.accesoCompleto) {
    const camposEnviados = Object.keys(datos) as (keyof typeof datos)[];
    const campoNoPermitido = camposEnviados.find(
      (c) => datos[c] !== undefined && !CAMPOS_AUTOSERVICIO.has(c)
    );
    if (campoNoPermitido) {
      return NextResponse.json({ error: "No tienes permiso para editar ese campo de la tarea" }, { status: 403 });
    }
    if (datos.estado && !ESTADOS_AUTOSERVICIO.has(datos.estado)) {
      return NextResponse.json({ error: "No tienes permiso para poner la tarea en ese estado" }, { status: 403 });
    }
  }

  await prisma.tarea.update({
    where: { id: tareaId },
    data: {
      ...(datos.titulo !== undefined ? { titulo: datos.titulo } : {}),
      ...(datos.descripcion !== undefined ? { descripcion: datos.descripcion || null } : {}),
      ...(datos.horasEstimadas !== undefined ? { horasEstimadas: datos.horasEstimadas } : {}),
      ...(datos.horasReales !== undefined ? { horasReales: datos.horasReales } : {}),
      ...(datos.estado ? { estado: datos.estado } : {}),
      ...(datos.marcarWhatsappEnviado ? { whatsappEnviadoEn: new Date() } : {}),
      ...(datos.marcarRecibido ? { recibidoEn: new Date() } : {}),
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
