import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { NATURALEZAS_EGRESO } from "@/lib/naturalezaEgreso";
import { TIPOS_COMPROBANTE } from "@/lib/tiposComprobante";

export const dynamic = "force-dynamic";

const NATURALEZAS_VALIDAS = NATURALEZAS_EGRESO.map((n) => n.value) as [string, ...string[]];
const TIPOS_COMPROBANTE_VALIDOS = TIPOS_COMPROBANTE.map((t) => t.value) as [string, ...string[]];

const editarGastoSchema = z.object({
  localId: z.string().nullable().optional(),
  naturaleza: z.enum(NATURALEZAS_VALIDAS).optional(),
  categoriaEspecifica: z.string().nullable().optional(),
  proveedorNombre: z.string().nullable().optional(),
  descripcion: z.string().min(2, "Describe brevemente el egreso").optional(),
  tipoComprobante: z.enum(TIPOS_COMPROBANTE_VALIDOS).optional(),
  numeroComprobante: z.string().nullable().optional(),
  montoTotal: z.number().positive().optional(),
  fecha: z.string().optional(),
  condicion: z.enum(["contado", "credito"]).optional(),
  medioPago: z.string().nullable().optional(),
  cuentaBancariaId: z.string().nullable().optional(),
  fechaVencimiento: z.string().nullable().optional(),
});

// Trae el gasto con todo lo necesario para decidir qué reversar: su CxP
// propia (si es un gasto suelto a crédito) o la del documento del que es
// ítem (si viene de un "Documento con varios ítems"), con sus pagos, y si
// viene de un traslado de Caja Chica.
async function cargarGastoParaEdicion(tx: PrismaTx, empresaId: bigint, gastoId: bigint) {
  return tx.gasto.findFirst({
    where: { id: gastoId, empresaId },
    include: {
      cuentaPorPagar: { include: { pagos: true } },
      documentoCompra: { include: { items: true, cuentaPorPagar: { include: { pagos: true } } } },
      gastoCajaChica: true,
    },
  });
}

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

