import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const crearTareaSchema = z.object({
  empleadoId: z.string().min(1, "Elige el trabajador"),
  clienteId: z.string().optional(), // vacío = tarea interna / no facturable
  tipoActividadId: z.string().optional(),
  titulo: z.string().min(2, "Ponle un título a la tarea"),
  descripcion: z.string().optional(),
  fecha: z.string(), // YYYY-MM-DD
  horasEstimadas: z.number().min(0.1, "Indica el tiempo estimado"),
});

// GET /api/empresas/[id]/actividades/tareas?fecha=YYYY-MM-DD
//   &desde=YYYY-MM-DD&hasta=YYYY-MM-DD&empleadoId=...&clienteId=...
// Lista tareas filtradas — usado por el dashboard (día de hoy), la ficha
// de un cliente, y el reporte de carga de trabajo.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "actividades");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const fecha = searchParams.get("fecha");
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const empleadoId = searchParams.get("empleadoId");
  const clienteId = searchParams.get("clienteId");
  const estado = searchParams.get("estado");
  const incluirArchivadas = searchParams.get("incluirArchivadas") === "true";

  const where: Prisma.TareaWhereInput = { empresaId };
  if (fecha) where.fecha = new Date(fecha);
  else if (desde || hasta) {
    where.fecha = {
      ...(desde ? { gte: new Date(desde) } : {}),
      ...(hasta ? { lte: new Date(hasta) } : {}),
    };
  }
  if (empleadoId) where.empleadoId = BigInt(empleadoId);
  if (clienteId) where.clienteId = BigInt(clienteId);
  // Por defecto, las tareas archivadas (limpiadas del tablero del equipo)
  // quedan fuera de cualquier listado — hay que pedirlas explícitamente
  // (estado=archivada, o incluirArchivadas=true junto a otro filtro).
  if (estado) where.estado = estado;
  else if (!incluirArchivadas) where.estado = { not: "archivada" };

  const tareas = await prisma.tarea.findMany({
    where,
    include: { empleado: true, cliente: true, tipoActividad: true },
    orderBy: [{ fecha: "asc" }, { creadoEn: "asc" }],
  });

  const hoy = new Date(new Date().toISOString().slice(0, 10));

  return NextResponse.json(
    tareas.map((t) => ({
      id: t.id.toString(),
      empleadoId: t.empleadoId.toString(),
      empleadoNombre: `${t.empleado.nombres} ${t.empleado.apellidos}`,
      empleadoCargo: t.empleado.cargo,
      empleadoTelefono: t.empleado.telefono,
      clienteId: t.clienteId ? t.clienteId.toString() : null,
      clienteNombre: t.cliente?.nombre ?? null,
      tipoActividadId: t.tipoActividadId ? t.tipoActividadId.toString() : null,
      tipoActividadNombre: t.tipoActividad?.nombre ?? null,
      titulo: t.titulo,
      descripcion: t.descripcion,
      fecha: t.fecha,
      horasEstimadas: Number(t.horasEstimadas),
      horasReales: t.horasReales ? Number(t.horasReales) : null,
      estado: t.estado,
      atrasada: t.estado !== "completada" && t.estado !== "archivada" && new Date(t.fecha) < hoy,
      whatsappEnviadoEn: t.whatsappEnviadoEn,
    }))
  );
}

// POST /api/empresas/[id]/actividades/tareas — asigna una actividad a un
// trabajador en una fecha. Si se indica cliente y ese cliente tiene un
// servicio configurado (AsignacionCliente activa), la tarea queda ligada
// a esa configuración para que cuente en su consumo de horas. Avisa (no
// bloquea) si el trabajador queda con más horas ese día de las que su
// capacidad diaria permite — a veces es una decisión consciente.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "actividades");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearTareaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const empleadoId = BigInt(datos.empleadoId);
  const empleado = await prisma.empleado.findFirst({ where: { id: empleadoId, empresaId } });
  if (!empleado) return NextResponse.json({ error: "Trabajador no encontrado" }, { status: 404 });

  let clienteId: bigint | null = null;
  let asignacionClienteId: bigint | null = null;
  if (datos.clienteId) {
    clienteId = BigInt(datos.clienteId);
    const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId } });
    if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

    const asignacion = await prisma.asignacionCliente.findFirst({
      where: { empresaId, clienteId, estado: "activo" },
      orderBy: { fechaInicio: "desc" },
    });
    asignacionClienteId = asignacion?.id ?? null;
  }

  const fecha = new Date(datos.fecha);
  const tareasDelDia = await prisma.tarea.findMany({
    where: { empleadoId, fecha, estado: { notIn: ["completada", "archivada"] } },
  });
  const horasYaAsignadas = tareasDelDia.reduce((acc, t) => acc + Number(t.horasEstimadas), 0);
  const capacidadDiaria = Number(empleado.horasCapacidadDiaria);
  const totalConEstaTarea = horasYaAsignadas + datos.horasEstimadas;
  const advertenciaCapacidad =
    totalConEstaTarea > capacidadDiaria
      ? `${empleado.nombres} ${empleado.apellidos} quedaría con ${totalConEstaTarea.toFixed(1)}h asignadas ese día, por encima de su capacidad de ${capacidadDiaria.toFixed(1)}h.`
      : null;

  const tarea = await prisma.tarea.create({
    data: {
      empresaId,
      empleadoId,
      clienteId,
      asignacionClienteId,
      tipoActividadId: datos.tipoActividadId ? BigInt(datos.tipoActividadId) : null,
      titulo: datos.titulo,
      descripcion: datos.descripcion || null,
      fecha,
      horasEstimadas: datos.horasEstimadas,
      creadoPor: usuarioActual.id,
    },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: usuarioActual.id,
      empresaId,
      tablaAfectada: "tareas",
      registroId: tarea.id,
      accion: "crear",
      valorNuevo: { titulo: tarea.titulo, empleadoId: empleadoId.toString(), horasEstimadas: datos.horasEstimadas },
    },
  });

  return NextResponse.json({ id: tarea.id.toString(), advertenciaCapacidad }, { status: 201 });
}
