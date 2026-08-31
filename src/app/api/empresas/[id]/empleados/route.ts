import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { costoHoraEmpleado } from "@/lib/actividades";

export const dynamic = "force-dynamic";

const crearEmpleadoSchema = z.object({
  nombres: z.string().min(2),
  apellidos: z.string().min(2),
  docIdentidad: z.string().min(6, "Ingresa el DNI/CE del trabajador"),
  cargo: z.string().optional(),
  fechaIngreso: z.string(), // YYYY-MM-DD
  tipoContrato: z.string().optional(),
  sueldoBasico: z.number().min(0),
  otrosIngresos: z.number().min(0).default(0),
  cuentaBancaria: z.string().optional(),
  // Módulo Gestión de Actividades (empresas de Servicios):
  telefono: z.string().optional(), // WhatsApp, para avisar tareas asignadas
  horasCapacidadDiaria: z.number().min(0).max(24).default(9),
  costoHoraManual: z.number().min(0).optional(),
});

// GET /api/empresas/[id]/empleados
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "rrhh");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const empleados = await prisma.empleado.findMany({
    where: { empresaId, estado: "activo" },
    orderBy: { nombres: "asc" },
  });

  return NextResponse.json(
    empleados.map((e) => ({
      id: e.id.toString(),
      nombres: e.nombres,
      apellidos: e.apellidos,
      docIdentidad: e.docIdentidad,
      cargo: e.cargo,
      fechaIngreso: e.fechaIngreso,
      tipoContrato: e.tipoContrato,
      sueldoBasico: e.sueldoBasico.toString(),
      otrosIngresos: e.otrosIngresos.toString(),
      cuentaBancaria: e.cuentaBancaria,
      telefono: e.telefono,
      horasCapacidadDiaria: e.horasCapacidadDiaria.toString(),
      costoHoraManual: e.costoHoraManual ? e.costoHoraManual.toString() : null,
      costoHora: Number(costoHoraEmpleado(e).toFixed(2)),
    }))
  );
}

// POST /api/empresas/[id]/empleados — registra un trabajador con sus
// datos personales, de contrato y de remuneración.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "rrhh");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearEmpleadoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const empleado = await prisma.empleado.create({
    data: {
      empresaId,
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
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: usuarioActual.id,
      empresaId,
      tablaAfectada: "empleados",
      registroId: empleado.id,
      accion: "crear",
      valorNuevo: { nombres: empleado.nombres, apellidos: empleado.apellidos },
    },
  });

  return NextResponse.json({ id: empleado.id.toString() }, { status: 201 });
}
