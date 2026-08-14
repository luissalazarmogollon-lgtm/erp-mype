import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const lineaRecetaSchema = z.object({
  insumoId: z.string(),
  cantidadRequerida: z.number().positive(),
  mermaEstandarPct: z.number().min(0).max(100).default(0),
});

const crearProductoSchema = z.object({
  codigo: z.string().optional(),
  nombre: z.string().min(2, "El nombre es obligatorio"),
  categoriaId: z.string().optional(),
  tipo: z.enum(["producto", "servicio"]),
  precioVenta: z.number().min(0),
  requiereReceta: z.boolean().default(false),
  receta: z.array(lineaRecetaSchema).default([]),
});

// GET /api/empresas/[id]/productos — lista productos con su ficha técnica.
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
    include: {
      categoria: true,
      fichaTecnica: { include: { insumo: true } },
    },
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json(
    productos.map((p) => ({
      id: p.id.toString(),
      codigo: p.codigo,
      nombre: p.nombre,
      categoria: p.categoria?.nombre ?? null,
      tipo: p.tipo,
      precioVenta: p.precioVenta.toString(),
      requiereReceta: p.requiereReceta,
      estado: p.estado,
      receta: p.fichaTecnica.map((f) => ({
        insumoNombre: f.insumo.nombre,
        cantidadRequerida: f.cantidadRequerida.toString(),
        costoInsumo: f.insumo.costoPromedioActual.toString(),
      })),
      // Costo estimado actual del producto según su receta (RN-020),
      // recalculado en vivo con el costo promedio de hoy de cada insumo.
      costoEstimadoActual: p.fichaTecnica
        .reduce((acc, f) => acc + Number(f.cantidadRequerida) * Number(f.insumo.costoPromedioActual), 0)
        .toFixed(4),
    }))
  );
}

// POST /api/empresas/[id]/productos — crea un producto y, si requiere
// receta, su ficha técnica completa en la misma transacción (RN-020).
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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const datos = parsed.data;

  if (datos.requiereReceta && datos.receta.length === 0) {
    return NextResponse.json(
      { error: "Si el producto requiere receta, debes agregar al menos un insumo" },
      { status: 400 }
    );
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
        requiereReceta: datos.requiereReceta,
      },
    });

    if (datos.requiereReceta && datos.receta.length > 0) {
      await tx.fichaTecnica.createMany({
        data: datos.receta.map((linea) => ({
          productoId: nuevoProducto.id,
          insumoId: BigInt(linea.insumoId),
          cantidadRequerida: linea.cantidadRequerida,
          mermaEstandarPct: linea.mermaEstandarPct,
        })),
      });
    }

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