// PATCH /api/empresas/[id]/gastos/[gastoId]
//
// Edita un egreso ya registrado, reversando y reaplicando automáticamente
// sus efectos secundarios (cuenta por pagar asociada, movimiento bancario
// y saldo de la cuenta):
//
// - Si la factura/CxP asociada ya tiene pagos registrados, se BLOQUEA la
//   edición: hay que anular esos pagos en Cuentas por Pagar primero (si no,
//   quedarían pagos "huérfanos" sobre un monto que ya no es el correcto).
// - Si es un ítem de un "Documento con varios ítems", no se puede cambiar
//   su condición (contado/crédito) por separado — es una propiedad del
//   documento completo — pero sí su monto, que ajusta proporcionalmente el
//   total de la CxP y del documento.
// - Si cambia el monto de un egreso al contado con cuenta bancaria, se
//   ajusta el movimiento bancario y el saldo de esa cuenta por el delta.
// - Si cambia de contado a crédito (o viceversa) se crea/elimina la CxP y
//   el movimiento bancario correspondientes.
export async function PATCH(request: Request, { params }: { params: { id: string; gastoId: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "gastos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = editarGastoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const gastoId = BigInt(params.gastoId);
  const usuarioId = usuarioActual.id;

  try {
    const gastoActualizado = await prisma.$transaction(async (tx) => {
      const gasto = await cargarGastoParaEdicion(tx, empresaId, gastoId);
      if (!gasto) throw new Error("__404__");

      if (gasto.gastoCajaChica) {
        throw new Error("Este egreso viene de un traslado de Caja Chica — edítalo desde ese módulo.");
      }

      const esItemDeDocumento = gasto.documentoCompraId !== null;
      const cxpPropia = gasto.cuentaPorPagar;
      const cxpDocumento = gasto.documentoCompra?.cuentaPorPagar ?? null;
      const cxpVigente = cxpPropia ?? cxpDocumento;

      if (cxpVigente && cxpVigente.pagos.length > 0) {
        throw new Error(
          "Esta factura ya tiene pagos registrados — anula esos pagos en Cuentas por Pagar antes de editar este egreso."
        );
      }

      if (esItemDeDocumento && datos.condicion && datos.condicion !== gasto.condicion) {
        throw new Error(
          "No se puede cambiar la condición (contado/crédito) de un ítem de un documento con varios ítems — es una propiedad de todo el documento."
        );
      }

      const condicionNueva = datos.condicion ?? gasto.condicion;
      const montoAnterior = Number(gasto.montoTotal);
      const montoNuevo = datos.montoTotal ?? montoAnterior;
      const medioPagoNuevo = datos.medioPago !== undefined ? datos.medioPago : gasto.medioPago;

      if (condicionNueva === "contado" && !medioPagoNuevo) {
        throw new Error("Indica el medio de pago para un egreso al contado");
      }

      // --- 1) Reversar el movimiento bancario propio de este gasto, si existía ---
      const movimientoAnterior = await tx.movimientoBancario.findFirst({
        where: { referenciaTipo: "gasto", referenciaId: gasto.id },
      });
      if (movimientoAnterior) {
        await tx.cuentaBancaria.update({
          where: { id: movimientoAnterior.cuentaBancariaId },
          data: { saldoActual: { increment: movimientoAnterior.monto } },
        });
        await tx.movimientoBancario.delete({ where: { id: movimientoAnterior.id } });
      }

      // --- 2) Ajustar/crear/eliminar la cuenta por pagar según corresponda ---
      if (condicionNueva === "credito") {
        if (esItemDeDocumento && cxpDocumento && gasto.documentoCompra) {
          const delta = montoNuevo - montoAnterior;
          if (delta !== 0) {
            await tx.cuentaPorPagar.update({
              where: { id: cxpDocumento.id },
              data: { montoTotal: { increment: delta }, saldoPendiente: { increment: delta } },
            });
            await tx.documentoCompra.update({
              where: { id: gasto.documentoCompra.id },
              data: { montoTotal: { increment: delta } },
            });
          }
        } else if (cxpPropia) {
          const delta = montoNuevo - montoAnterior;
          await tx.cuentaPorPagar.update({
            where: { id: cxpPropia.id },
            data: {
              ...(delta !== 0 ? { montoTotal: { increment: delta }, saldoPendiente: { increment: delta } } : {}),
              ...(datos.fechaVencimiento !== undefined
                ? { fechaVencimiento: datos.fechaVencimiento ? new Date(datos.fechaVencimiento) : null }
                : {}),
              ...(datos.proveedorNombre !== undefined ? { proveedorNombre: datos.proveedorNombre || null } : {}),
            },
          });
        } else {
          // Antes era al contado, ahora pasa a crédito: crea su propia CxP.
          await tx.cuentaPorPagar.create({
            data: {
              empresaId,
              gastoId: gasto.id,
              proveedorNombre: (datos.proveedorNombre !== undefined ? datos.proveedorNombre : gasto.proveedorNombre) || null,
              montoTotal: montoNuevo,
              saldoPendiente: montoNuevo,
              fechaVencimiento: datos.fechaVencimiento ? new Date(datos.fechaVencimiento) : null,
            },
          });
        }
      } else {
        // condicionNueva === "contado"
        if (cxpPropia) {
          // Antes era crédito con CxP propia (sin pagos, ya validado) — se
          // elimina, porque un egreso al contado no tiene cuenta por pagar.
          await tx.cuentaPorPagar.delete({ where: { id: cxpPropia.id } });
        }
        // (Si es ítem de documento, ya se bloqueó arriba el cambio de condición.)
      }

      // --- 3) Crear el nuevo movimiento bancario si queda al contado con cuenta ---
      const cuentaBancariaIdNueva =
        condicionNueva === "contado"
          ? datos.cuentaBancariaId !== undefined
            ? datos.cuentaBancariaId
              ? BigInt(datos.cuentaBancariaId)
              : null
            : gasto.cuentaBancariaId
          : null;

      if (condicionNueva === "contado" && cuentaBancariaIdNueva) {
        await tx.movimientoBancario.create({
          data: {
            cuentaBancariaId: cuentaBancariaIdNueva,
            tipo: "egreso",
            monto: montoNuevo,
            concepto: datos.descripcion ?? gasto.descripcion,
            referenciaTipo: "gasto",
            referenciaId: gasto.id,
            usuarioId,
          },
        });
        await tx.cuentaBancaria.update({
          where: { id: cuentaBancariaIdNueva },
          data: { saldoActual: { decrement: montoNuevo } },
        });
      }

      // --- 4) Actualizar el gasto en sí ---
      const actualizado = await tx.gasto.update({
        where: { id: gasto.id },
        data: {
          localId: datos.localId !== undefined ? (datos.localId ? BigInt(datos.localId) : null) : undefined,
          naturaleza: datos.naturaleza ?? undefined,
          categoriaEspecifica: datos.categoriaEspecifica !== undefined ? datos.categoriaEspecifica || null : undefined,
          proveedorNombre: datos.proveedorNombre !== undefined ? datos.proveedorNombre || null : undefined,
          descripcion: datos.descripcion ?? undefined,
          tipoComprobante: datos.tipoComprobante ?? undefined,
          numeroComprobante: datos.numeroComprobante !== undefined ? datos.numeroComprobante || null : undefined,
          montoTotal: montoNuevo,
          fecha: datos.fecha ? new Date(datos.fecha) : undefined,
          condicion: condicionNueva,
          medioPago: condicionNueva === "contado" ? medioPagoNuevo : null,
          cuentaBancariaId: condicionNueva === "contado" ? cuentaBancariaIdNueva : null,
        },
      });

      await tx.auditoria.create({
        data: {
          usuarioId,
          empresaId,
          tablaAfectada: "gastos",
          registroId: gasto.id,
          accion: "editar",
          valorAnterior: {
            descripcion: gasto.descripcion,
            montoTotal: gasto.montoTotal.toString(),
            condicion: gasto.condicion,
            naturaleza: gasto.naturaleza,
          },
          valorNuevo: {
            descripcion: actualizado.descripcion,
            montoTotal: actualizado.montoTotal.toString(),
            condicion: actualizado.condicion,
            naturaleza: actualizado.naturaleza,
          },
        },
      });

      return actualizado;
    });

    return NextResponse.json({ id: gastoActualizado.id.toString() });
  } catch (error) {
    const mensaje = (error as Error).message;
    if (mensaje === "__404__") return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 });
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }
}

