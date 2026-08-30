import type { Prisma } from "@prisma/client";

// Resultado de consumir inventario en orden PEPS (más antiguo primero).
export type ConsumoPepsResultado = {
  // Cuánto se pudo cubrir realmente contra lotes reales, con su costo real.
  cubierto: number;
  // Si los lotes disponibles no alcanzaron a cubrir toda la cantidad
  // pedida, la diferencia queda aquí. Puede pasar con insumos que tuvieron
  // ventas/mermas registradas ANTES de este fix (que no tocaban lotes) —
  // no se lanza error para no bloquear la operación; quien llama decide
  // cómo cubrir esa diferencia (normalmente con el costo promedio actual).
  faltante: number;
};

/**
 * Consume `cantidad` unidades de un insumo en orden PEPS (lote más antiguo
 * primero): descuenta cada LoteCompra tocado y registra un
 * MovimientoInventario por cada uno con su costo real — el mismo patrón
 * que ya usan Despacho de Solicitudes y Ajuste de Stock (RN-031/Sprint 5).
 *
 * Antes de este fix, Ventas y Mermas descontaban stockActual directamente
 * SIN tocar los lotes, así que con el tiempo la suma de lotes disponibles
 * quedaba mayor a la real — Despacho/Ajuste asumen que ambos coinciden, y
 * esa desincronización podía dejarlos consumir de lotes que ya no
 * correspondían a inventario real. Esta función centraliza el consumo
 * PEPS para que Ventas y Mermas queden consistentes con el resto.
 */
export async function consumirLotesPeps(
  tx: Prisma.TransactionClient,
  params: {
    insumoId: bigint;
    cantidad: number;
    empresaId: bigint;
    tipo: string;
    referenciaTipo: string;
    referenciaId: bigint;
    usuarioId: string;
  }
): Promise<ConsumoPepsResultado> {
  const { insumoId, cantidad, empresaId, tipo, referenciaTipo, referenciaId, usuarioId } = params;

  let faltante = cantidad;

  const lotes = await tx.loteCompra.findMany({
    where: { insumoId, cantidadDisponible: { gt: 0 } },
    orderBy: { fechaIngreso: "asc" },
  });

  for (const lote of lotes) {
    if (faltante <= 0) break;
    const disponibleLote = Number(lote.cantidadDisponible);
    const consumir = Math.min(disponibleLote, faltante);

    await tx.loteCompra.update({
      where: { id: lote.id },
      data: { cantidadDisponible: disponibleLote - consumir },
    });
    await tx.movimientoInventario.create({
      data: {
        empresaId,
        insumoId,
        tipo,
        cantidad: -consumir,
        costoUnitario: lote.costoUnitario,
        loteId: lote.id,
        usuarioId,
        referenciaTipo,
        referenciaId,
      },
    });

    faltante -= consumir;
  }

  return { cubierto: cantidad - faltante, faltante };
}

/**
 * Registra el movimiento de inventario para lo que los lotes NO alcanzaron
 * a cubrir (ver `consumirLotesPeps`) — usando el costo promedio actual del
 * insumo, sin lote asociado (`loteId: null`), para que quede visible en el
 * Kardex en vez de perderse silenciosamente.
 */
export async function registrarFaltanteSinLote(
  tx: Prisma.TransactionClient,
  params: {
    insumoId: bigint;
    cantidad: number;
    empresaId: bigint;
    tipo: string;
    referenciaTipo: string;
    referenciaId: bigint;
    usuarioId: string;
    costoUnitario: number;
  }
) {
  const { insumoId, cantidad, empresaId, tipo, referenciaTipo, referenciaId, usuarioId, costoUnitario } = params;
  if (cantidad <= 0) return;
  await tx.movimientoInventario.create({
    data: {
      empresaId,
      insumoId,
      tipo,
      cantidad: -cantidad,
      costoUnitario,
      loteId: null,
      usuarioId,
      referenciaTipo,
      referenciaId,
    },
  });
}
