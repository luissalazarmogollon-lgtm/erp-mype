import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

function aFechaISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Lunes de la semana que contiene `ref` (UTC, para no depender de zona horaria del servidor).
function lunesDeLaSemana(ref: Date) {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const diaSemana = d.getUTCDay(); // 0 = domingo
  const diff = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

// GET /api/empresas/[id]/actividades/carga-trabajo?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Reporte de carga laboral por trabajador por día: cuántas horas tiene
// asignadas cada día frente a su capacidad diaria, para decidir si se le
// puede seguir asignando trabajo o ya está al tope. Por defecto, la
// semana (lunes a domingo) que contiene hoy.
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
  const desdeParam = searchParams.get("desde");
  const hastaParam = searchParams.get("hasta");

  const desde = desdeParam ? new Date(desdeParam) : lunesDeLaSemana(new Date());
  let hasta: Date;
  if (hastaParam) {
    hasta = new Date(hastaParam);
  } else {
    hasta = new Date(desde);
    hasta.setUTCDate(hasta.getUTCDate() + 6);
  }

  const dias: string[] = [];
  for (let d = new Date(desde); d <= hasta; d.setUTCDate(d.getUTCDate() + 1)) {
    dias.push(aFechaISO(d));
  }

  const [empleados, tareas] = await Promise.all([
    prisma.empleado.findMany({ where: { empresaId, estado: "activo" }, orderBy: { nombres: "asc" } }),
    prisma.tarea.findMany({
      where: { empresaId, fecha: { gte: desde, lte: hasta }, estado: { notIn: ["completada", "archivada"] } },
    }),
  ]);

  const porEmpleadoDia = new Map<string, Map<string, number>>();
  for (const t of tareas) {
    const claveEmpleado = t.empleadoId.toString();
    const claveFecha = aFechaISO(t.fecha);
    if (!porEmpleadoDia.has(claveEmpleado)) porEmpleadoDia.set(claveEmpleado, new Map());
    const porDia = porEmpleadoDia.get(claveEmpleado)!;
    porDia.set(claveFecha, (porDia.get(claveFecha) ?? 0) + Number(t.horasEstimadas));
  }

  const resultado = empleados.map((e) => {
    const capacidadDiaria = Number(e.horasCapacidadDiaria);
    const porDiaMapa = porEmpleadoDia.get(e.id.toString()) ?? new Map();
    const porDia = dias.map((fecha) => {
      const horas = Number((porDiaMapa.get(fecha) ?? 0).toFixed(1));
      return { fecha, horas, capacidadDiaria, excede: horas > capacidadDiaria };
    });
    const totalPeriodo = porDia.reduce((acc, d) => acc + d.horas, 0);
    return {
      empleadoId: e.id.toString(),
      nombre: `${e.nombres} ${e.apellidos}`,
      capacidadDiaria,
      porDia,
      totalPeriodo: Number(totalPeriodo.toFixed(1)),
    };
  });

  return NextResponse.json({
    desde: aFechaISO(desde),
    hasta: aFechaISO(hasta),
    dias,
    empleados: resultado,
  });
}
