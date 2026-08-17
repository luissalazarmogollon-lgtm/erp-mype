import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/compras/pendientes — ítems de Solicitudes de
// Pedido en estado "pendiente_compra" que TODAVÍA no están en ningún
// Pedido de Compra (no tienen PedidoCompraDetalle vinculado), agrupados
// por el proveedor preferido del insumo. Los que no tienen proveedor
// preferido salen bajo "sin_proveedor" — hay que asignarles uno antes de
// poder consolidarlos.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "compras");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const items = await prisma.solicitudPedidoDetalle.findMany({
    where: {
      estadoItem: "pendiente_compra",
      pedidoCompraDetalle: null,
      solicitud: { empresaId },
    },
    include: {
      insumo: { include: { unidadMedida: true, proveedorPreferido: true } },
      solicitud: { include: { area: true } },
    },
    orderBy: { id: "asc" },
  });

  const grupos = new Map<
    string,
    { proveedorId: string | null; proveedorNombre: string; items: Record<string, unknown>[] }
  >();

  for (const item of items) {
    const proveedor = item.insumo.proveedorPreferido;
    const key = proveedor ? proveedor.id.toString() : "sin_proveedor";
    if (!grupos.has(key)) {
      grupos.set(key, {
        proveedorId: proveedor ? proveedor.id.toString() : null,
        proveedorNombre: proveedor ? proveedor.nombre : "Sin proveedor asignado",
        items: [],
      });
    }
    grupos.get(key)!.items.push({
      detalleId: item.id.toString(),
      insumoId: item.insumoId.toString(),
      insumoNombre: item.insumo.nombre,
      unidadMedida: item.insumo.unidadMedida?.abreviatura ?? null,
      cantidad: item.cantidadAprobada?.toString() ?? item.cantidadSolicitada.toString(),
      costoReferencia: item.insumo.costoPromedioActual.toString(),
      area: item.solicitud.area?.nombre ?? null,
      solicitudId: item.solicitudId.toString(),
    });
  }

  return NextResponse.json(Array.from(grupos.values()));
}
