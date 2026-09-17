import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const editarProductoSchema = z.object({
  codigo: z.string().nullable().optional(),
  nombre: z.string().min(2, "El nombre es obligatorio"),
  categoriaId: z.string().nullable().optional(),
  tipo: z.enum(["producto", "servicio"]).optional(),
  precioVenta: z.number().min(0).optional(),
  unidadMedidaId: z.string().nullable().optional(),
  stockMinimo: z.number().min(0).optional(),
});

// PATCH /api/empresas/[id]/productos/[productoId] — edita los datos
// maestros de un producto (nombre, código, categoría, tipo, precio de
// venta, unidad de medida, stock mínimo). No toca stockActual ni
// costoPromedioActual — esos solo cambian por "Ajustar stock" o por una
// venta, nunca desde aquí (mismo criterio que Insumo).
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; productoId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "productos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = editarProductoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  }
  const datos = parsed.data;

  const productoId = BigInt(params.productoId);
  const producto = await prisma.producto.findFirst({ where: { id: productoId, empresaId } });
  if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  // Validación cross-tenant: igual que en la creación, sin esto se podría
  // asignar una categoría o unidad de medida de otra empresa.
  if (datos.categoriaId) {
    const categoria = await prisma.categoriaProducto.findFirst({
      where: { id: BigInt(datos.categoriaId), empresaId },
    });
    if (!categoria) {
      return NextResponse.json({ error: "La categoría seleccionada no existe en esta empresa" }, { status: 400 });
    }
  }
  if (datos.unidadMedidaId) {
    const unidad = await prisma.unidadMedida.findFirst({
      where: { id: BigInt(datos.unidadMedidaId), empresaId },
    });
    if (!unidad) {
      return NextResponse.json({ error: "La unidad de medida seleccionada no existe en esta empresa" }, { status: 400 });
    }
  }

  await prisma.producto.update({
    where: { id: productoId },
    data: {
      codigo: datos.codigo || null,
      nombre: datos.nombre,
      categoriaId: datos.categoriaId ? BigInt(datos.categoriaId) : null,
      ...(datos.tipo !== undefined ? { tipo: datos.tipo } : {}),
      ...(datos.precioVenta !== undefined ? { precioVenta: datos.precioVenta } : {}),
      unidadMedidaId: datos.unidadMedidaId ? BigInt(datos.unidadMedidaId) : null,
      ...(datos.stockMinimo !== undefined ? { stockMinimo: datos.stockMinimo } : {}),
    },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: usuarioActual.id,
      empresaId,
      tablaAfectada: "productos",
      registroId: productoId,
      accion: "editar",
      valorNuevo: { nombre: datos.nombre, codigo: datos.codigo ?? null },
    },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/empresas/[id]/productos/[productoId] — "elimina" un
// producto. Igual que Insumo: casi siempre tiene historial detrás
// (Kardex, lotes, ventas) que no se puede borrar sin perder trazabilidad,
// así que esto NUNCA es un borrado físico — solo marca el producto como
// "inactivo" (columna que Producto ya tenía). Un producto inactivo
// desaparece de la lista y de los selectores (nueva Venta, etc. — ver
// catalogos/route.ts, que ya filtra por estado), pero su stock/costo/
// Kardex y el historial de ventas que lo referencian quedan intactos.
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; productoId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "productos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const productoId = BigInt(params.productoId);
  const producto = await prisma.producto.findFirst({ where: { id: productoId, empresaId } });
  if (!producto) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  await prisma.producto.update({ where: { id: productoId }, data: { estado: "inactivo" } });

  await prisma.auditoria.create({
    data: {
      usuarioId: usuarioActual.id,
      empresaId,
      tablaAfectada: "productos",
      registroId: productoId,
      accion: "eliminar",
      valorAnterior: { nombre: producto.nombre, stockActual: producto.stockActual.toString() },
    },
  });

  return NextResponse.json({ ok: true });
}
