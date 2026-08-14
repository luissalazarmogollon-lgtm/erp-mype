import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const pagoSchema = z.object({
  monto: z.number().positive(),
  medioPago: z.string().optional(),
  cuentaBancariaId: z.string().optional(),
});

// POST /api/empresas/[id]/cuentas-por-pagar/[cxpId]/pago
// Si se indica cuentaBancariaId, genera el movimiento bancario de egreso
// y descuenta el saldo de esa cuenta (flujo de caja por cuenta).
export async function POST(
  request: Request,
  { params }: { params: { id: string; cxpId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "cuentas_por_pagar");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = pagoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const datos = parsed.data;

  const cxpId = BigInt(params.cxpId);
  const cxp = await prisma.cuentaPorPagar.findFirst({ where: { id: cxpId, empresaId }, include: { gasto: true } });
  if (!cxp) return NextResponse.json({ error: "Cuenta por pagar no encontrada" }, { status: 404 });

  const saldoActual = Number(cxp.saldoPendiente);
  if (datos.monto > saldoActual) {
    return NextResponse.json(
      { error: `El pago (${datos.monto}) es mayor al saldo pendiente (${saldoActual})` },
      { status: 400 }
    );
  }

  const nuevoSaldo = saldoActual - datos.monto;
  const cuentaBancariaId = datos.cuentaBancariaId ? BigInt(datos.cuentaBancariaId) : null;
  const usuarioId = usuarioActual.id;

  const cxpActualizada = await prisma.$transaction(async (tx) => {
    await tx.pagoCxp.create({
      data: { cxpId, monto: datos.monto, medioPago: datos.medioPago || null, cuentaBancariaId, usuarioId },
    });

    const actualizada = await tx.cuentaPorPagar.update({
      where: { id: cxpId },
      data: { saldoPendiente: nuevoSaldo, estado: nuevoSaldo <= 0 ? "pagada" : "pendiente" },
    });

    if (cuentaBancariaId) {
      await tx.movimientoBancario.create({
        data: {
          cuentaBancariaId,
          tipo: "egreso",
          monto: datos.monto,
          concepto: `Pago a ${cxp.proveedorNombre ?? "proveedor"} — ${cxp.gasto.descripcion}`,
          referenciaTipo: "pago_cxp",
          referenciaId: cxpId,
          usuarioId,
        },
      });
      await tx.cuentaBancaria.update({
        where: { id: cuentaBancariaId },
        data: { saldoActual: { decrement: datos.monto } },
      });
    }

    return actualizada;
  });

  return NextResponse.json({
    saldoPendiente: cxpActualizada.saldoPendiente.toString(),
    estado: cxpActualizada.estado,
  });
}
