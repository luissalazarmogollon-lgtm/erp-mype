import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const itemRecepcionSchema = z.object({
  detalleId: z.string(),
  cantidadRecibida: z.number().positive("La cantidad recibida debe ser mayor a 0"),
  costoUnitarioReal: z.number().min(0),
});

const recepcionSchema = z.object({
  items: z.array(itemRecepcionSchema).min(1, "Registra al menos un ítem recibido"),
});

// POST /api/empresas/[id]/pedidos-compra/[pedidoCompraId]/recepcion
// El proveedor entregó la mercadería. Por cada línea recibida:
//   1. Crea un LoteCompra nuevo (origen "compra") con el costo REAL pagado.
//   2. Actualiza Insumo.stockActual y su costo promedio (RN-031, igual que
//      cualquier otra entrada).
//   3. Compara el costo nuevo contra el lote anterior del mismo insumo — si
//      la variación supera el umbral de la empresa, crea una alerta.
//   4. Devuelve el ítem de la Solicitud original a "por_despachar" con la
//      cantidad realmente recibida, para que Logística lo despache al área
//      con el mismo mecanismo del Sprint 5 (PEPS) — no se duplica lógica.
export async function POST(
  request: Request,
  { params }: { params: { id: string; pedidoCompraId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "compras");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = recepcionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const pedidoCompraId = BigInt(params.pedidoCompraId);
  const pedido = await prisma.pedidoCompra.findFirst({ where: { id: pedidoCompraId, empresaId } });
  if (!pedido) return NextResponse.json({ error: "Pedido de compra no encontrado" }, { status: 404 });

  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  const umbral = Number(empresa!.umbralAlertaAnomaliaPct);

  try {
    await prisma.$transaction(async (tx) => {
      for (const itemInput of parsed.data.items) {
        const detalleId = BigInt(itemInput.detalleId);
        const detalle = await tx.pedidoCompraDetalle.findFirst({
          where: { id: detalleId, pedidoCompraId },
        });
        if (!detalle) throw new Error(`Ítem ${itemInput.detalleId} no pertenece a este pedido`);
        if (detalle.fechaRecepcion) throw new Error(`El ítem de "${detalle.insumoId}" ya fue recepcionado`);

        const insumo = await tx.insumo.findUniqueOrThrow({ where: { id: detalle.insumoId } });

        // --- 1. Lote nuevo ---
        const nuevoLote = await tx.loteCompra.create({
          data: {
            empresaId,
            insumoId: detalle.insumoId,
            origen: "compra",
            cantidadInicial: itemInput.cantidadRecibida,
            cantidadDisponible: itemInput.cantidadRecibida,
            costoUnitario: itemInput.costoUnitarioReal,
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
            costoUnitario: itemInput.costoUnitarioReal,
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
          (stockActual * costoActual + itemInput.cantidadRecibida * itemInput.costoUnitarioReal) / nuevoStock;

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
            const variacionPct = (Math.abs(itemInput.costoUnitarioReal - costoAnterior) / costoAnterior) * 100;
            if (variacionPct > umbral) {
              await tx.alertaAnomaliaCosto.create({
                data: {
                  empresaId,
                  insumoId: detalle.insumoId,
                  loteAnteriorId: loteAnterior.id,
                  loteNuevoId: nuevoLote.id,
                  costoAnterior,
                  costoNuevo: itemInput.costoUnitarioReal,
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
            costoUnitarioReal: itemInput.costoUnitarioReal,
            fechaRecepcion: new Date(),
          },
        });

        // --- 5. Devuelve el ítem de la Solicitud a "por_despachar" ---
        await tx.solicitudPedidoDetalle.update({
          where: { id: detalle.solicitudDetalleId },
          data: { estadoItem: "por_despachar", cantidadAprobada: itemInput.cantidadRecibida },
        });
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