// DELETE /api/empresas/[id]/gastos/[gastoId]
//
// Elimina un egreso y reversa automáticamente todo lo que generó:
// - Si su CxP (propia, o la del documento del que es ítem) ya tiene pagos
//   registrados, se BLOQUEA: hay que anular esos pagos primero.
// - Si tenía movimiento bancario propio (fue al contado con cuenta), se
//   elimina y se restaura el saldo de esa cuenta.
// - Si era un gasto suelto a crédito, se elimina su CxP junto con él.
// - Si era un ítem de un documento con varios ítems: si quedan otros
//   ítems, se descuenta su monto del total/saldo de la CxP y del
//   documento; si era el último ítem, se elimina la CxP y el documento
//   completo junto con él.
export async function DELETE(request: Request, { params }: { params: { id: string; gastoId: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "gastos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const gastoId = BigInt(params.gastoId);
  const usuarioId = usuarioActual.id;

  try {
    await prisma.$transaction(async (tx) => {
      const gasto = await cargarGastoParaEdicion(tx, empresaId, gastoId);
      if (!gasto) throw new Error("__404__");

      if (gasto.gastoCajaChica) {
        throw new Error("Este egreso viene de un traslado de Caja Chica — elimínalo desde ese módulo, no desde aquí.");
      }

      const cxpPropia = gasto.cuentaPorPagar;
      const cxpDocumento = gasto.documentoCompra?.cuentaPorPagar ?? null;
      const cxpVigente = cxpPropia ?? cxpDocumento;

      if (cxpVigente && cxpVigente.pagos.length > 0) {
        throw new Error(
          "Esta factura ya tiene pagos registrados — anula esos pagos en Cuentas por Pagar antes de eliminar este egreso."
        );
      }

      // Reversar el movimiento bancario propio, si existía (egreso al contado).
      const movimiento = await tx.movimientoBancario.findFirst({
        where: { referenciaTipo: "gasto", referenciaId: gasto.id },
      });
      if (movimiento) {
        await tx.cuentaBancaria.update({
          where: { id: movimiento.cuentaBancariaId },
          data: { saldoActual: { increment: movimiento.monto } },
        });
        await tx.movimientoBancario.delete({ where: { id: movimiento.id } });
      }

      let documentoAEliminar: bigint | null = null;

      if (cxpPropia) {
        // CxP exclusiva de este gasto — se elimina junto con él.
        await tx.cuentaPorPagar.delete({ where: { id: cxpPropia.id } });
      } else if (cxpDocumento && gasto.documentoCompra) {
        const otrosItems = gasto.documentoCompra.items.filter((item) => item.id !== gasto.id);
        if (otrosItems.length === 0) {
          // Era el último ítem del documento — se elimina la CxP entera; el
          // documento se elimina después de borrar este gasto (todavía lo
          // referencia por documentoCompraId).
          await tx.cuentaPorPagar.delete({ where: { id: cxpDocumento.id } });
          documentoAEliminar = gasto.documentoCompra.id;
        } else {
          const montoGasto = Number(gasto.montoTotal);
          await tx.cuentaPorPagar.update({
            where: { id: cxpDocumento.id },
            data: { montoTotal: { decrement: montoGasto }, saldoPendiente: { decrement: montoGasto } },
          });
          await tx.documentoCompra.update({
            where: { id: gasto.documentoCompra.id },
            data: { montoTotal: { decrement: montoGasto } },
          });
        }
      }

      await tx.gasto.delete({ where: { id: gasto.id } });

      if (documentoAEliminar) {
        await tx.documentoCompra.delete({ where: { id: documentoAEliminar } });
      }

      await tx.auditoria.create({
        data: {
          usuarioId,
          empresaId,
          tablaAfectada: "gastos",
          registroId: gasto.id,
          accion: "eliminar",
          valorAnterior: {
            descripcion: gasto.descripcion,
            montoTotal: gasto.montoTotal.toString(),
            condicion: gasto.condicion,
            naturaleza: gasto.naturaleza,
          },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const mensaje = (error as Error).message;
    if (mensaje === "__404__") return NextResponse.json({ error: "Gasto no encontrado" }, { status: 404 });
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }
}
