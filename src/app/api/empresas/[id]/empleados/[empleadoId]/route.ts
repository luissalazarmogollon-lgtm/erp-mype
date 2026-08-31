import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { costoHoraEmpleado, capacidadMensualHoras } from "@/lib/actividades";

export const dynamic = "force-dynamic";

const editarEmpleadoSchema = z.object({
  nombres: z.string().min(2),
  apellidos: z.string().min(2),
  docIdentidad: z.string().min(6),
  cargo: z.string().optional(),
  fechaIngreso: z.string(),
  tipoContrato: z.string().optional(),
  sueldoBasico: z.number().min(0),
  otrosIngresos: z.number().min(0).default(0),
  cuentaBancaria: z.string().optional(),
  telefono: z.string().optional(),
  horasCapacidadDiaria: z.number().min(0).max(24).default(9),
  costoHoraManual: z.number().min(0).optional(),
});

// GET /api/empresas/[id]/empleados/[empleadoId]
// Devuelve los datos del trabajador, su historial de adelantos, y el
// "saldo pendiente por recibir" (sueldo básico + otros ingresos, menos
// los adelantos todavía no descontados) — una aproximación en tiempo real,
// no un cálculo de planilla formal.
export async function GET(
  request: Request,
  { params }: { params: { id: string; empleadoId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "rrhh");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const empleadoId = BigInt(params.empleadoId);
  const empleado = await prisma.empleado.findFirst({ where: { id: empleadoId, empresaId } });
  if (!empleado) return NextResponse.json({ error: "Trabajador no encontrado" }, { status: 404 });

  const adelantos = await prisma.adelantoSueldo.findMany({
    where: { empleadoId },
    orderBy: { fecha: "desc" },
  });

  const totalAdelantosPendientes = adelantos
    .filter((a) => a.estado === "pendiente")
    .reduce((acc, a) => acc + Number(a.monto), 0);

  const sueldoTotal = Number(empleado.sueldoBasico) + Number(empleado.otrosIngresos);
  const saldoPorRecibir = sueldoTotal - totalAdelantosPendientes;

  return NextResponse.json({
    id: empleado.id.toString(),
    nombres: empleado.nombres,
    apellidos: empleado.apellidos,
    docIdentidad: empleado.docIdentidad,
    cargo: empleado.cargo,
    fechaIngreso: empleado.fechaIngreso,
    tipoContrato: empleado.tipoContrato,
    sueldoBasico: empleado.sueldoBasico.toString(),
    otrosIngresos: empleado.otrosIngresos.toString(),
    cuentaBancaria: empleado.cuentaBancaria,
    telefono: empleado.telefono,
    horasCapacidadDiaria: empleado.horasCapacidadDiaria.toString(),
    costoHoraManual: empleado.costoHoraManual ? empleado.costoHoraManual.toString() : null,
    costoHora: Number(costoHoraEmpleado(empleado).toFixed(2)),
    capacidadMensualHoras: Number(capacidadMensualHoras(empleado).toFixed(1)),
    sueldoTotal,
    totalAdelantosPendientes,
    saldoPorRecibir,
    adelantos: adelantos.map((a) => ({
      id: a.id.toString(),
      monto: a.monto.toString(),
      fecha: a.fecha,
      motivo: a.motivo,
      estado: a.estado,
    })),
  });
}

// PATCH /api/empresas/[id]/empleados/[empleadoId] — edita los datos del trabajador.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; empleadoId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "rrhh");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const empleadoId = BigInt(params.empleadoId);
  const existente = await prisma.empleado.findFirst({ where: { id: empleadoId, empresaId } });
  if (!existente) return NextResponse.json({ error: "Trabajador no encontrado" }, { status: 404 });

  const body = await request.json();
  const parsed = editarEmpleadoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  await prisma.$transaction([
    prisma.empleado.update({
      where: { id: empleadoId },
      data: {
        nombres: datos.nombres,
        apellidos: datos.apellidos,
        docIdentidad: datos.docIdentidad,
        cargo: datos.cargo || null,
        fechaIngreso: new Date(datos.fechaIngreso),
        tipoContrato: datos.tipoContrato || null,
        sueldoBasico: datos.sueldoBasico,
        otrosIngresos: datos.otrosIngresos,
        cuentaBancaria: datos.cuentaBancaria || null,
        telefono: datos.telefono || null,
        horasCapacidadDiaria: datos.horasCapacidadDiaria,
        costoHoraManual: datos.costoHoraManual ?? null,
      },
    }),
    prisma.auditoria.create({
      data: {
        usuarioId: usuarioActual.id,
        empresaId,
        tablaAfectada: "empleados",
        registroId: empleadoId,
        accion: "editar",
        valorAnterior: { nombres: existente.nombres, sueldoBasico: existente.sueldoBasico.toString() },
        valorNuevo: { nombres: datos.nombres, sueldoBasico: datos.sueldoBasico.toString() },
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
