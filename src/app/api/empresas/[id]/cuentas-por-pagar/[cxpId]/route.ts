import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoAlguno, requiereSuperadmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// DELETE /api/empresas/[id]/cuentas-por-pagar/[cxpId]
//
// Elimina una factura por pagar registrada (la cuenta por pagar completa,
// con todos sus ítems de Gasto) — acción destructiva sobre datos
// financieros, reservada exclusivamente al superadmin de la plataforma,
// en cualquier empresa (igual que "Eliminar empresa" / "Vaciar datos").
//
// - Si ya tiene pagos registrados, se BLOQUEA: hay que anularlos primero
//   (no existe hoy una forma de "deshacer" un PagoCxp individual, así que
//   en la práctica esto protege cualquier factura que ya se empezó a pagar).
// - Si la CxP viene de un gasto suelto (gastoId): se elimina la CxP y ese
//   gasto.
// - Si viene de un "Documento con varios ítems" (documentoCompraId): se
//   elimina la CxP, todos los ítems (Gasto) del documento, y el documento
//   mismo — es la factura completa, no una línea suelta.
// - Si algún ítem viene de un traslado de Caja Chica, se bloquea (se
//   administra desde ese módulo).
export async function DELETE(request: Request, { params }: { params: { id: string; cxpId: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    // Solo se exige el permiso normal de Cuentas por Pagar para confirmar
    // que la empresa existe y el usuario tiene relación con ella; la
    // acción de eliminar en sí queda reservada al superadmin.
    await verificarAccesoAlguno(usuarioActual.id, empresaId, ["cuentas_por_pagar", "cuentas_por_pagar_registrar"]);
    requiereSuperadmin(usuarioActual);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const cxpId = BigInt(params.cxpId);
  const usuarioId = usuarioActual.id;

  try {
    await prisma.$transaction(async (tx) => {
      const cxp = await tx.cuentaPorPagar.findFirst({
        where: { id: cxpId, empresaId },
        include: {
          pagos: true,
          gasto: { include: { gastoCajaChica: true } },
          documentoCompra: { include: { items: { include: { gastoCajaChica: true } } } },
        },
      });
      if (!cxp) throw new Error("__404__");

      if (cxp.pagos.length > 0) {
        throw new Error(
          "Esta factura ya tiene pagos registrados — no se puede eliminar. Anula esos pagos antes de intentarlo de nuevo."
        );
      }

      const itemsAfectados = cxp.documentoCompra ? cxp.documentoCompra.items : cxp.gasto ? [cxp.gasto] : [];
      if (itemsAfectados.some((g) => g.gastoCajaChica)) {
        throw new Error("Uno de los ítems de esta factura viene de un traslado de Caja Chica — elimínalo desde ese módulo.");
      }

      // Reversar cualquier movimiento bancario propio de sus ítems (en la
      // práctica no debería existir ninguno, porque un ítem a crédito
      // nunca genera movimiento bancario directo, pero se revisa por
      // seguridad ante datos antiguos o manuales).
      for (const item of itemsAfectados) {
        const movimiento = await tx.movimientoBancario.findFirst({
          where: { referenciaTipo: "gasto", referenciaId: item.id },
        });
        if (movimiento) {
          await tx.cuentaBancaria.update({
            where: { id: movimiento.cuentaBancariaId },
            data: { saldoActual: { increment: movimiento.monto } },
          });
          await tx.movimientoBancario.delete({ where: { id: movimiento.id } });
        }
      }

      // Orden seguro por las relaciones: primero la CxP (nada depende de
      // ella salvo los pagos, ya verificados en cero), luego los ítems de
      // Gasto, y al final el documento de compra (si existía).
      await tx.cuentaPorPagar.delete({ where: { id: cxp.id } });

      for (const item of itemsAfectados) {
        await tx.gasto.delete({ where: { id: item.id } });
      }

      if (cxp.documentoCompra) {
        await tx.documentoCompra.delete({ where: { id: cxp.documentoCompra.id } });
      }

      await tx.auditoria.create({
        data: {
          usuarioId,
          empresaId,
          tablaAfectada: "cuentas_por_pagar",
          registroId: cxp.id,
          accion: "eliminar",
          valorAnterior: {
            proveedorNombre: cxp.proveedorNombre,
            montoTotal: cxp.montoTotal.toString(),
            items: itemsAfectados.map((g) => ({ descripcion: g.descripcion, monto: g.montoTotal.toString() })),
          },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const mensaje = (error as Error).message;
    if (mensaje === "__404__") return NextResponse.json({ error: "Cuenta por pagar no encontrada" }, { status: 404 });
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }
}
