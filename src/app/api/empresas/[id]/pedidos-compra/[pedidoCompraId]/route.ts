import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

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
