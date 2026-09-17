import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { reversarDespachoItem } from "@/lib/reversarAlmacen";

export const dynamic = "force-dynamic";

// DELETE /api/empresas/[id]/solicitudes-pedido/[solicitudId]/detalle/[detalleId]
//
// RN nueva: elimina UN SOLO ítem YA DESPACHADO de una Solicitud de Pedido,
// sin tocar el resto de la Solicitud ni el Pedido de Compra que lo haya
// originado (si vino de una compra ya recepcionada, esa recepción queda
// intacta — la mercadería sigue en el almacén, solo se deshace la entrega
// al área). Es el equivalente granular, ítem por ítem, del DELETE de toda
// la Solicitud en ../../route.ts:
//   - Devuelve la cantidad consumida a sus lotes de origen (PEPS) y
//     restaura Insumo.stockActual.
//   - Borra el movimiento de Kardex ("salida_solicitud") que generó el
//     despacho.
//   - Borra el Gasto de Costo de Venta ("despacho_almacen") que generó —
//     desaparece del Estado de Resultados.
//   - Deja el ítem en estadoItem "eliminado" (con cantidadAprobada en
//     null) en vez de "por_despachar", porque a diferencia del DELETE de
//     toda la Solicitud, aquí la Solicitud sigue viva: si volviera a
//     "por_despachar" reaparecería en la bandeja de despacho como si
//     nunca se hubiera atendido, lo cual no es la intención de este botón
//     ("eliminar productos despachados").
//
// Bloqueo (no se permite eliminar, se detiene todo): si el Gasto de
// despacho tuviera, por algún dato antiguo o manual, una Cuenta por Pagar
// propia con pagos ya registrados — el Flujo de Caja nunca se toca aquí
// (mismo criterio que reversarAlmacen.ts en general).
//
// Permisos: el encargado de almacén (permiso "despachar_solicitudes_pedido"
// — el mismo que ejecuta el despacho en primer lugar, sin importar el
// origen de la solicitud, ver despachar/route.ts) o acceso total/superadmin.
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; solicitudId: string; detalleId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const usuarioId = usuarioActual.id;

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioId, empresaId, "despachar_solicitudes_pedido");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const solicitudId = BigInt(params.solicitudId);
  const detalleId = BigInt(params.detalleId);
  const item = await prisma.solicitudPedidoDetalle.findFirst({
    where: { id: detalleId, solicitudId, estadoItem: "despachado", solicitud: { empresaId } },
    include: { insumo: true },
  });
  if (!item) {
    return NextResponse.json(
      { error: "El ítem no existe o ya no está despachado (puede que ya se haya eliminado)" },
      { status: 404 }
    );
  }

  try {
    const resumen = await prisma.$transaction(async (tx) => {
      const r = await reversarDespachoItem(tx, detalleId, "eliminado");

      await tx.auditoria.create({
        data: {
          usuarioId,
          empresaId,
          tablaAfectada: "solicitudes_pedido_detalle",
          registroId: detalleId,
          accion: "eliminar",
          valorAnterior: {
            origen: "despacho",
            insumo: item.insumo.nombre,
            cantidadRestaurada: r.cantidadRestaurada,
            montoReversado: r.montoReversado,
            solicitudId: solicitudId.toString(),
          },
        },
      });

      return r;
    });

    return NextResponse.json({ ok: true, ...resumen });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
