import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoAlguno } from "@/lib/auth";

export const dynamic = "force-dynamic";

const cobroSchema = z.object({
  monto: z.number().positive(),
  medioPago: z.string().optional(),
  cuentaBancariaId: z.string().optional(),
});

// POST /api/empresas/[id]/cuentas-por-cobrar/[cxcId]/cobro
// Si se indica cuentaBancariaId, genera el movimiento bancario de INGRESO
// (el cliente pagó y ese dinero entra a la cuenta indicada). Acepta
// "creditos" o "ventas_diarias" — ver la nota en cuentas-por-cobrar/route.ts.
export async function POST(
  request: Request,
  { params }: { params: { id: string; cxcId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoAlguno(usuarioActual.id, empresaId, ["creditos", "ventas_diarias"]);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = cobroSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const cxcId = BigInt(params.cxcId);
  const cxc = await prisma.cuentaPorCobrar.findFirst({ where: { id: cxcId, empresaId }, include: { cliente: true } });
  if (!cxc) return NextResponse.json({ error: "Cuenta por cobrar no encontrada" }, { status: 404 });

  const saldoActual = Number(cxc.saldoPendiente);
  if (datos.monto > saldoActual) {
    return NextResponse.json(
      { error: `El cobro (${datos.monto}) es mayor al saldo pendiente (${saldoActual})` },
      { status: 400 }
    );
  }

  const nuevoSaldo = saldoActual - datos.monto;
  const cuentaBancariaId = datos.cuentaBancariaId ? BigInt(datos.cuentaBancariaId) : null;
  const usuarioId = usuarioActual.id;

  const cxcActualizada = await prisma.$transaction(async (tx) => {
    await tx.cobroCxc.create({
      data: { cxcId, monto: datos.monto, medioPago: datos.medioPago || null, cuentaBancariaId, usuarioId },
    });

    const actualizada = await tx.cuentaPorCobrar.update({
      where: { id: cxcId },
      data: { saldoPendiente: nuevoSaldo, estado: nuevoSaldo <= 0 ? "pagada" : "pendiente" },
    });

    if (cuentaBancariaId) {
      await tx.movimientoBancario.create({
        data: {
          cuentaBancariaId,
          tipo: "ingreso",
          monto: datos.monto,
          concepto: `Cobro a ${cxc.cliente.nombre}`,
          referenciaTipo: "cobro_cxc",
          referenciaId: cxcId,
          usuarioId,
        },
      });
      await tx.cuentaBancaria.update({
        where: { id: cuentaBancariaId },
        data: { saldoActual: { increment: datos.monto } },
      });
    }

    return actualizada;
  });

  return NextResponse.json({
    saldoPendiente: cxcActualizada.saldoPendiente.toString(),
    estado: cxcActualizada.estado,
  });
}
