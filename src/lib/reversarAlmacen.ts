import { prisma } from "@/lib/prisma";

// Tipo del cliente transaccional de Prisma — igual patrón que ya se usa
// en gastos/[gastoId]/route.ts.
type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// ---------------------------------------------------------------------
// Reversión de Almacén/Compras — RN nueva (Fase 3).
//
// El usuario pidió poder eliminar Solicitudes de Pedido (incluso ya
// aprobadas/despachadas) y Pedidos de Compra ya recepcionados,
// "eliminando la operación que se haya generado en el Estado de
// Resultados". Estas dos funciones son el motor compartido que hace esa
// reversión — las usan tanto:
//   - DELETE /api/empresas/[id]/solicitudes-pedido/[solicitudId]
//   - DELETE /api/empresas/[id]/pedidos-compra/[pedidoCompraId]
//
// Regla de buenas prácticas aplicada en ambas (igual que ya hace este
// código en gastos/[gastoId]/route.ts y cuentas-por-pagar/[cxpId]/route.ts
// para cualquier reversión financiera): si el dinero YA salió de una
// cuenta bancaria (hay pagos registrados en Cuentas por Pagar), NO se
// reversa — se bloquea con un error claro. El Flujo de Caja jamás debe
// perder un pago real. Solo lo que todavía no impactó caja (o que
// todavía es 100% reversible en inventario) se puede deshacer aquí.
// ---------------------------------------------------------------------

/**
 * Reversa el DESPACHO de un ítem de Solicitud de Pedido (estadoItem
 * "despachado"): devuelve la cantidad consumida a sus lotes de origen,
 * restaura Insumo.stockActual, borra los movimientos de Kardex
 * ("salida_solicitud") y el Gasto de Costo de Venta ("despacho_almacen")
 * que generó — con eso desaparece del Estado de Resultados.
 *
 * `estadoFinal` decide en qué queda el ítem después de revertir:
 *   - "por_despachar" (default): como si nunca se hubiera entregado al
 *     área, pero conservando el stock que sí tiene disponible en almacén
 *     — es lo que usa el DELETE de toda la Solicitud (../[solicitudId]/
 *     route.ts), que sigue borrando la Solicitud completa justo después.
 *   - "eliminado": además deja `cantidadAprobada` en null (mismo criterio
 *     que el resto de "eliminados" de esta tabla) — lo usa el DELETE
 *     granular de un solo ítem despachado (.../detalle/[detalleId]/
 *     route.ts), que NO borra la Solicitud ni el resto de sus ítems, solo
 *     cancela este uno y todo lo que su despacho generó.
 *
 * El Gasto de despacho NUNCA tiene Cuenta por Pagar propia (es una
 * reclasificación de Inventario a Costo de Venta, no un nuevo movimiento
 * de caja — ver nota de diseño en despachar/route.ts), así que esta
 * reversión siempre es segura del lado financiero. Se revisa de todas
 * formas por seguridad, igual que hace gastos/[gastoId]/route.ts con
 * datos antiguos o manuales.
 */
