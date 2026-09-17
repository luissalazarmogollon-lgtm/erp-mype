import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoAlguno } from "@/lib/auth";

export const dynamic = "force-dynamic";

const itemRecepcionSchema = z.object({
  detalleId: z.string(),
  cantidadRecibida: z.number().positive("La cantidad recibida debe ser mayor a 0"),
  // Opcional ahora: quien SOLO tiene "recepcionar_compras_almacen" (no
  // "compras") no puede fijar el costo — RN nueva: "el precio de costo
  // del insumo lo coloca el comprador". Si lo envía igual, el servidor lo
  // IGNORA para esa persona y usa el costo que el comprador ya dejó fijado
  // al crear la orden de compra (costoUnitarioEstimado) — ver más abajo.
  costoUnitarioReal: z.number().min(0).optional(),
});

const recepcionSchema = z.object({
  items: z.array(itemRecepcionSchema).min(1, "Registra al menos un ítem recibido"),
});

// POST /api/empresas/[id]/pedidos-compra/[pedidoCompraId]/recepcion
//
// Quién puede recepcionar (RN nueva): el comprador ("compras", como
// siempre) o quien tenga el permiso nuevo "recepcionar_compras_almacen"
// (encargada de almacén) — para que pueda registrar lo que llegó
// físicamente y así el Kardex quede al día sin depender de Compras. La
// diferencia es el COSTO: "el precio de costo del insumo lo coloca el
// comprador" — solo "compras" puede fijarlo/corregirlo aquí; quien solo
// tiene el permiso nuevo no manda costo (o si lo manda, se ignora) y se
// usa el que el comprador ya dejó al crear la orden de compra
// (costoUnitarioEstimado, ver pedidos-compra/route.ts POST).
//
// El proveedor entregó la mercadería. Por cada línea recibida:
//   1. Crea un LoteCompra nuevo (origen "compra") con el costo REAL pagado.
//   2. Actualiza Insumo.stockActual y su costo promedio (RN-031, igual que
//      cualquier otra entrada).
//   3. Compara el costo nuevo contra el lote anterior del mismo insumo — si
//      la variación supera el umbral de la empresa, crea una alerta.
//   4. Devuelve el ítem de la Solicitud original a "por_despachar" con la
//      cantidad realmente recibida, para que Logística lo despache al área
//      con el mismo mecanismo del Sprint 5 (PEPS) — no se duplica lógica.
//
// --- Cierre contable de la recepción (modelo tipo SAP B1: "Recepción de
// mercancías" ≠ "Factura de proveedor") ---
// Lo que entra aquí es MERCADERÍA para el almacén general: todavía no se
// usó, así que NO es Costo de Venta (eso ocurre recién en el Despacho —
// ver despachar/route.ts). Pero sí es una deuda real con el proveedor
// (o, si ya se pagó, una salida de caja real), así que cada recepción:
//   - Crea (o amplía, si el pedido ya tenía una recepción previa) UN
//     DocumentoCompra con un Gasto por cada línea recibida, naturaleza
//     "compra_mercaderia_almacen" (activo — no impacta el Estado de
//     Resultados) y condición "crédito".
//   - Crea (o amplía) la Cuenta por Pagar al proveedor por ese monto.
// El encargado de almacén NO elige aquí forma de pago ni sube el
// comprobante — eso lo hace después Finanzas desde Cuentas por Pagar,
// igual que ya hace hoy con cualquier factura registrada "sin
// clasificar" (el comprobante suele llegar después que la mercadería).
// Estos Gasto quedan marcados con origenAutomatico="recepcion_compra_almacen"
// y no se pueden editar/eliminar desde Gastos y Costos (ver gastos/route.ts
// y gastos/[gastoId]/route.ts) — se corrigen re-haciendo la recepción.
export async function POST(
  request: Request,
  { params }: { params: { id: string; pedidoCompraId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  let acceso;
  try {
    acceso = await verificarAccesoAlguno(usuarioActual.id, empresaId, ["compras", "recepcionar_compras_almacen"]);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }
  // Solo "compras" (el comprador) puede fijar el costo real — quien solo
  // tiene "recepcionar_compras_almacen" (encargada de almacén) registra
  // cantidades y el Kardex se actualiza, pero el costo se ignora y se usa
  // el que el comprador ya dejó en la orden de compra (ver más abajo).
  const puedeEditarCosto = acceso.accesoTotal || acceso.permisos.includes("compras");

  const body = await request.json();
  const parsed = recepcionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  }

  const pedidoCompraId = BigInt(params.pedidoCompraId);
  const pedido = await prisma.pedidoCompra.findFirst({
    where: { id: pedidoCompraId, empresaId },
    include: { proveedor: true },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido de compra no encontrado" }, { status: 404 });

  // Se extraen a variables locales (en vez de seguir referenciando
  // `pedido.proveedor.nombre` / `pedido.documentoCompraId` dentro del
  // closure de la transacción) porque TypeScript no arrastra el
  // "if (!pedido) return" hacia dentro de una función anidada — ya nos
  // pasó exactamente esto con `prestamo` en el módulo de Préstamos.
  const proveedorNombreOC = pedido.proveedor.nombre;
  const documentoCompraIdExistente = pedido.documentoCompraId;

  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  const umbral = Number(empresa!.umbralAlertaAnomaliaPct);

  try {
    await prisma.$transaction(async (tx) => {
      const itemsRecibidos: { detalleId: bigint; insumoNombre: string; monto: number }[] = [];

      for (const itemInput of parsed.data.items) {
        const detalleId = BigInt(itemInput.detalleId);
        const detalle = await tx.pedidoCompraDetalle.findFirst({
          where: { id: detalleId, pedidoCompraId },
        });
        if (!detalle) throw new Error(`Ítem ${itemInput.detalleId} no pertenece a este pedido`);
        if (detalle.fechaRecepcion) throw new Error(`El ítem de "${detalle.insumoId}" ya fue recepcionado`);

        // RN nueva: "el precio de costo del insumo lo coloca el
        // comprador". Quien tiene "compras" puede fijar/corregir el costo
        // real aquí mismo (o dejar el estimado si no manda uno); quien
        // SOLO tiene "recepcionar_compras_almacen" no puede — se ignora
        // cualquier costo que haya mandado y se usa el que el comprador ya
        // dejó al crear la orden de compra.
        const costoEstimado = detalle.costoUnitarioEstimado ? Number(detalle.costoUnitarioEstimado) : null;
        const costoReal = puedeEditarCosto ? itemInput.costoUnitarioReal ?? costoEstimado : costoEstimado;
        if (costoReal === null) {
          throw new Error(
            `El ítem de "${detalle.insumoId}" no tiene un costo definido por Compras todavía — pide que alguien con permiso de Compras lo fije antes de recepcionarlo.`
          );
        }

        const insumo = await tx.insumo.findUniqueOrThrow({ where: { id: detalle.insumoId } });

        // --- 1. Lote nuevo ---
        const nuevoLote = await tx.loteCompra.create({
          data: {
            empresaId,
            insumoId: detalle.insumoId,
            origen: "compra",
            cantidadInicial: itemInput.cantidadRecibida,
            cantidadDisponible: itemInput.cantidadRecibida,
            costoUnitario: costoReal,
            referenciaTipo: "pedido_compra_detalle",
            referenciaId: detalle.id,
          },
        });

        // --- 2. Kardex + stock + costo promedio (RN-031) ---
        await tx.movimientoInventario.create({
          data: {
            empresaId,
            insumoId: detalle.insumoId,
            tipo: "entrada_compra",
            cantidad: itemInput.cantidadRecibida,
            costoUnitario: costoReal,
            loteId: nuevoLote.id,
            usuarioId: usuarioActual.id,
            referenciaTipo: "pedido_compra_detalle",
            referenciaId: detalle.id,
          },
        });

        const stockActual = Number(insumo.stockActual);
        const costoActual = Number(insumo.costoPromedioActual);
        const nuevoStock = stockActual + itemInput.cantidadRecibida;
        const nuevoCostoPromedio =
          (stockActual * costoActual + itemInput.cantidadRecibida * costoReal) / nuevoStock;

        await tx.insumo.update({
          where: { id: detalle.insumoId },
          data: { stockActual: nuevoStock, costoPromedioActual: nuevoCostoPromedio },
        });

        // --- 3. Detección de anomalía vs. el lote anterior de este insumo ---
        const loteAnterior = await tx.loteCompra.findFirst({
          where: { insumoId: detalle.insumoId, id: { not: nuevoLote.id } },
          orderBy: { fechaIngreso: "desc" },
        });
        if (loteAnterior) {
          const costoAnterior = Number(loteAnterior.costoUnitario);
          if (costoAnterior > 0) {
            const variacionPct = (Math.abs(costoReal - costoAnterior) / costoAnterior) * 100;
            if (variacionPct > umbral) {
              await tx.alertaAnomaliaCosto.create({
                data: {
                  empresaId,
                  insumoId: detalle.insumoId,
                  loteAnteriorId: loteAnterior.id,
                  loteNuevoId: nuevoLote.id,
                  costoAnterior,
                  costoNuevo: costoReal,
                  variacionPct,
                },
              });
            }
          }
        }

        // --- 4. Cierra la línea de la OC ---
        await tx.pedidoCompraDetalle.update({
          where: { id: detalle.id },
          data: {
            cantidadRecibida: itemInput.cantidadRecibida,
            costoUnitarioReal: costoReal,
            fechaRecepcion: new Date(),
          },
        });

        // --- 5. Devuelve el ítem de la Solicitud a "por_despachar" ---
        await tx.solicitudPedidoDetalle.update({
          where: { id: detalle.solicitudDetalleId },
          data: { estadoItem: "por_despachar", cantidadAprobada: itemInput.cantidadRecibida },
        });

        itemsRecibidos.push({
          detalleId: detalle.id,
          insumoNombre: insumo.nombre,
          monto: itemInput.cantidadRecibida * costoReal,
        });
      }

      // --- 6. Cuenta por Pagar al proveedor por esta recepción (activo,
      // no Costo de Venta todavía — ver nota de diseño arriba) ---
      const montoRecepcion = itemsRecibidos.reduce((acc, i) => acc + i.monto, 0);
      if (montoRecepcion > 0) {
        const proveedorNombre = proveedorNombreOC;
        const fechaRecepcion = new Date();

        const documentoCompraId = documentoCompraIdExistente
          ? documentoCompraIdExistente
          : (
              await tx.documentoCompra.create({
                data: {
                  empresaId,
                  proveedorNombre,
                  tipoComprobante: "sin_comprobante",
                  fecha: fechaRecepcion,
                  condicion: "credito",
                  montoTotal: 0,
                  usuarioId: usuarioActual.id,
                },
              })
            ).id;

        if (!documentoCompraIdExistente) {
          await tx.pedidoCompra.update({ where: { id: pedidoCompraId }, data: { documentoCompraId } });
        }

        // `pedidoCompraDetalleId` es el vínculo real que permite reversar
        // ESTE Gasto con certeza si más adelante se elimina esta línea
        // (o todo el Pedido de Compra) — ver DELETE en ../route.ts.
        for (const item of itemsRecibidos) {
          await tx.gasto.create({
            data: {
              empresaId,
              documentoCompraId,
              naturaleza: "compra_mercaderia_almacen",
              categoriaEspecifica: "Insumos / materia prima (almacén general)",
              proveedorNombre,
              descripcion: `${item.insumoNombre} — recepción de almacén (OC N° ${pedidoCompraId})`,
              tipoComprobante: "sin_comprobante",
              montoTotal: item.monto,
              fecha: fechaRecepcion,
              condicion: "credito",
              origenAutomatico: "recepcion_compra_almacen",
              pedidoCompraDetalleId: item.detalleId,
              usuarioId: usuarioActual.id,
            },
          });
        }

        await tx.documentoCompra.update({
          where: { id: documentoCompraId },
          data: { montoTotal: { increment: montoRecepcion } },
        });

        const cxpExistente = await tx.cuentaPorPagar.findUnique({ where: { documentoCompraId } });
        if (cxpExistente) {
          await tx.cuentaPorPagar.update({
            where: { id: cxpExistente.id },
            data: { montoTotal: { increment: montoRecepcion }, saldoPendiente: { increment: montoRecepcion } },
          });
        } else {
          await tx.cuentaPorPagar.create({
            data: {
              empresaId,
              documentoCompraId,
              proveedorNombre,
              montoTotal: montoRecepcion,
              saldoPendiente: montoRecepcion,
            },
          });
        }
      }

      // --- Estado de la OC según cuánto quedó pendiente ---
      const todos = await tx.pedidoCompraDetalle.findMany({ where: { pedidoCompraId } });
      const pendientes = todos.filter((d) => !d.fechaRecepcion).length;
      const nuevoEstado = pendientes === 0 ? "recibida" : pendientes < todos.length ? "recibida_parcial" : "emitida";
      await tx.pedidoCompra.update({ where: { id: pedidoCompraId }, data: { estado: nuevoEstado } });

      await tx.auditoria.create({
        data: {
          usuarioId: usuarioActual.id,
          empresaId,
          tablaAfectada: "pedidos_compra",
          registroId: pedidoCompraId,
          accion: "editar",
          valorNuevo: { accion: "recepcion", items: parsed.data.items.length },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
