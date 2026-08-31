// Reglas de negocio del módulo "Gestión de Actividades" (Servicios):
// costo/hora de un empleado, capacidad de horas, y precio/margen objetivo
// de un servicio. Centralizado aquí porque lo usan varias rutas de API
// (asignaciones-cliente, tareas, carga-trabajo) y así el criterio queda
// en un solo lugar.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Rentabilidad objetivo que la empresa quiere mantener por cliente. El
// precio "sugerido" de un servicio se calcula para llegar exactamente a
// este margen sobre el costo de las horas asignadas.
export const RENTABILIDAD_OBJETIVO = 0.4;

// Días laborales promedio al mes (52 semanas × 5 días ÷ 12 meses). Se usa
// para pasar de "horas/día" a "horas/mes" y de "sueldo/mes" a "costo/hora".
export const DIAS_LABORALES_MES = 21.67;

// Capacidad diaria por defecto de un trabajador, si no se especifica otra
// en su ficha de RRHH (Empleado.horasCapacidadDiaria).
export const HORAS_CAPACIDAD_DIARIA_DEFECTO = 9;

// Los campos numéricos de Empleado son Prisma.Decimal en runtime (vienen
// tal cual de prisma.empleado.findMany/create); se tipan así para poder
// pasar el objeto completo que devuelve Prisma sin conversiones previas,
// igual que el resto de la app (ver src/lib/inventario.ts).
type EmpleadoParaCosto = {
  sueldoBasico: Prisma.Decimal | number | string;
  otrosIngresos: Prisma.Decimal | number | string;
  horasCapacidadDiaria: Prisma.Decimal | number | string;
  costoHoraManual: Prisma.Decimal | number | string | null;
};

/**
 * Costo por hora productiva de un empleado. Por defecto se calcula de su
 * planilla (sueldo básico + otros ingresos fijos) entre las horas que
 * puede trabajar al mes — es el costo "de planilla", sin cargas sociales
 * ni gastos generales, así que una consultora que quiera incluir esos
 * conceptos puede sobrescribirlo con `costoHoraManual` en la ficha del
 * trabajador (RRHH).
 */
export function costoHoraEmpleado(empleado: EmpleadoParaCosto): number {
  if (empleado.costoHoraManual !== null && empleado.costoHoraManual !== undefined) {
    return Number(empleado.costoHoraManual);
  }
  const capacidadMensual = capacidadMensualHoras(empleado);
  if (capacidadMensual <= 0) return 0;
  const sueldoTotal = Number(empleado.sueldoBasico) + Number(empleado.otrosIngresos);
  return sueldoTotal / capacidadMensual;
}

/** Horas productivas que un empleado puede cubrir al mes, según su capacidad diaria. */
export function capacidadMensualHoras(empleado: { horasCapacidadDiaria: Prisma.Decimal | number | string }): number {
  return Number(empleado.horasCapacidadDiaria) * DIAS_LABORALES_MES;
}

/** Precio de venta mensual sugerido para llegar a RENTABILIDAD_OBJETIVO sobre el costo. */
export function precioSugerido(costoMensual: number): number {
  if (costoMensual <= 0) return 0;
  return costoMensual / (1 - RENTABILIDAD_OBJETIVO);
}

/** Margen real (0–1) dado un precio de venta y un costo. Null si no hay precio. */
export function margenReal(precioVenta: number | null, costoMensual: number): number | null {
  if (precioVenta === null || precioVenta <= 0) return null;
  return (precioVenta - costoMensual) / precioVenta;
}

/** true si el margen real cae por debajo del objetivo — dispara el aviso, no bloquea nada. */
export function margenEnRiesgo(precioVenta: number | null, costoMensual: number): boolean {
  const margen = margenReal(precioVenta, costoMensual);
  return margen !== null && margen < RENTABILIDAD_OBJETIVO;
}

/**
 * Para todas las AsignacionCliente ACTIVAS de la empresa, suma cuántas
 * horas/mes tiene comprometidas cada empleado EN TODOS SUS CLIENTES (no
 * solo uno) — así se puede avisar si un empleado queda sobrecargado al
 * armar o editar un servicio, sin importar en qué cliente ocurrió el
 * exceso. `excluirAsignacionId` se usa al EDITAR una asignación, para no
 * contar sus propias horas viejas dos veces contra las nuevas.
 */
export async function horasComprometidasPorEmpleado(empresaId: bigint, excluirAsignacionId?: bigint) {
  const detalles = await prisma.asignacionClienteEmpleado.findMany({
    where: {
      asignacionCliente: {
        empresaId,
        estado: "activo",
        ...(excluirAsignacionId ? { id: { not: excluirAsignacionId } } : {}),
      },
    },
  });
  const mapa = new Map<string, number>();
  for (const d of detalles) {
    const clave = d.empleadoId.toString();
    mapa.set(clave, (mapa.get(clave) ?? 0) + Number(d.horasMensuales));
  }
  return mapa;
}