export async function reversarDespachoItem(
  tx: PrismaTx,
  solicitudPedidoDetalleId: bigint,
  estadoFinal: "por_despachar" | "eliminado" = "por_despachar"
): Promise<{ cantidadRestaurada: number; montoReversado: number }> {
  const movimientos = await tx.movimientoInventario.findMany({
    where: { referenciaTipo: "solicitud_pedido_detalle", referenciaId: solicitudPedidoDetalleId },
  });

  let cantidadRestaurada = 0;
  let insumoId: bigint | null = null;

  for (const mov of movimientos) {
    const cantidadAbs = Math.abs(Number(mov.cantidad));
    if (mov.loteId) {
      await tx.loteCompra.update({
        where: { id: mov.loteId },
        data: { cantidadDisponible: { increment: cantidadAbs } },
      });
    }
    cantidadRestaurada += cantidadAbs;
    insumoId = mov.insumoId;
  }

  if (insumoId) {
    await tx.insumo.update({
      where: { id: insumoId },
      data: { stockActual: { increment: cantidadRestaurada } },
    });
  }

  await tx.movimientoInventario.deleteMany({
    where: { referenciaTipo: "solicitud_pedido_detalle", referenciaId: solicitudPedidoDetalleId },
  });

  let montoReversado = 0;
  const gasto = await tx.gasto.findUnique({ where: { solicitudPedidoDetalleId } });
  if (gasto) {
    const cxpPropia = await tx.cuentaPorPagar.findUnique({ where: { gastoId: gasto.id }, include: { pagos: true } });
    if (cxpPropia && cxpPropia.pagos.length > 0) {
      throw new Error(
        "Este consumo de almacén tiene pagos registrados en Cuentas por Pagar (dato inusual) — anúlalos antes de eliminar la solicitud."
      );
    }
    const movimientoBancario = await tx.movimientoBancario.findFirst({
      where: { referenciaTipo: "gasto", referenciaId: gasto.id },
    });
    if (movimientoBancario) {
      await tx.cuentaBancaria.update({
        where: { id: movimientoBancario.cuentaBancariaId },
        data: { saldoActual: { increment: movimientoBancario.monto } },
      });
      await tx.movimientoBancario.delete({ where: { id: movimientoBancario.id } });
    }
    if (cxpPropia) {
      await tx.cuentaPorPagar.delete({ where: { id: cxpPropia.id } });
    }
    montoReversado = Number(gasto.montoTotal);
    await tx.gasto.delete({ where: { id: gasto.id } });
  }

  await tx.solicitudPedidoDetalle.update({
    where: { id: solicitudPedidoDetalleId },
    data: {
      estadoItem: estadoFinal,
      fechaDespacho: null,
      ...(estadoFinal === "eliminado" ? { cantidadAprobada: null } : {}),
    },
  });

  return { cantidadRestaurada, montoReversado };
}

/**
 * Reversa una LÍNEA de Pedido de Compra — "la entrada de mercadería al
 * almacén". Si todavía no se había recepcionado, solo borra la línea (no
 * hay nada más que deshacer). Si ya se había recepcionado:
 *   1. Bloquea si esa mercadería ya fue despachada a un área (el ítem de
 *      la Solicitud ya está en "despachado") — hay que deshacer primero
 *      ese despacho (eliminando la Solicitud, que lo hace automáticamente
 *      en el orden correcto — ver DELETE de solicitudes-pedido).
 *   2. Bloquea si el lote que generó ya fue consumido parcial o
 *      totalmente por CUALQUIER otro motivo (verificación extra de
 *      seguridad, por si el punto 1 no lo detectó).
 *   3. Bloquea si la Cuenta por Pagar de esa recepción ya tiene pagos
 *      registrados (no se toca el Flujo de Caja).
 *   4. Si nada de eso aplica: revierte el lote, el Kardex, el stock y el
 *      costo promedio del insumo, y el Gasto/Documento de
 *      compra/Cuenta por Pagar que generó (activo — no tocaba el Estado
 *      de Resultados, así que esto no afecta el P&L, solo deshace la
 *      compra en sí). Devuelve el ítem de la Solicitud a
 *      "pendiente_compra" con la cantidad original del pedido, como si
 *      nunca se hubiera comprado.
 */
