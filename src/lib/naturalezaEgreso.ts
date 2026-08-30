// Catálogo de "naturaleza del egreso" — la clasificación contable que
// determina si un gasto impacta el Estado de Resultados o no.
//
// impactaResultados = true  → costo_directo, mano_obra_directa,
//   gasto_operativo, gasto_financiero, gasto_tributario, otros
// impactaResultados = false → activo, deuda, retiro_socios (son egresos
//   de caja reales, pero NO son gasto contable en el momento en que
//   ocurren — un activo se deprecia con el tiempo, la porción capital de
//   una deuda reduce el pasivo, un retiro de socios es un movimiento de
//   patrimonio, no una pérdida del negocio)
export const NATURALEZAS_EGRESO = [
  { value: "costo_directo", label: "Costo directo", impactaResultados: true },
  { value: "mano_obra_directa", label: "Mano de obra directa", impactaResultados: true },
  { value: "gasto_operativo", label: "Gasto operativo", impactaResultados: true },
  { value: "gasto_financiero", label: "Gasto financiero", impactaResultados: true },
  { value: "gasto_tributario", label: "Gasto tributario", impactaResultados: true },
  { value: "activo", label: "Activo / Inversión (compra de equipos, maquinaria...)", impactaResultados: false },
  { value: "deuda", label: "Pago de deuda / préstamo (capital)", impactaResultados: false },
  { value: "retiro_socios", label: "Distribución / retiro de socios", impactaResultados: false },
  { value: "otros", label: "Otros egresos extraordinarios", impactaResultados: true },
] as const;

export type NaturalezaEgreso = (typeof NATURALEZAS_EGRESO)[number]["value"];

// naturaleza === null → el gasto todavía no fue clasificado (viene de una
// factura por pagar registrada directamente en Cuentas por Pagar, sin
// pasar por Gastos y Costos). Mientras no se clasifique, NO impacta el
// Estado de Resultados — se muestra aparte como "Sin clasificar" hasta
// que el responsable de finanzas/contabilidad le asigne su naturaleza.
export function impactaResultados(naturaleza: string | null | undefined): boolean {
  if (!naturaleza) return false;
  return NATURALEZAS_EGRESO.find((n) => n.value === naturaleza)?.impactaResultados ?? true;
}

export function labelNaturaleza(naturaleza: string | null | undefined): string {
  if (!naturaleza) return "Sin clasificar";
  return NATURALEZAS_EGRESO.find((n) => n.value === naturaleza)?.label ?? naturaleza;
}

// Categorías específicas por naturaleza — lista corta y consolidada,
// no un catálogo abierto, para que no se vuelva una lista interminable.
export const CATEGORIAS_POR_NATURALEZA: Record<string, string[]> = {
  costo_directo: ["Materia prima / insumos", "Empaques y envases", "Insumos de producción (otros)"],
  mano_obra_directa: ["Sueldos personal de producción/cocina", "Comisiones / bonos de producción"],
  gasto_operativo: [
    "Alquiler",
    "Servicios básicos (luz/agua/internet)",
    "Sueldos administrativos",
    "Marketing y publicidad",
    "Mantenimiento",
    "Sistemas y tecnología",
    "Transporte y delivery",
    "Honorarios profesionales",
    "Otros gastos operativos",
  ],
  gasto_financiero: ["Intereses de préstamo", "Comisiones bancarias", "Otros gastos financieros"],
  gasto_tributario: ["Impuesto a la renta", "IGV / tributos municipales", "Multas y otros"],
  activo: ["Maquinaria y equipos de producción", "Mobiliario y equipos de local", "Vehículos", "Equipos informáticos", "Otros activos"],
  deuda: ["Préstamo bancario", "Préstamo de socio", "Crédito de proveedor"],
  retiro_socios: ["Retiro de utilidades", "Distribución a socios"],
  otros: ["Egreso extraordinario / no operativo"],
};
