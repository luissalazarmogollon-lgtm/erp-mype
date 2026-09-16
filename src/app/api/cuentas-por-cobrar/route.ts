import { NextResponse } from "next/server";
import { getUsuarioActual, requiereSuperadmin } from "@/lib/auth";
import { calcularCuentasPorCobrarConsolidado } from "@/lib/reporteCuentasPorCobrar";

export const dynamic = "force-dynamic";

// GET /api/cuentas-por-cobrar — resumen consolidado de Cuentas por Cobrar
// de TODAS las empresas, agrupado por empresa, con el total general de lo
// que se debe (para mostrarlo arriba a la derecha en la pantalla). Solo
// incluye cuentas pendientes/vencidas — las ya cobradas se consultan
// desde la pantalla de Créditos/Cuentas por Cobrar de cada empresa.
//
// Vista exclusiva del superadmin de la plataforma: es quien gestiona
// varias empresas a la vez como consultor y necesita el panorama
// completo; cada empresa por separado ya tiene su propia pantalla de
// Créditos con el detalle y las acciones (cobrar, eliminar).
export async function GET() {
  const usuarioActual = await getUsuarioActual();
  try {
    requiereSuperadmin(usuarioActual);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const reporte = await calcularCuentasPorCobrarConsolidado();

  return NextResponse.json({
    totalPorCobrar: reporte.totalPorCobrar.toFixed(2),
    empresas: reporte.empresas.map((g) => ({
      empresaId: g.empresaId,
      nombreComercial: g.nombreComercial,
      totalPorCobrar: g.totalPorCobrar.toFixed(2),
      cantidadPendientes: g.cuentas.length,
      cuentas: g.cuentas.map((c) => ({
        id: c.id,
        cliente: c.cliente,
        clienteRuc: c.clienteRuc,
        numeroFactura: c.numeroFactura,
        descripcion: c.descripcion,
        montoTotal: c.montoTotal.toFixed(2),
        saldoPendiente: c.saldoPendiente.toFixed(2),
        fechaEmision: c.fechaEmision.toISOString(),
        fechaVencimiento: c.fechaVencimiento ? c.fechaVencimiento.toISOString() : null,
        estado: c.estado,
      })),
    })),
  });
}
