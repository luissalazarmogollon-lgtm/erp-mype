import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const crearCajaChicaSchema = z.object({
  nombre: z.string().min(2),
  cuentaBancariaId: z.string().optional(),
  montoFondo: z.number().min(0).default(0),
});

// GET /api/empresas/[id]/caja-chica — lista las cajas chicas de la empresa.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "caja_chica");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const cajas = await prisma.cajaChica.findMany({
    where: { empresaId, estado: "activo" },
    include: { cuentaBancaria: true },
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json(
    cajas.map((c) => ({
      id: c.id.toString(),
      nombre: c.nombre,
      cuentaBancaria: c.cuentaBancaria?.bancoNombre ?? null,
      montoFondo: c.montoFondo.toString(),
    }))
  );
}

// POST /api/empresas/[id]/caja-chica — crea una caja chica. Si se indica
// cuentaBancariaId y montoFondo > 0, ese dinero sale de esa cuenta (egreso
// en el flujo de caja) y pasa a ser el fondo inicial de la caja chica —
// esta salida NO es un Gasto (no aparece en Gastos y Costos).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "flujo_caja");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearCajaChicaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const cuentaBancariaId = datos.cuentaBancariaId ? BigInt(datos.cuentaBancariaId) : null;
  const usuarioId = usuarioActual.id;

  const caja = await prisma.$transaction(async (tx) => {
    const nuevaCaja = await tx.cajaChica.create({
      data: { empresaId, nombre: datos.nombre, cuentaBancariaId, montoFondo: datos.montoFondo },
    });

    if (cuentaBancariaId && datos.montoFondo > 0) {
      await tx.movimientoCajaChica.create({
        data: { cajaChicaId: nuevaCaja.id, tipo: "fondo", monto: datos.montoFondo, usuarioId },
      });
      await tx.movimientoBancario.create({
        data: {
          cuentaBancariaId,
          tipo: "egreso",
          monto: datos.montoFondo,
          concepto: `Fondo inicial caja chica — ${datos.nombre}`,
          referenciaTipo: "caja_chica",
          referenciaId: nuevaCaja.id,
          usuarioId,
        },
      });
      await tx.cuentaBancaria.update({
        where: { id: cuentaBancariaId },
        data: { saldoActual: { decrement: datos.montoFondo } },
      });
    }

    return nuevaCaja;
  });

  return NextResponse.json({ id: caja.id.toString() }, { status: 201 });
}
