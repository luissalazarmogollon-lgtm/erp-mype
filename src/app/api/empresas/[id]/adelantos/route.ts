import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const crearAdelantoSchema = z.object({
  empleadoId: z.string(),
  monto: z.number().positive(),
  fecha: z.string(), // YYYY-MM-DD
  motivo: z.string().optional(),
  cuentaBancariaId: z.string().optional(),
});

// GET /api/empresas/[id]/adelantos
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "rrhh");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const adelantos = await prisma.adelantoSueldo.findMany({
    where: { empresaId },
    include: { empleado: true },
    orderBy: { fecha: "desc" },
    take: 100,
  });

  return NextResponse.json(
    adelantos.map((a) => ({
      id: a.id.toString(),
      empleadoId: a.empleadoId.toString(),
      empleado: `${a.empleado.nombres} ${a.empleado.apellidos}`,
      monto: a.monto.toString(),
      fecha: a.fecha,
      motivo: a.motivo,
      estado: a.estado,
    }))
  );
}

// POST /api/empresas/[id]/adelantos — registra un adelanto de sueldo.
// No es un gasto (no afecta el Estado de Resultados): es dinero que sale
// de caja/banco y se descontará del sueldo del trabajador más adelante.
// Si se indica cuentaBancariaId, genera el movimiento bancario y descuenta
// el saldo de esa cuenta automáticamente.
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
  const parsed = crearAdelantoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const empleado = await prisma.empleado.findFirst({ where: { id: BigInt(datos.empleadoId), empresaId } });
  if (!empleado) return NextResponse.json({ error: "Trabajador no encontrado" }, { status: 404 });

  const cuentaBancariaId = datos.cuentaBancariaId ? BigInt(datos.cuentaBancariaId) : null;

  const adelanto = await prisma.$transaction(async (tx) => {
    const nuevoAdelanto = await tx.adelantoSueldo.create({
      data: {
        empresaId,
        empleadoId: empleado.id,
        monto: datos.monto,
        fecha: new Date(datos.fecha),
        motivo: datos.motivo || null,
        cuentaBancariaId,
        usuarioId: usuarioActual.id,
      },
    });

    if (cuentaBancariaId) {
      await tx.movimientoBancario.create({
        data: {
          cuentaBancariaId,
          tipo: "egreso",
          monto: datos.monto,
          concepto: `Adelanto de sueldo — ${empleado.nombres} ${empleado.apellidos}`,
          referenciaTipo: "adelanto_sueldo",
          referenciaId: nuevoAdelanto.id,
          usuarioId: usuarioActual.id,
        },
      });
      await tx.cuentaBancaria.update({
        where: { id: cuentaBancariaId },
        data: { saldoActual: { decrement: datos.monto } },
      });
    }

    return nuevoAdelanto;
  });

  return NextResponse.json({ id: adelanto.id.toString() }, { status: 201 });
}
