import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const crearPedidoSchema = z.object({
  proveedorId: z.string().min(1),
  detalleIds: z.array(z.string()).min(1, "Selecciona al menos un ítem"),
});

// GET /api/empresas/[id]/pedidos-compra
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "compras");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const pedidos = await prisma.pedidoCompra.findMany({
    where: { empresaId },
    include: { proveedor: true, detalle: true },
    orderBy: { fecha: "desc" },
  });

  return NextResponse.json(
    pedidos.map((p) => ({
      id: p.id.toString(),
      proveedor: p.proveedor.nombre,
      estado: p.estado,
      fecha: p.fecha,
      cantidadItems: p.detalle.length,
    }))
  );
}

// POST /api/empresas/[id]/pedidos-compra — consolida ítems "pendiente_compra"
// (de una o varias Solicitudes de Pedido) en una sola Orden de Compra para
// UN proveedor. Cada línea de solicitud queda vinculada 1 a 1 a su línea
// en la OC — así se sabe exactamente a qué solicitud regresarle el stock
// cuando se reciba.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "compras");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearPedidoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const datos = parsed.data;

  const proveedorId = BigInt(datos.proveedorId);
  const proveedor = await prisma.proveedor.findFirst({ where: { id: proveedorId, empresaId } });
  if (!proveedor) return NextResponse.json({ error: "Proveedor no válido" }, { status: 400 });

  const detalleIds = datos.detalleIds.map(BigInt);
  const items = await prisma.solicitudPedidoDetalle.findMany({
    where: {
      id: { in: detalleIds },
      estadoItem: "pendiente_compra",
      pedidoCompraDetalle: null,
      solicitud: { empresaId },
    },
    include: { insumo: true },
  });

  if (items.length === 0) {
    return NextResponse.json(
      { error: "Ninguno de los ítems seleccionados está disponible para consolidar (ya fue asignado a otra OC, o cambió de estado)" },
      { status: 400 }
    );
  }

  const pedido = await prisma.pedidoCompra.create({
    data: {
      empresaId,
      proveedorId,
      usuarioId: usuarioActual.id,
      detalle: {
        create: items.map((item) => ({
          solicitudDetalleId: item.id,
          insumoId: item.insumoId,
          cantidad: item.cantidadAprobada ?? item.cantidadSolicitada,
          costoUnitarioEstimado: item.insumo.costoPromedioActual,
        })),
      },
    },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: usuarioActual.id,
      empresaId,
      tablaAfectada: "pedidos_compra",
      registroId: pedido.id,
      accion: "crear",
      valorNuevo: { proveedor: proveedor.nombre, items: items.length },
    },
  });

  return NextResponse.json({ id: pedido.id.toString() }, { status: 201 });
}
