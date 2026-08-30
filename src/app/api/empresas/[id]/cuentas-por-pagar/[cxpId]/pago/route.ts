import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
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
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const cxpId = BigInt(params.cxpId);
  const cxp = await prisma.cuentaPorPagar.findFirst({
    where: { id: cxpId, empresaId },
    include: { gasto: true, documentoCompra: { include: { items: true } } },
  });
  if (!cxp) return NextResponse.json({ error: "Cuenta por pagar no encontrada" }, { status: 404 });

  // No se puede pagar una factura mientras alguno de sus ítems siga sin
  // clasificar (naturaleza=NULL) — si no, quedaría un pago hecho que
  // nunca se termina de clasificar y el Estado de Resultados queda mal.
  const itemsCxp = cxp.documentoCompra ? cxp.documentoCompra.items : cxp.gasto ? [cxp.gasto] : [];
  const faltaClasificar = itemsCxp.some((g) => !g.naturaleza);
  if (faltaClasificar) {
    return NextResponse.json(
      { error: "Antes de pagar, clasifica todos los ítems de esta factura (Naturaleza del egreso) en Cuentas por Pagar." },
      { status: 400 }
    );
  }

  const descripcionCxp = cxp.gasto
    ? cxp.gasto.descripcion
    : cxp.documentoCompra
    ? `documento ${cxp.documentoCompra.numeroComprobante ?? "sin número"}`
    : "compra";

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
          concepto: `Pago a ${cxp.proveedorNombre ?? "proveedor"} — ${descripcionCxp}`,
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
