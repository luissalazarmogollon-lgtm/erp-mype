import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/estado-resultados?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&localId=123
//
// Calcula el Estado de Resultados EN VIVO. Consolida automáticamente
// todos los locales de la empresa salvo que se pase `localId` para ver
// uno en particular.
//
// LÓGICA CONTABLE CLAVE (separación egreso de caja vs. impacto en resultado):
// - costo_directo + mano_obra_directa  → Costo de Ventas
// - gasto_operativo                    → Gasto Operativo
// - gasto_financiero                   → Gasto Financiero (incluye intereses de deuda)
// - gasto_tributario                   → Gasto Tributario
// - otros                              → Otros Egresos
// - activo, deuda (capital), retiro_socios → NO afectan el resultado, pero
//   sí se cuentan en "egresoCajaTotal" (cuánto dinero salió de la empresa).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const hoy = new Date();
  const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  const desde = searchParams.get("desde") ? new Date(searchParams.get("desde")!) : inicioMesActual;
  const hasta = searchParams.get("hasta") ? new Date(searchParams.get("hasta")!) : hoy;
  const localIdParam = searchParams.get("localId");
  const localId = localIdParam ? BigInt(localIdParam) : undefined;

  const [ventasDiarias, creditosOtorgados, gastos] = await Promise.all([
    prisma.registroVentaDiaria.findMany({
      where: { empresaId, fecha: { gte: desde, lte: hasta }, ...(localId ? { localId } : {}) },
    }),
    // Los créditos a clientes no tienen local hoy (son por cliente, no por
    // punto de venta) — se incluyen completos salvo que se filtre por local,
    // caso en el que se excluyen (no hay forma de saber a qué local pertenecen).
    localId
      ? Promise.resolve([])
      : prisma.cuentaPorCobrar.findMany({ where: { empresaId, fechaEmision: { gte: desde, lte: hasta } } }),
    prisma.gasto.findMany({
      where: { empresaId, fecha: { gte: desde, lte: hasta }, ...(localId ? { localId } : {}) },
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

  const sumaPorNaturaleza = (naturalezas: string[]) =>
    gastos.filter((g) => naturalezas.includes(g.naturaleza)).reduce((acc, g) => acc + Number(g.montoTotal), 0);

  const costoVentas = sumaPorNaturaleza(["costo_directo", "mano_obra_directa"]);
  const gastoOperativo = sumaPorNaturaleza(["gasto_operativo"]);
  const gastoFinanciero = sumaPorNaturaleza(["gasto_financiero"]);
  const gastoTributario = sumaPorNaturaleza(["gasto_tributario"]);
  const otrosEgresos = sumaPorNaturaleza(["otros"]);

  const utilidadBruta = ventasTotales - costoVentas;
  const utilidadOperativa = utilidadBruta - gastoOperativo;
  const utilidadNeta = utilidadOperativa - gastoFinanciero - gastoTributario - otrosEgresos;

  // La pregunta "¿cuánto dinero salió de la empresa?" — TODO egreso de
  // caja, sin importar si afecta o no el resultado.
  const egresoCajaTotal = gastos.reduce((acc, g) => acc + Number(g.montoTotal), 0);
  const egresoCajaNoOperativo = sumaPorNaturaleza(["activo", "deuda", "retiro_socios"]);

  const detallePorNaturaleza: Record<string, number> = {};
  for (const g of gastos) {
    detallePorNaturaleza[g.naturaleza] = (detallePorNaturaleza[g.naturaleza] ?? 0) + Number(g.montoTotal);
  }

  return NextResponse.json({
    rango: { desde: desde.toISOString().slice(0, 10), hasta: hasta.toISOString().slice(0, 10) },
    ventas: {
      porMetodoPago: ventasPorMetodoPago,
      creditos: totalCreditos,
      total: ventasTotales,
    },
    costoVentas,
    utilidadBruta,
    gastoOperativo,
    utilidadOperativa,
    gastoFinanciero,
    gastoTributario,
    otrosEgresos,
    utilidadNeta,
    margenNetoPct: ventasTotales > 0 ? (utilidadNeta / ventasTotales) * 100 : 0,
    egresoCajaTotal,
    egresoCajaNoOperativo,
    detallePorNaturaleza,
  });
}
