import { prisma } from "@/lib/prisma";
import { labelNaturaleza, impactaResultados } from "@/lib/naturalezaEgreso";

export type CategoriaResumen = { categoria: string; total: number };
export type NaturalezaResumen = {
  naturaleza: string | null;
  label: string;
  impactaResultados: boolean;
  total: number;
  categorias: CategoriaResumen[];
};
export type EmpresaResumen = {
  empresaId: string;
  nombreComercial: string;
  total: number;
  totalImpactaResultados: number;
  totalNoImpactaResultados: number;
  naturalezas: NaturalezaResumen[];
};
export type ReporteGastosPorNaturaleza = {
  desde: string;
  hasta: string;
  totalGeneral: number;
  totalImpactaResultados: number;
  totalNoImpactaResultados: number;
  empresas: EmpresaResumen[];
};

// Rango de fechas por defecto: el mes en curso (día 1 hasta hoy) — es lo
// que la alta gerencia normalmente quiere ver al entrar sin filtrar nada.
export function rangoPorDefecto(): { desde: string; hasta: string } {
  const hoy = new Date();
  const primerDia = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  return { desde: primerDia.toISOString().slice(0, 10), hasta: hoy.toISOString().slice(0, 10) };
}

// Calcula, para TODAS las empresas, cuánto se gastó en un rango de fechas,
// agrupado por empresa → naturaleza del egreso → categoría específica.
// Es la base compartida por la pantalla del reporte y por el export a Excel,
// para que ambos muestren siempre exactamente los mismos números.
//
// naturaleza = null (gastos que vienen de una CxP registrada directamente,
// todavía sin clasificar) se agrupa aparte como "Sin clasificar" — así la
// gerencia ve de un vistazo si hay gastos pendientes de que finanzas los
// clasifique, en vez de que desaparezcan silenciosamente del reporte.
// "empresaId" es opcional: sin él, calcula el consolidado de todas las
// empresas (la pantalla del reporte); pasándolo, filtra a una sola — lo usa
// el PDF individual que se envía a los dueños de esa empresa.
export async function calcularReporteGastosPorNaturaleza(
  desde: string,
  hasta: string,
  empresaId?: bigint
): Promise<ReporteGastosPorNaturaleza> {
  const gastos = await prisma.gasto.findMany({
    where: {
      fecha: {
        gte: new Date(`${desde}T00:00:00.000Z`),
        lte: new Date(`${hasta}T23:59:59.999Z`),
      },
      ...(empresaId !== undefined ? { empresaId } : {}),
    },
    include: { empresa: true },
  });

  const porEmpresa = new Map<
    string,
    {
      empresaId: string;
      nombreComercial: string;
      total: number;
      totalImpactaResultados: number;
      totalNoImpactaResultados: number;
      porNaturaleza: Map<string, { naturaleza: string | null; total: number; categorias: Map<string, number> }>;
    }
  >();

  for (const g of gastos) {
    const empresaId = g.empresaId.toString();
    if (!porEmpresa.has(empresaId)) {
      porEmpresa.set(empresaId, {
        empresaId,
        nombreComercial: g.empresa.nombreComercial,
        total: 0,
        totalImpactaResultados: 0,
        totalNoImpactaResultados: 0,
        porNaturaleza: new Map(),
      });
    }
    const grupoEmpresa = porEmpresa.get(empresaId)!;
    const monto = Number(g.montoTotal);
    const naturalezaKey = g.naturaleza ?? "__sin_clasificar__";
    const categoria = g.categoriaEspecifica ?? "Sin categoría";

    grupoEmpresa.total += monto;
    if (impactaResultados(g.naturaleza)) {
      grupoEmpresa.totalImpactaResultados += monto;
    } else {
      grupoEmpresa.totalNoImpactaResultados += monto;
    }

    if (!grupoEmpresa.porNaturaleza.has(naturalezaKey)) {
      grupoEmpresa.porNaturaleza.set(naturalezaKey, { naturaleza: g.naturaleza, total: 0, categorias: new Map() });
    }
    const grupoNaturaleza = grupoEmpresa.porNaturaleza.get(naturalezaKey)!;
    grupoNaturaleza.total += monto;
    grupoNaturaleza.categorias.set(categoria, (grupoNaturaleza.categorias.get(categoria) ?? 0) + monto);
  }

  const empresas: EmpresaResumen[] = Array.from(porEmpresa.values())
    .map((e) => ({
      empresaId: e.empresaId,
      nombreComercial: e.nombreComercial,
      total: e.total,
      totalImpactaResultados: e.totalImpactaResultados,
      totalNoImpactaResultados: e.totalNoImpactaResultados,
      naturalezas: Array.from(e.porNaturaleza.values())
        .map((n) => ({
          naturaleza: n.naturaleza,
          label: labelNaturaleza(n.naturaleza),
          impactaResultados: impactaResultados(n.naturaleza),
          total: n.total,
          categorias: Array.from(n.categorias.entries())
            .map(([categoria, total]) => ({ categoria, total }))
            .sort((a, b) => b.total - a.total),
        }))
        .sort((a, b) => b.total - a.total),
    }))
    // Empresa que más gasta primero — es lo más relevante para gerencia.
    .sort((a, b) => b.total - a.total);

  const totalGeneral = empresas.reduce((acc, e) => acc + e.total, 0);
  const totalImpactaResultados = empresas.reduce((acc, e) => acc + e.totalImpactaResultados, 0);
  const totalNoImpactaResultados = empresas.reduce((acc, e) => acc + e.totalNoImpactaResultados, 0);

  return { desde, hasta, totalGeneral, totalImpactaResultados, totalNoImpactaResultados, empresas };
}
