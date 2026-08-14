// Catálogo de módulos para el acceso granular por checkbox (segregación
// de funciones). Cada clave corresponde a una pantalla/API real del
// sistema — al agregar un módulo nuevo, agrégalo aquí también.
export const MODULOS_DISPONIBLES = [
  { key: "estado_resultados", label: "Ver Estado de Resultados" },
  { key: "ventas_diarias", label: "Registrar ventas diarias" },
  { key: "gastos", label: "Registrar gastos y costos" },
  { key: "creditos", label: "Gestionar créditos a clientes (CxC)" },
  { key: "cuentas_por_pagar", label: "Pagar cuentas por pagar" },
  { key: "locales", label: "Gestionar locales" },
  { key: "ventas_pos", label: "Registrar ventas por producto (POS)" },
  { key: "productos", label: "Gestionar productos y recetas" },
  { key: "insumos", label: "Gestionar insumos" },
  { key: "mermas", label: "Registrar mermas" },
  { key: "rrhh", label: "Gestionar RRHH (empleados y adelantos de sueldo)" },
  { key: "flujo_caja", label: "Gestionar flujo de caja y cuentas bancarias" },
  { key: "caja_chica", label: "Registrar gastos de caja chica" },
] as const;

export type ModuloKey = (typeof MODULOS_DISPONIBLES)[number]["key"];
