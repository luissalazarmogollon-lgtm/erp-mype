import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import {
  costoHoraEmpleado,
  capacidadMensualHoras,
  precioSugerido,
  margenReal,
  margenEnRiesgo,
  horasComprometidasPorEmpleado,
} from "@/lib/actividades";

export const dynamic = "force-dynamic";

const editarAsignacionSchema = z.object({
  precioVentaMensual: z.number().min(0).optional(),
  estado: z.enum(["activo", "inactivo"]).optional(),
  empleados: z
    .array(
      z.object({
        empleadoId: z.string().min(1),
        horasMensuales: z.number().min(0.5),
      })
    )
    .min(1)
    .optional(),
});

// GET /api/empresas/[id]/actividades/clientes/[asignacionId] — detalle de
// la configuración del servicio: empleados y horas presupuestadas, costo,
// precio sugerido/margen, y cuánto tiempo REAL se ha registrado este mes
// en Tareas de este cliente (para ver si el consumo real está alineado
// con lo presupuestado).
export async function GET(
  request: Request,
  { params }: { params: { id: string; asignacionId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "actividades");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const asignacionId = BigInt(params.asignacionId);
  const asignacion = await prisma.asignacionCliente.findFirst({
    where: { id: asignacionId, empresaId },
    include: { cliente: true, empleados: { include: { empleado: true } } },
  });
  if (!asignacion) return NextResponse.json({ error: "Configuración de servicio no encontrada" }, { status: 404 });

  const inicioMes = new Date();
  inicioMes.setUTCDate(1);
  inicioMes.setUTCHours(0, 0, 0, 0);

  const tareasDelMes = await prisma.tarea.findMany({
    where: { asignacionClienteId: asignacionId, fecha: { gte: inicioMes } },
    orderBy: { fecha: "desc" },
    include: { empleado: true, tipoActividad: true },
  });

  const empleados = asignacion.empleados.map((d) => {
    const costoHora = costoHoraEmpleado(d.empleado);
    const horasRealesMes = tareasDelMes
      .filter((t) => t.empleadoId === d.empleadoId)
      .reduce((acc, t) => acc + Number(t.horasReales ?? t.horasEstimadas), 0);
    return {
      empleadoId: d.empleadoId.toString(),
      nombres: d.empleado.nombres,
      apellidos: d.empleado.apellidos,
      horasMensuales: Number(d.horasMensuales),
      costoHora: Number(costoHora.toFixed(2)),
      capacidadMensualHoras: Number(capacidadMensualHoras(d.empleado).toFixed(1)),
      horasRealesMes: Number(horasRealesMes.toFixed(1)),
      excedeHorasPresupuestadas: horasRealesMes > Number(d.horasMensuales),
    };
  });

  const costoMensual = empleados.reduce((acc, e) => acc + e.horasMensuales * e.costoHora, 0);
  const precioVenta = asignacion.precioVentaMensual ? Number(asignacion.precioVentaMensual) : null;

  return NextResponse.json({
    id: asignacion.id.toString(),
    clienteId: asignacion.clienteId.toString(),
    clienteNombre: asignacion.cliente.nombre,
    fechaInicio: asignacion.fechaInicio,
    estado: asignacion.estado,
    precioVentaMensual: precioVenta,
    costoMensual: Number(costoMensual.toFixed(2)),
    precioSugerido: Number(precioSugerido(costoMensual).toFixed(2)),
    margenReal: margenReal(precioVenta, costoMensual),
    margenEnRiesgo: margenEnRiesgo(precioVenta, costoMensual),
    empleados,
    tareasDelMes: tareasDelMes.map((t) => ({
      id: t.id.toString(),
      titulo: t.titulo,
      fecha: t.fecha,
      empleadoNombre: `${t.empleado.nombres} ${t.empleado.apellidos}`,
      tipoActividad: t.tipoActividad?.nombre ?? null,
      horasEstimadas: Number(t.horasEstimadas),
      horasReales: t.horasReales ? Number(t.horasReales) : null,
      estado: t.estado,
    })),
  });
}

// PATCH /api/empresas/[id]/actividades/clientes/[asignacionId] — edita el
// precio pactado, la lista de empleados/horas, o finaliza el servicio
// (estado "inactivo": deja de contar para la capacidad de nadie).
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; asignacionId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "actividades");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const asignacionId = BigInt(params.asignacionId);
  const existente = await prisma.asignacionCliente.findFirst({ where: { id: asignacionId, empresaId } });
  if (!existente) return NextResponse.json({ error: "Configuración de servicio no encontrada" }, { status: 404 });

  const body = await request.json();
  const parsed = editarAsignacionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  let advertenciasCapacidad: string[] = [];
  if (datos.empleados) {
    const empleadoIds = datos.empleados.map((e) => BigInt(e.empleadoId));
    const empleados = await prisma.empleado.findMany({ where: { id: { in: empleadoIds }, empresaId } });
    if (empleados.length !== empleadoIds.length) {
      return NextResponse.json({ error: "Uno de los trabajadores elegidos no existe en esta empresa" }, { status: 400 });
    }

    const empleadosPorId = new Map(empleados.map((e) => [e.id.toString(), e]));
    // Excluye esta misma asignación de lo "ya comprometido", para no
    // contar sus horas viejas dos veces contra las nuevas que se están guardando.
    const horasComprometidas = await horasComprometidasPorEmpleado(empresaId, asignacionId);
    advertenciasCapacidad = datos.empleados
      .map((e) => {
        const empleado = empleadosPorId.get(e.empleadoId)!;
        const capacidadMensual = capacidadMensualHoras(empleado);
        const totalConEsteCliente = (horasComprometidas.get(e.empleadoId) ?? 0) + e.horasMensuales;
        if (totalConEsteCliente > capacidadMensual) {
          return `${empleado.nombres} ${empleado.apellidos} quedaría con ${totalConEsteCliente.toFixed(1)}h/mes comprometidas, por encima de su capacidad de ${capacidadMensual.toFixed(1)}h/mes.`;
        }
        return null;
      })
      .filter((m): m is string => m !== null);
  }

  await prisma.$transaction(async (tx) => {
    if (datos.empleados) {
      await tx.asignacionClienteEmpleado.deleteMany({ where: { asignacionClienteId: asignacionId } });
      await tx.asignacionClienteEmpleado.createMany({
        data: datos.empleados.map((e) => ({
          asignacionClienteId: asignacionId,
          empleadoId: BigInt(e.empleadoId),
          horasMensuales: e.horasMensuales,
        })),
      });
    }

    await tx.asignacionCliente.update({
      where: { id: asignacionId },
      data: {
        ...(datos.precioVentaMensual !== undefined ? { precioVentaMensual: datos.precioVentaMensual } : {}),
        ...(datos.estado ? { estado: datos.estado } : {}),
      },
    });

    await tx.auditoria.create({
      data: {
        usuarioId: usuarioActual.id,
        empresaId,
        tablaAfectada: "asignaciones_cliente",
        registroId: asignacionId,
        accion: "editar",
        valorNuevo: { precioVentaMensual: datos.precioVentaMensual, estado: datos.estado },
      },
    });
  });

  return NextResponse.json({ ok: true, advertenciasCapacidad });
}
