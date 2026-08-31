// Catálogo de módulos para el acceso granular por checkbox (segregación
// de funciones). Cada clave corresponde a una pantalla/API real del
// sistema — al agregar un módulo nuevo, agrégalo aquí también.
export const MODULOS_DISPONIBLES = [
  { key: "estado_resultados", label: "Ver Estado de Resultados" },
  { key: "ventas_diarias", label: "Registrar ventas diarias" },
  { key: "gastos", label: "Registrar gastos y costos" },
  { key: "creditos", label: "Gestionar créditos a clientes (CxC)" },
  { key: "cuentas_por_pagar", label: "Clasificar y pagar cuentas por pagar (finanzas/contabilidad)" },
  { key: "cuentas_por_pagar_registrar", label: "Registrar facturas por pagar (sin clasificar ni pagar)" },
  { key: "locales", label: "Gestionar locales" },
  { key: "ventas_pos", label: "Registrar ventas por producto (POS)" },
  { key: "productos", label: "Gestionar productos y recetas" },
  { key: "insumos", label: "Gestionar insumos" },
  { key: "mermas", label: "Registrar mermas" },
  { key: "rrhh", label: "Gestionar RRHH (empleados y adelantos de sueldo)" },
  { key: "flujo_caja", label: "Gestionar flujo de caja y cuentas bancarias" },
  { key: "caja_chica", label: "Registrar gastos de caja chica" },
  { key: "solicitudes_pedido", label: "Crear y ver solicitudes de pedido" },
  { key: "aprobar_solicitudes_pedido", label: "Aprobar solicitudes de pedido y gestionar áreas" },
  { key: "despachar_solicitudes_pedido", label: "Despachar solicitudes aprobadas (logística)" },
  { key: "compras", label: "Gestionar proveedores, pedidos de compra y recepciones" },
  { key: "actividades", label: "Gestionar actividades y carga laboral (empresas de Servicios)" },
] as const;

export type ModuloKey = (typeof MODULOS_DISPONIBLES)[number]["key"];

// Módulos que solo tienen sentido para una empresa que vende PRODUCTOS
// (maneja inventario físico). Una empresa clasificada como "Servicios" no
// los necesita: no compra insumos, no tiene mermas de inventario, no vende
// productos por POS, ni gestiona compras/proveedores/solicitudes de pedido
// asociadas a inventario. Se usan para (a) ocultar estos accesos directos
// en el panel de la empresa, (b) bloquear el acceso a nivel de API como
// defensa en profundidad, y (c) no ofrecer estos permisos al asignar
// personas a una empresa de servicios.
export const MODULOS_SOLO_PRODUCTOS: ModuloKey[] = [
  "insumos",
  "mermas",
  "productos",
  "ventas_pos",
  "solicitudes_pedido",
  "aprobar_solicitudes_pedido",
  "despachar_solicitudes_pedido",
  "compras",
];

// Simétrico a MODULOS_SOLO_PRODUCTOS: módulos que solo tienen sentido para
// una empresa que vende SERVICIOS y maneja personal con carga laboral por
// cliente (agencias, consultoras, estudios, etc.). Una empresa de
// Productos no lo necesita — se usa igual que la lista anterior, para
// ocultar el acceso directo, bloquear la API, y no ofrecer el permiso.
export const MODULOS_SOLO_SERVICIOS: ModuloKey[] = ["actividades"];

/** true si el nombre de TipoNegocio corresponde a una empresa puramente de servicios. */
export function esEmpresaDeServicios(tipoNegocioNombre: string | null | undefined): boolean {
  return tipoNegocioNombre === "Servicios";
}

// En una empresa de Servicios, el módulo "ventas_diarias" (mismo permiso,
// misma clave — no se creó un permiso nuevo para no tener que reasignar a
// nadie) deja de ser una caja registradora diaria y pasa a ser el módulo
// de Facturación (registra directamente en Cuentas por Cobrar: cliente,
// RUC, N° de factura, detalle y si está pagada o no — ver
// /empresas/[id]/ventas-diarias). Esta función solo decide la ETIQUETA
// que ve la persona que asigna permisos; el acceso real lo valida
// verificarAccesoAlguno en las rutas de cuentas-por-cobrar.
export function etiquetaModulo(clave: ModuloKey, esServicios: boolean): string {
  if (clave === "ventas_diarias" && esServicios) return "Registrar facturación (CxC)";
  return MODULOS_DISPONIBLES.find((m) => m.key === clave)?.label ?? clave;
}