export async function reversarLineaCompra(
  tx: PrismaTx,
  pedidoCompraDetalleId: bigint
): Promise<{ pedidoCompraId: bigint; montoReversado: number }> {
  const detalle = await tx.pedidoCompraDetalle.findUniqueOrThrow({
    where: { id: pedidoCompraDetalleId },
    include: {
      insumo: true,
      solicitudDetalle: true,
      gasto: {
        include: {
          documentoCompra: { include: { cuentaPorPagar: { include: { pagos: true } }, items: true } },
        },
      },
    },
  });

  let montoReversado = 0;

  if (detalle.fechaRecepcion) {
    if (detalle.solicitudDetalle.estadoItem === "despachado") {
      throw new Error(
        `No se puede eliminar la compra de "${detalle.insumo.nombre}" — esa mercadería ya fue despachada a un área (ya es Costo de Venta). Elimina primero la Solicitud de Pedido que la recibió.`
      );
    }

    const lote = await tx.loteCompra.findFirst({
      where: { referenciaTipo: "pedido_compra_detalle", referenciaId: detalle.id },
    });
    if (lote) {
      const cantidadInicial = Number(lote.cantidadInicial);
      const cantidadDisponible = Number(lote.cantidadDisponible);
      if (cantidadDisponible < cantidadInicial) {
        throw new Error(
          `No se puede eliminar la compra de "${detalle.insumo.nombre}" — parte de ese lote ya se consumió por otro movimiento. Revisa el Kardex del insumo antes de continuar.`
        );
      }

      const insumo = await tx.insumo.findUniqueOrThrow({ where: { id: detalle.insumoId } });
      const stockActual = Number(insumo.stockActual);
      const costoActual = Number(insumo.costoPromedioActual);
      const nuevoStock = stockActual - cantidadInicial;
      if (nuevoStock < 0) {
        throw new Error(
          `Inconsistencia de stock al eliminar la compra de "${detalle.insumo.nombre}" (quedaría negativo) — contacta soporte antes de continuar.`
        );
      }
      // Inverso exacto del promedio ponderado (RN-031) aplicado al recibir
      // este lote — igual espíritu que la reducción manual en
      // insumos/[insumoId]/ajuste/route.ts.
      const nuevoCosto =
        nuevoStock > 0
          ? Math.max((stockActual * costoActual - cantidadInicial * Number(lote.costoUnitario)) / nuevoStock, 0)
          : 0;

      await tx.insumo.update({
        where: { id: detalle.insumoId },
        data: { stockActual: nuevoStock, costoPromedioActual: nuevoCosto },
      });
      await tx.movimientoInventario.deleteMany({
        where: { loteId: lote.id, referenciaTipo: "pedido_compra_detalle", referenciaId: detalle.id },
      });
      await tx.loteCompra.delete({ where: { id: lote.id } });
    }

    if (detalle.gasto) {
      const gasto = detalle.gasto;
      const documentoCompra = gasto.documentoCompra;
      const cxp = documentoCompra?.cuentaPorPagar ?? null;
      if (cxp && cxp.pagos.length > 0) {
        throw new Error(
          `La compra de "${detalle.insumo.nombre}" ya tiene pagos registrados en Cuentas por Pagar — anúlalos antes de eliminar esta recepción.`
        );
      }
      const movimientoBancario = await tx.movimientoBancario.findFirst({
        where: { referenciaTipo: "gasto", referenciaId: gasto.id },
      });
      if (movimientoBancario) {
        await tx.cuentaBancaria.update({
          where: { id: movimientoBancario.cuentaBancariaId },
          data: { saldoActual: { increment: movimientoBancario.monto } },
        });
        await tx.movimientoBancario.delete({ where: { id: movimientoBancario.id } });
      }

      montoReversado = Number(gasto.montoTotal);

      if (documentoCompra) {
        const otrosItems = documentoCompra.items.filter((i) => i.id !== gasto.id);
        if (cxp) {
          if (otrosItems.length === 0) {
            await tx.cuentaPorPagar.delete({ where: { id: cxp.id } });
          } else {
            await tx.cuentaPorPagar.update({
              where: { id: cxp.id },
              data: { montoTotal: { decrement: montoReversado }, saldoPendiente: { decrement: montoReversado } },
            });
          }
        }
        await tx.gasto.delete({ where: { id: gasto.id } });
        if (otrosItems.length === 0) {
          // Rompe primero la FK del Pedido de Compra hacia este documento
          // (es @unique — Postgres rechaza borrar el documento mientras
          // algo lo siga referenciando) antes de borrar el documento.
          await tx.pedidoCompra.update({
            where: { id: detalle.pedidoCompraId },
            data: { documentoCompraId: null },
          });
          await tx.documentoCompra.delete({ where: { id: documentoCompra.id } });
        } else {
          await tx.documentoCompra.update({
            where: { id: documentoCompra.id },
            data: { montoTotal: { decrement: montoReversado } },
          });
        }
      } else {
        await tx.gasto.delete({ where: { id: gasto.id } });
      }
    }

    // El ítem de la Solicitud vuelve a "pendiente_compra" con la cantidad
    // original del pedido — como si nunca se hubiera comprado.
    await tx.solicitudPedidoDetalle.update({
      where: { id: detalle.solicitudDetalleId },
      data: { estadoItem: "pendiente_compra", cantidadAprobada: detalle.cantidad },
    });
  }

  await tx.pedidoCompraDetalle.delete({ where: { id: detalle.id } });

  return { pedidoCompraId: detalle.pedidoCompraId, montoReversado };
}
