import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Producto = mercadería de venta al público comprada ya terminada para
// revender (gaseosa, agua, etc.) — ya no se construye con una receta/ficha
// técnica. Stock y costo funcionan exactamente igual que en Insumo:
// arrancan en 0 y se cargan con "Ajustar stock" (ver
// /productos/[productoId]/ajuste) hasta que exista un flujo de Compras
// propio para Productos.
const crearProductoSchema = z.object({
  codigo: z.string().optional(),
  nombre: z.string().min(2, "El nombre es obligatorio"),
  categoriaId: z.string().optional(),
  tipo: z.enum(["producto", "servicio"]),
  precioVenta: z.number().min(0),
  unidadMedidaId: z.string().optional(),
  stockMinimo: z.number().min(0).default(0),
});

// GET /api/empresas/[id]/productos — lista productos con su stock y costo actual.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "productos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const productos = await prisma.producto.findMany({
    where: { empresaId },
    include: { categoria: true, unidadMedida: true },
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json(
    productos.map((p) => ({
      id: p.id.toString(),
      codigo: p.codigo,
      nombre: p.nombre,
      categoriaId: p.categoriaId?.toString() ?? null,
      categoria: p.categoria?.nombre ?? null,
      tipo: p.tipo,
      precioVenta: p.precioVenta.toString(),
      estado: p.estado,
      unidadMedidaId: p.unidadMedidaId?.toString() ?? null,
      unidadMedida: p.unidadMedida?.abreviatura ?? null,
      stockMinimo: p.stockMinimo.toString(),
      stockActual: p.stockActual.toString(),
      costoPromedioActual: p.costoPromedioActual.toString(),
      bajoMinimo: Number(p.stockActual) < Number(p.stockMinimo),
      margen: (Number(p.precioVenta) - Number(p.costoPromedioActual)).toFixed(2),
    }))
  );
}

// POST /api/empresas/[id]/productos — crea un producto nuevo (stock y
// costo inician en 0; se cargan con "Ajustar stock").
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "productos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearProductoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  }
  const datos = parsed.data;

  // Validación cross-tenant: categoriaId/unidadMedidaId llegan del cliente
  // como simples IDs — sin verificar, alguien podría (por error o a
  // propósito) enviar el ID de una categoría o unidad de OTRA empresa, y
  // Prisma lo aceptaría igual porque la FK no exige que empresaId coincida.
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

  const producto = await prisma.$transaction(async (tx) => {
    const nuevoProducto = await tx.producto.create({
      data: {
        empresaId,
        codigo: datos.codigo || null,
        nombre: datos.nombre,
        categoriaId: datos.categoriaId ? BigInt(datos.categoriaId) : null,
        tipo: datos.tipo,
        precioVenta: datos.precioVenta,
        unidadMedidaId: datos.unidadMedidaId ? BigInt(datos.unidadMedidaId) : null,
        stockMinimo: datos.stockMinimo,
      },
    });

    await tx.auditoria.create({
      data: {
        usuarioId: usuarioActual.id,
        empresaId,
        tablaAfectada: "productos",
        registroId: nuevoProducto.id,
        accion: "crear",
        valorNuevo: { nombre: nuevoProducto.nombre, precioVenta: nuevoProducto.precioVenta.toString() },
      },
    });

    return nuevoProducto;
  });

  return NextResponse.json({ id: producto.id.toString(), nombre: producto.nombre }, { status: 201 });
}
