// Cálculo compartido de cuánto se ha depositado y cuánto falta por
// depositar ("saldo pendiente") de un método de pago (leg: efectivo |
// yape | plin | tarjeta) de un registro de venta diaria. Lo usan tanto
// el GET de /ventas-diarias (para mostrar el resumen e historial) como
// el POST de conciliar (para no dejar registrar un depósito que supere
// lo que falta por depositar).
//
// Si el registro es de ANTES de que existieran los depósitos parciales
// (no tiene filas en ConciliacionVentaDiaria para este leg) pero ya
// tenía la cuenta antigua asignada (*CuentaId, del sistema de "todo o
// nada" anterior), se asume depositado al 100% — así no reaparece como
// pendiente algo que ya se había conciliado con el sistema anterior.
export function calcularResumenLeg(
  montoRegistrado: number,
  cuentaLegacyId: bigint | null,
  conciliacionesLeg: { monto: unknown }[]
) {
  let depositado = conciliacionesLeg.reduce((acc, c) => acc + Number(c.monto), 0);
  if (conciliacionesLeg.length === 0 && cuentaLegacyId !== null) {
    depositado = montoRegistrado;
  }
  const pendiente = Math.max(montoRegistrado - depositado, 0);
  // A partir de esta versión ya no se puede generar excedente nuevo (el
  // POST de conciliar bloquea depositar más de lo pendiente) — este
  // campo queda solo por si hay datos históricos que sí lo tuvieran.
  const excedente = Math.max(depositado - montoRegistrado, 0);
  return { depositado, pendiente, excedente };
}
