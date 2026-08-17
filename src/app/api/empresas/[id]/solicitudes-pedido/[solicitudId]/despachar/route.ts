import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const despacharSchema = z.object({
  detalleIds: z.array(z.string()).min(1, "Selecciona al menos un ítem para despachar"),
});

// POST /api/empresas/[id]/solicitudes-pedido/[solicitudId]/despachar
// Entrega física al área solicitante. SOLO AQUÍ se descuenta el stock real
// (la aprobación solo lo comprometió). Cada ítem se despacha completo
// (su cantidadAprobada) y consume Lotes en orden PEPS — puede tocar
// varios lotes con costos distintos, generando un movimiento de Kardex
// por cada uno.
export async function POST(
  request: Request,
  { params }: { params: { id: string; solicitudId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "despachar_solicitudes_pedido");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = despacharSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const solicitudId = BigInt(params.solicitudId);
  const solicitud = await prisma.solicitudPedido.findFirst({
    where: { id: solicitudId, empresaId },
  });
  if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  if (solicitud.estado !== "aprobada") {
    return NextResponse.json({ error: "Solo se pueden despachar solicitudes aprobadas" }, { status: 400 });
  }

  const detalleIds = parsed.data.detalleIds.map(BigInt);
  const items = await prisma.solicitudPedidoDetalle.findMany({
    where: { id: { in: detalleIds }, solicitudId, estadoItem: "por_despachar" },
  });
  if (items.length === 0) {
    return NextResponse.json({ error: "No hay ítems válidos para despachar (ya despachados o inválidos)" }, { status: 400 });
  }

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const despachados: { detalleId: string; insumoId: string; cantidad: number }[] = [];

      for (const item of items) {
        let faltante = Number(item.cantidadAprobada);
        const lotes = await tx.loteCompra.findMany({
          where: { insumoId: item.insumoId, cantidadDisponible: { gt: 0 } },
          orderBy: { fechaIngreso: "asc" },
        });

        for (const lote of lotes) {
          if (faltante <= 0) break;
          const disponibleLote = Number(lote.cantidadDisponible);
          const consumir = Math.min(disponibleLote, faltante);

          await tx.loteCompra.update({
            where: { id: lote.id },
            data: { cantidadDisponible: disponibleLote - consumir },
          });
          await tx.movimientoInventario.create({
            data: {
              empresaId,
              insumoId: item.insumoId,
              tipo: "salida_solicitud",
              cantidad: -consumir,
              costoUnitario: lote.costoUnitario,
              loteId: lote.id,
              usuarioId: usuarioActual.id,
              referenciaTipo: "solicitud_pedido_detalle",
              referenciaId: item.id,
            },
          });
          faltante -= consumir;
        }

        if (faltante > 0) {
          // Los lotes no alcanzan para cubrir lo aprobado — inconsistencia
          // entre Insumo.stockActual y la suma de lotes. Se detiene todo.
          throw new Error(
            `Inconsistencia de lotes en "${item.insumoId}": faltan ${faltante} unidades sin respaldo en lotes. Revisa los ajustes de stock de este insumo.`
          );
        }

        await tx.insumo.update({
          where: { id: item.insumoId },
          data: { stockActual: { decrement: Number(item.cantidadAprobada) } },
        });
        await tx.solicitudPedidoDetalle.update({
          where: { id: item.id },
          data: { estadoItem: "despachado", fechaDespacho: new Date() },
        });

        despachados.push({
          detalleId: item.id.toString(),
          insumoId: item.insumoId.toString(),
          cantidad: Number(item.cantidadAprobada),
        });
      }

      await tx.auditoria.create({
        data: {
          usuarioId: usuarioActual.id,
          empresaId,
          tablaAfectada: "solicitudes_pedido_detalle",
          registroId: solicitudId,
          accion: "editar",
          valorNuevo: { accion: "despacho", items: despachados },
        },
      });

      return despachados;
    });

    return NextResponse.json({ despachados: resultado });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
