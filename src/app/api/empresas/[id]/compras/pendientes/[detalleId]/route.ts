import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// DELETE /api/empresas/[id]/compras/pendientes/[detalleId]
//
// Cancela UN ítem de la lista "Pendientes de consolidar por proveedor"
// (Compras) — un SolicitudPedidoDetalle en estadoItem "pendiente_compra"
// que TODAVÍA no fue asignado a ninguna Orden de Compra
// (pedidoCompraDetalle === null, igual filtro que .../compras/pendientes
// GET). Como todavía no se compró nada, no hay lote, Kardex, Gasto ni
// Cuenta por Pagar que revertir — es simplemente "ya no se va a comprar
// este ítem".
//
// No se borra la fila (mismo criterio que decidir/route.ts al rechazar un
// ítem): se marca estadoItem "eliminado" para conservar el historial
// dentro de la Solicitud de Pedido de origen — quien la creó sigue
// viendo, en el detalle de su solicitud, que ese ítem fue aprobado pero
// finalmente no se compró, en vez de que desaparezca sin dejar rastro.
//
// Permiso: mismo que el resto de Compras (acceso al módulo "compras" o
// acceso total/superadmin) — no hace falta ser el encargado de almacén
// aquí, porque no se toca inventario ni finanzas, solo se descarta una
// necesidad de compra todavía no ejecutada.
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; detalleId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const usuarioId = usuarioActual.id;

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioId, empresaId, "compras");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const detalleId = BigInt(params.detalleId);
  const item = await prisma.solicitudPedidoDetalle.findFirst({
    where: {
      id: detalleId,
      estadoItem: "pendiente_compra",
      pedidoCompraDetalle: null,
      solicitud: { empresaId },
    },
    include: { insumo: true, solicitud: true },
  });
  if (!item) {
    return NextResponse.json(
      {
        error:
          "Este ítem ya no está pendiente de consolidar (puede que ya se haya asignado a una orden de compra, o que ya haya sido eliminado).",
      },
      { status: 404 }
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.solicitudPedidoDetalle.update({
      where: { id: detalleId },
      data: { estadoItem: "eliminado", cantidadAprobada: null },
    });

    await tx.auditoria.create({
      data: {
        usuarioId,
        empresaId,
        tablaAfectada: "solicitudes_pedido_detalle",
        registroId: detalleId,
        accion: "eliminar",
        valorAnterior: {
          origen: "compras_pendientes",
          insumo: item.insumo.nombre,
          cantidad: (item.cantidadAprobada ?? item.cantidadSolicitada).toString(),
          solicitudId: item.solicitudId.toString(),
        },
      },
    });
  });

  return NextResponse.json({ ok: true });
}
