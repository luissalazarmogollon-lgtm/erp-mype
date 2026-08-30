import type { ZodError } from "zod";

/**
 * Convierte un ZodError en un mensaje de texto legible para el usuario.
 *
 * Antes, casi todas las rutas devolvían `parsed.error.flatten()` — un
 * OBJETO — directamente en el campo `error` de la respuesta. Los
 * formularios en el frontend hacen `data.error?.toString()` esperando un
 * texto; llamar `.toString()` sobre un objeto plano de JavaScript da
 * literalmente el texto "[object Object]" en vez del mensaje real de
 * validación. El usuario final veía ese texto sin sentido en vez de, por
 * ejemplo, "nombre: El nombre es obligatorio".
 *
 * Se usa el primer error de la lista (issues[0]) porque los formularios
 * de esta app validan y muestran un solo mensaje a la vez — es más claro
 * para alguien no técnico que una lista completa de errores de campos.
 */
export function mensajeErrorZod(error: ZodError): string {
  const primero = error.issues[0];
  if (!primero) return "Los datos enviados no son válidos.";
  const campo = primero.path.length > 0 ? `${primero.path.join(".")}: ` : "";
  return `${campo}${primero.message}`;
}
