import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const devolverSchema = z.object({
  monto: z.number().positive(),
  cuentaBancariaId: z.string().optional(),
});

// POST /api/empresas/[id]/caja-chica/[cajaChicaId]/devolver
//
// Devuelve dinero sobrante de la caja chica a una cuenta bancaria — el
// movimiento inverso a "reponer": en vez de sacar plata del banco hacia
// la caja, mete de vuelta al banco lo que quedó sin gastar. Baja el
// fondo disponible de la caja (hasta dejarlo en cero, si se devuelve
// todo) y ese mismo monto entra como ingreso a la cuenta bancaria — así
// la caja queda lista para recibir un nuevo fondo/reposición desde cero,
// sin arrastrar el sobrante del ciclo anterior.
//
// A diferencia de "reponer" (donde la cuenta bancaria es opcional), aquí
// SÍ es obligatoria: la devolución es justamente una transferencia hacia
// el banco, así que tiene que quedar registrado a qué cuenta entró.
export async function POST(
  request: Request,
  { params }: { params: { id: string; cajaChicaId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "flujo_caja");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = devolverSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const cajaChicaId = BigInt(params.cajaChicaId);
  const caja = await prisma.cajaChica.findFirst({ where: { id: cajaChicaId, empresaId } });
  if (!caja) return NextResponse.json({ error: "Caja chica no encontrada" }, { status: 404 });

  const fondoDisponible = Number(caja.montoFondo);
  if (datos.monto > fondoDisponible) {
    return NextResponse.json(
      { error: `El monto a devolver (${datos.monto}) supera el fondo disponible en caja chica (${fondoDisponible})` },
      { status: 400 }
    );
  }

  const cuentaBancariaId = datos.cuentaBancariaId ? BigInt(datos.cuentaBancariaId) : caja.cuentaBancariaId;
  if (!cuentaBancariaId) {
    return NextResponse.json(
      { error: "Indica a qué cuenta bancaria se devuelve el dinero." },
      { status: 400 }
    );
  }

  const usuarioId = usuarioActual.id;

  await prisma.$transaction(async (tx) => {
    await tx.cajaChica.update({
      where: { id: cajaChicaId },
      data: { montoFondo: { decrement: datos.monto } },
    });
    await tx.movimientoCajaChica.create({
      data: { cajaChicaId, tipo: "devolucion", monto: datos.monto, usuarioId },
    });
    await tx.movimientoBancario.create({
      data: {
        cuentaBancariaId,
        tipo: "ingreso",
        monto: datos.monto,
        concepto: `Devolución de sobrante de caja chica — ${caja.nombre}`,
        referenciaTipo: "caja_chica",
        referenciaId: cajaChicaId,
        usuarioId,
      },
    });
    await tx.cuentaBancaria.update({
      where: { id: cuentaBancariaId },
      data: { saldoActual: { increment: datos.monto } },
    });
  });

  return NextResponse.json({ ok: true });
}
