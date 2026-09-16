import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { getUsuarioActual, requiereSuperadmin } from "@/lib/auth";
import { calcularReporteGastosPorNaturaleza, rangoPorDefecto } from "@/lib/reporteGastosPorNaturaleza";

export const dynamic = "force-dynamic";

const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;
const querySchema = z.object({
  desde: z.string().regex(fechaRegex, "Fecha 'desde' inválida").optional(),
  hasta: z.string().regex(fechaRegex, "Fecha 'hasta' inválida").optional(),
});

// GET /api/reportes/gastos-por-naturaleza?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
//
// Reporte consolidado (TODAS las empresas) de cuánto se gasta por
// naturaleza del egreso y, dentro de cada naturaleza, por categoría
// específica. Pensado para alta gerencia: de un vistazo se ve qué empresa
// gasta más, en qué se le va la plata, y cuánto de eso es gasto real
// (afecta el Estado de Resultados) versus inversión/pago de deuda/retiro
// de socios (mueve caja pero no es "gasto" contable en el momento).
//
// Sin filtro de fecha, muestra el mes en curso. Exclusivo del superadmin
// de la plataforma — igual que Cuentas por Cobrar consolidado — porque
// cruza información de TODAS las empresas a la vez.
export async function GET(request: Request) {
  const usuarioActual = await getUsuarioActual();
  try {
    requiereSuperadmin(usuarioActual);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    desde: searchParams.get("desde") ?? undefined,
    hasta: searchParams.get("hasta") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  }

  const porDefecto = rangoPorDefecto();
  const desde = parsed.data.desde ?? porDefecto.desde;
  const hasta = parsed.data.hasta ?? porDefecto.hasta;

  if (desde > hasta) {
    return NextResponse.json({ error: "La fecha 'desde' no puede ser posterior a 'hasta'." }, { status: 400 });
  }

  const reporte = await calcularReporteGastosPorNaturaleza(desde, hasta);

  return NextResponse.json({
    desde: reporte.desde,
    hasta: reporte.hasta,
    totalGeneral: reporte.totalGeneral.toFixed(2),
    totalImpactaResultados: reporte.totalImpactaResultados.toFixed(2),
    totalNoImpactaResultados: reporte.totalNoImpactaResultados.toFixed(2),
    empresas: reporte.empresas.map((e) => ({
      empresaId: e.empresaId,
      nombreComercial: e.nombreComercial,
      total: e.total.toFixed(2),
      totalImpactaResultados: e.totalImpactaResultados.toFixed(2),
      totalNoImpactaResultados: e.totalNoImpactaResultados.toFixed(2),
      naturalezas: e.naturalezas.map((n) => ({
        naturaleza: n.naturaleza,
        label: n.label,
        impactaResultados: n.impactaResultados,
        total: n.total.toFixed(2),
        categorias: n.categorias.map((c) => ({ categoria: c.categoria, total: c.total.toFixed(2) })),
      })),
    })),
  });
}
