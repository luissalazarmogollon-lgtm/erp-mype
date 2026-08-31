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

const crearAsignacionSchema = z.object({
  clienteId: z.string().min(1, "Elige el cliente"),
  precioVentaMensual: z.number().min(0).optional(),
  empleados: z
    .array(
      z.object({
        empleadoId: z.string().min(1),
        horasMensuales: z.number().min(0.5, "Indica cuántas horas al mes le dedica"),
      })
    )
    .min(1, "Asigna al menos un empleado al servicio"),
});

// GET /api/empresas/[id]/actividades/clientes — lista las configuraciones
// de servicio (una por cliente activo), con el costo, precio sugerido
// (40% de rentabilidad) y margen real si hay precio pactado.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "actividades");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const asignaciones = await prisma.asignacionCliente.findMany({
    where: { empresaId, estado: "activo" },
    include: {
      cliente: true,
      empleados: { include: { empleado: true } },
    },
    orderBy: { fechaInicio: "desc" },
  });

  const horasComprometidas = await horasComprometidasPorEmpleado(empresaId);

  return NextResponse.json(
    asignaciones.map((a) => {
      const empleados = a.empleados.map((d) => {
        const costoHora = costoHoraEmpleado(d.empleado);
        const capacidadMensual = capacidadMensualHoras(d.empleado);
        const totalComprometido = horasComprometidas.get(d.empleadoId.toString()) ?? 0;
        return {
          empleadoId: d.empleadoId.toString(),
          nombres: d.empleado.nombres,
          apellidos: d.empleado.apellidos,
          horasMensuales: Number(d.horasMensuales),
          costoHora: Number(costoHora.toFixed(2)),
          capacidadMensualHoras: Number(capacidadMensual.toFixed(1)),
          horasComprometidasTotal: Number(totalComprometido.toFixed(1)),
          excedeCapacidad: totalComprometido > capacidadMensual,
        };
      });
      const costoMensual = empleados.reduce((acc, e) => acc + e.horasMensuales * e.costoHora, 0);
      const precioVenta = a.precioVentaMensual ? Number(a.precioVentaMensual) : null;
      return {
        id: a.id.toString(),
        clienteId: a.clienteId.toString(),
        clienteNombre: a.cliente.nombre,
        fechaInicio: a.fechaInicio,
        precioVentaMensual: precioVenta,
        costoMensual: Number(costoMensual.toFixed(2)),
        precioSugerido: Number(precioSugerido(costoMensual).toFixed(2)),
        margenReal: margenReal(precioVenta, costoMensual),
        margenEnRiesgo: margenEnRiesgo(precioVenta, costoMensual),
        empleados,
        algunEmpleadoExcedeCapacidad: empleados.some((e) => e.excedeCapacidad),
      };
    })
  );
}

// POST /api/empresas/[id]/actividades/clientes — arma el servicio para un
// cliente al iniciar (o renovar): a qué empleados se les asigna, cuántas
// horas al mes cada uno, y opcionalmente el precio pactado. Devuelve el
// costo/precio sugerido/margen y una advertencia (no bloquea) si algún
// empleado queda comprometido por encima de su capacidad mensual.
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
  const parsed = crearAsignacionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const clienteId = BigInt(datos.clienteId);
  const cliente = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId } });
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const empleadoIds = datos.empleados.map((e) => BigInt(e.empleadoId));
  const empleados = await prisma.empleado.findMany({ where: { id: { in: empleadoIds }, empresaId } });
  if (empleados.length !== empleadoIds.length) {
    return NextResponse.json({ error: "Uno de los trabajadores elegidos no existe en esta empresa" }, { status: 400 });
  }

  const horasComprometidas = await horasComprometidasPorEmpleado(empresaId);
  const empleadosPorId = new Map(empleados.map((e) => [e.id.toString(), e]));

  const costoMensual = datos.empleados.reduce((acc, e) => {
    const empleado = empleadosPorId.get(e.empleadoId)!;
    return acc + e.horasMensuales * costoHoraEmpleado(empleado);
  }, 0);

  const advertenciasCapacidad = datos.empleados
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

  const asignacion = await prisma.$transaction(async (tx) => {
    const creada = await tx.asignacionCliente.create({
      data: {
        empresaId,
        clienteId,
        precioVentaMensual: datos.precioVentaMensual ?? null,
        creadoPor: usuarioActual.id,
        empleados: {
          create: datos.empleados.map((e) => ({
            empleadoId: BigInt(e.empleadoId),
            horasMensuales: e.horasMensuales,
          })),
        },
      },
    });

    await tx.auditoria.create({
      data: {
        usuarioId: usuarioActual.id,
        empresaId,
        tablaAfectada: "asignaciones_cliente",
        registroId: creada.id,
        accion: "crear",
        valorNuevo: { clienteId: clienteId.toString(), costoMensual, precioVentaMensual: datos.precioVentaMensual ?? null },
      },
    });

    return creada;
  });

  return NextResponse.json(
    {
      id: asignacion.id.toString(),
      costoMensual: Number(costoMensual.toFixed(2)),
      precioSugerido: Number(precioSugerido(costoMensual).toFixed(2)),
      margenReal: margenReal(datos.precioVentaMensual ?? null, costoMensual),
      advertenciasCapacidad,
    },
    { status: 201 }
  );
}
