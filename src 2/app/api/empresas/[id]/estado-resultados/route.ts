import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/estado-resultados?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&localId=123
//
// Estado de Resultados completo, calculado EN VIVO (sin cierre de período):
//
//   Ventas totales
//   (−) Costo de Ventas                    [costo_directo + mano_obra_directa]
//   = Utilidad Bruta
//   (−) Gasto Operativo                    [gasto_operativo]
//   = EBITDA                               (utilidad antes de intereses,
//                                            impuestos, depreciación y
//                                            amortización)
//   (−) Depreciación y Amortización        [0 por ahora — se activa cuando
//                                            exista el módulo de Activos Fijos]
//   = Utilidad Operativa (EBIT)
//   (−) Gasto Financiero                   [gasto_financiero, incluye intereses]
//   = Utilidad Antes de Impuestos (EBT)
//   (−) Gasto Tributario                   [gasto_tributario]
//   (−) Otros Egresos                      [otros]
//   = Utilidad Neta
//
// Aparte, un bloque de "egreso de caja total": a diferencia de las líneas
// de arriba (que son POR DEVENGADO — cuentan un gasto a crédito aunque
// todavía no se haya pagado, como corresponde en un Estado de Resultados),
// este bloque es POR CAJA — cuánto dinero salió realmente en el período:
// los gastos al contado (se pagan al momento) más los pagos de Cuentas
// por Pagar registrados en el período (un gasto a crédito de un mes
// puede pagarse recién el mes siguiente, y ese pago cuenta en el período
// en que ocurre, no en el que se registró el gasto). Incluye
// activo/deuda/retiro de socios, que no afectan este estado.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "estado_resultados");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const hoy = new Date();
  const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  const desde = searchParams.get("desde") ? new Date(searchParams.get("desde")!) : inicioMesActual;
  const hasta = searchParams.get("hasta") ? new Date(searchParams.get("hasta")!) : hoy;
  // "hasta" llega como fecha sin hora (YYYY-MM-DD), que se interpreta como
  // medianoche exacta — sin este ajuste, cualquier venta/crédito/gasto
  // registrado después de las 00:00:00 de ese día queda fuera del rango
  // (en la práctica, esto excluía casi siempre lo del día "hasta").
  hasta.setHours(23, 59, 59, 999);
  const localIdParam = searchParams.get("localId");
  const localId = localIdParam ? BigInt(localIdParam) : undefined;

  const [ventasDiarias, creditosOtorgados, gastos, pagosCxp] = await Promise.all([
    prisma.registroVentaDiaria.findMany({
      where: { empresaId, fecha: { gte: desde, lte: hasta }, ...(localId ? { localId } : {}) },
    }),
    localId
      ? Promise.resolve([])
      : prisma.cuentaPorCobrar.findMany({ where: { empresaId, fechaEmision: { gte: desde, lte: hasta } } }),
    prisma.gasto.findMany({
      where: { empresaId, fecha: { gte: desde, lte: hasta }, ...(localId ? { localId } : {}) },
    }),
    // Pagos de CxP realizados EN EL PERÍODO (independiente de cuándo se
    // registró el gasto original a crédito) — es la parte de "egreso de
    // caja" que corresponde a deudas que se venían arrastrando.
    prisma.pagoCxp.findMany({
      where: {
        fecha: { gte: desde, lte: hasta },
        cxp: {
          empresaId,
          ...(localId ? { OR: [{ gasto: { localId } }, { documentoCompra: { localId } }] } : {}),
        },
      },
    }),
  ]);

  const ventasPorMetodoPago = ventasDiarias.reduce(
    (acc, r) => ({
      efectivo: acc.efectivo + Number(r.montoEfectivo),
      yape: acc.yape + Number(r.montoYape),
      plin: acc.plin + Number(r.montoPlin),
      tarjeta: acc.tarjeta + Number(r.montoTarjeta),
    }),
    { efectivo: 0, yape: 0, plin: 0, tarjeta: 0 }
  );

  const totalVentasDiarias =
    ventasPorMetodoPago.efectivo + ventasPorMetodoPago.yape + ventasPorMetodoPago.plin + ventasPorMetodoPago.tarjeta;
  const totalCreditos = creditosOtorgados.reduce((acc, c) => acc + Number(c.montoTotal), 0);
  const ventasTotales = totalVentasDiarias + totalCreditos;

  // g.naturaleza puede ser NULL (ítem de una factura por pagar todavía
  // sin clasificar) — mientras tanto no cuenta en ningún grupo, así el
  // Estado de Resultados nunca muestra un gasto mal clasificado.
  const sumaPorNaturaleza = (naturalezas: string[]) =>
    gastos.filter((g) => g.naturaleza !== null && naturalezas.includes(g.naturaleza)).reduce((acc, g) => acc + Number(g.montoTotal), 0);

  const costoVentas = sumaPorNaturaleza(["costo_directo", "mano_obra_directa"]);
  const gastoOperativo = sumaPorNaturaleza(["gasto_operativo"]);
  const gastoFinanciero = sumaPorNaturaleza(["gasto_financiero"]);
  const gastoTributario = sumaPorNaturaleza(["gasto_tributario"]);
  const otrosEgresos = sumaPorNaturaleza(["otros"]);

  // Depreciación y amortización: placeholder hasta que exista el módulo
  // de Activos Fijos con cálculo automático de depreciación mensual.
  const depreciacionAmortizacion = 0;

  const utilidadBruta = ventasTotales - costoVentas;
  const ebitda = utilidadBruta - gastoOperativo;
  const utilidadOperativa = ebitda - depreciacionAmortizacion; // EBIT
  const utilidadAntesImpuestos = utilidadOperativa - gastoFinanciero; // EBT
  const utilidadNeta = utilidadAntesImpuestos - gastoTributario - otrosEgresos;

  // Por caja, no por devengado: los gastos al contado se pagan en el
  // acto, así que su monto total ya es caja que salió; los gastos a
  // crédito NO cuentan aquí por su monto total (todavía no se pagan) —
  // lo que sí cuenta es cada pago real que se les haya hecho en el
  // período, sin importar cuándo se registró el gasto original.
  const egresoCajaContado = gastos
    .filter((g) => g.condicion === "contado")
    .reduce((acc, g) => acc + Number(g.montoTotal), 0);
  const egresoCajaPagosCredito = pagosCxp.reduce((acc, p) => acc + Number(p.monto), 0);
  const egresoCajaTotal = egresoCajaContado + egresoCajaPagosCredito;
  // Nota: este desglose por naturaleza sigue siendo por devengado (no
  // reparte pagosCxp por naturaleza cuando un documento mezcla varias) —
  // es una referencia de a qué se destinó el gasto, no una cifra de caja.
  const egresoCajaNoOperativo = sumaPorNaturaleza(["activo", "deuda", "retiro_socios"]);

  const detallePorNaturaleza: Record<string, number> = {};
  for (const g of gastos) {
    const clave = g.naturaleza ?? "sin_clasificar";
    detallePorNaturaleza[clave] = (detallePorNaturaleza[clave] ?? 0) + Number(g.montoTotal);
  }

  const pct = (valor: number) => (ventasTotales > 0 ? (valor / ventasTotales) * 100 : 0);

  return NextResponse.json({
    rango: { desde: desde.toISOString().slice(0, 10), hasta: hasta.toISOString().slice(0, 10) },
    ventas: {
      porMetodoPago: ventasPorMetodoPago,
      creditos: totalCreditos,
      total: ventasTotales,
    },
    costoVentas,
    utilidadBruta,
    margenBrutoPct: pct(utilidadBruta),
    gastoOperativo,
    ebitda,
    margenEbitdaPct: pct(ebitda),
    depreciacionAmortizacion,
    utilidadOperativa,
    margenOperativoPct: pct(utilidadOperativa),
    gastoFinanciero,
    utilidadAntesImpuestos,
    gastoTributario,
    otrosEgresos,
    utilidadNeta,
    margenNetoPct: pct(utilidadNeta),
    egresoCajaTotal,
    egresoCajaContado,
    egresoCajaPagosCredito,
    egresoCajaNoOperativo,
    detallePorNaturaleza,
  });
}
