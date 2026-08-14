// Catálogo compartido de tipos de comprobante — usado en Gastos y Costos
// y en Caja Chica, para no duplicar la lista en cada pantalla.
export const TIPOS_COMPROBANTE = [
  { value: "boleta", label: "Boleta" },
  { value: "factura", label: "Factura" },
  { value: "nota_venta", label: "Nota de venta" },
  { value: "recibo_honorarios", label: "Recibo por honorarios" },
  { value: "ticket", label: "Ticket" },
  { value: "sin_comprobante", label: "Sin comprobante" },
] as const;

export type TipoComprobante = (typeof TIPOS_COMPROBANTE)[number]["value"];
