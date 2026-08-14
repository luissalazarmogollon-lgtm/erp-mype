import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/estado-resultados?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
// Calcula el Estado de Resultados EN VIVO (sin cierre de período ni motor
// contable de partida doble): suma directamente lo registrado hasta el
// momento en ventas diarias, créditos a clientes y gastos/costos.
//
// Ventas totales = Σ ventas diarias (efectivo+yape+plin+tarjeta) del rango
//                 + Σ créditos otorgados en el rango (se cuentan como venta
//                   al momento de otorgarse, se hayan cobrado o no — es el
//                   criterio contable estándar de "devengado").
// Costo de ventas = Σ gastos marcados como costo directo en el rango.
// Gasto operativo = Σ gastos marcados como gasto operativo en el rango.
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

  const [ventasDiarias, creditosOtorgados, gastos] = await Promise.all([
    prisma.registroVentaDiaria.findMany({
      where: { empresaId, fecha: { gte: desde, lte: hasta } },
    }),
    prisma.cuentaPorCobrar.findMany({
      where: { empresaId, fechaEmision: { gte: desde, lte: hasta } },
    }),
    prisma.gasto.findMany({
      where: { empresaId, fecha: { gte: desde, lte: hasta } },
      include: { categoria: true },
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

  const costoDirecto = gastos.filter((g) => g.esCostoDirecto).reduce((acc, g) => acc + Number(g.montoTotal), 0);
  const gastoOperativo = gastos.filter((g) => !g.esCostoDirecto).reduce((acc, g) => acc + Number(g.montoTotal), 0);

  const utilidadBruta = ventasTotales - costoDirecto;
  const utilidadNeta = utilidadBruta - gastoOperativo;

  // Desglose de gastos operativos por categoría, útil para el dashboard.
  const gastosPorCategoria = new Map<string, number>();
  for (const g of gastos.filter((g) => !g.esCostoDirecto)) {
    const nombre = g.categoria?.nombre ?? "Sin categoría";
    gastosPorCategoria.set(nombre, (gastosPorCategoria.get(nombre) ?? 0) + Number(g.montoTotal));
  }

  return NextResponse.json({
    rango: { desde: desde.toISOString().slice(0, 10), hasta: hasta.toISOString().slice(0, 10) },
    ventas: {
      porMetodoPago: ventasPorMetodoPago,
      creditos: totalCreditos,
      total: ventasTotales,
    },
    costoDirecto,
    utilidadBruta,
    gastoOperativo,
    gastoOperativoPorCategoria: Object.fromEntries(gastosPorCategoria),
    utilidadNeta,
    margenNetoPct: ventasTotales > 0 ? (utilidadNeta / ventasTotales) * 100 : 0,
  });
}
