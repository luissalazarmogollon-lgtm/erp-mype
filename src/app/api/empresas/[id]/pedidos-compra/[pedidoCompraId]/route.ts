import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { reversarLineaCompra } from "@/lib/reversarAlmacen";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/pedidos-compra/[pedidoCompraId]
export async function GET(
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

  const pedido = await prisma.pedidoCompra.findFirst({
    where: { id: BigInt(params.pedidoCompraId), empresaId },
    include: {
      proveedor: true,
      detalle: { include: { insumo: { include: { unidadMedida: true } } } },
    },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido de compra no encontrado" }, { status: 404 });

  return NextResponse.json({
    id: pedido.id.toString(),
    estado: pedido.estado,
    fecha: pedido.fecha,
    proveedor: {
      id: pedido.proveedor.id.toString(),
      nombre: pedido.proveedor.nombre,
      ruc: pedido.proveedor.ruc,
      contacto: pedido.proveedor.contacto,
      telefono: pedido.proveedor.telefono,
    },
    detalle: pedido.detalle.map((d) => ({
      id: d.id.toString(),
      insumoId: d.insumoId.toString(),
      insumoNombre: d.insumo.nombre,
      unidadMedida: d.insumo.unidadMedida?.abreviatura ?? null,
      cantidad: d.cantidad.toString(),
      costoUnitarioEstimado: d.costoUnitarioEstimado?.toString() ?? null,
      cantidadRecibida: d.cantidadRecibida?.toString() ?? null,
      costoUnitarioReal: d.costoUnitarioReal?.toString() ?? null,
      recibido: d.fechaRecepcion !== null,
    })),
  });
}

// DELETE /api/empresas/[id]/pedidos-compra/[pedidoCompraId]
//
// RN nueva: elimina el Pedido de Compra completo — "la entrada de
// mercadería al almacén" — reversando línea por línea con
// reversarLineaCompra (ver src/lib/reversarAlmacen.ts):
//   - Línea NO recibida todavía: se borra sin más (el ítem de la
//     Solicitud vuelve a aparecer en "Pendientes de consolidar").
//   - Línea YA recibida: revierte el lote/Kardex/stock/costo promedio del
//     insumo y el Gasto de compra de mercadería (activo, no tocaba el
//     Estado de Resultados) + su Cuenta por Pagar, y devuelve el ítem de
//     la Solicitud a "pendiente_compra" — como si nunca se hubiera
//     comprado.
// Se BLOQUEA (transacción atómica, nada se aplica) si cualquier línea:
//   - ya fue despachada a un área (hay que eliminar esa Solicitud
//     primero, desde Solicitudes de Pedido), o
//   - tiene pagos ya registrados en Cuentas por Pagar (el Flujo de Caja
//     no se toca nunca).
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; pedidoCompraId: string } }
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

  const pedidoCompraId = BigInt(params.pedidoCompraId);
  const pedido = await prisma.pedidoCompra.findFirst({
    where: { id: pedidoCompraId, empresaId },
    include: { detalle: true, proveedor: true },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido de compra no encontrado" }, { status: 404 });

  // Ver nota de closures en decidir/route.ts — se extraen a variables
  // locales para usarlas dentro de la función anidada de
  // prisma.$transaction(async (tx) => {...}) más abajo.
  const lineas = pedido.detalle;
  const proveedorNombre = pedido.proveedor.nombre;
  const estadoAnterior = pedido.estado;

  try {
    const resumen = await prisma.$transaction(async (tx) => {
      let montoRevertido = 0;
      for (const linea of lineas) {
        const r = await reversarLineaCompra(tx, linea.id);
        montoRevertido += r.montoReversado;
      }

      // reversarLineaCompra ya borró todas las líneas — el pedido queda
      // vacío y se puede eliminar sin dejar nada huérfano.
      await tx.pedidoCompra.delete({ where: { id: pedidoCompraId } });

      await tx.auditoria.create({
        data: {
          usuarioId,
          empresaId,
          tablaAfectada: "pedidos_compra",
          registroId: pedidoCompraId,
          accion: "eliminar",
          valorAnterior: { proveedor: proveedorNombre, estado: estadoAnterior, items: lineas.length, montoRevertido },
        },
      });

      return { montoRevertido, items: lineas.length };
    });

    return NextResponse.json({ ok: true, ...resumen });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
