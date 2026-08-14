import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/catalogos — devuelve en un solo request todos los
// catálogos que necesitan los formularios de Insumos, Productos y Ventas
// (categorías, unidades, métodos de pago, y listados livianos de insumos/
// productos/clientes para selects). Evita que cada pantalla tenga que
// hacer 5-6 requests separados.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const [
    categoriasInsumo,
    categoriasProducto,
    unidadesMedida,
    tiposGasto,
    metodosPago,
    insumos,
    productos,
    clientes,
    locales,
  ] = await Promise.all([
    prisma.categoriaInsumo.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } }),
    prisma.categoriaProducto.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } }),
    prisma.unidadMedida.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } }),
    prisma.tipoGasto.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } }),
    prisma.metodoPago.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } }),
    prisma.insumo.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } }),
    prisma.producto.findMany({ where: { empresaId, estado: "activo" }, orderBy: { nombre: "asc" } }),
    prisma.cliente.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } }),
    prisma.local.findMany({ where: { empresaId, estado: "activo" }, orderBy: { nombre: "asc" } }),
  ]);

  const bigintToStr = <T extends { id: bigint }>(arr: T[]) =>
    arr.map((x) => ({ ...x, id: x.id.toString() }));

  return NextResponse.json({
    categoriasInsumo: bigintToStr(categoriasInsumo),
    categoriasProducto: bigintToStr(categoriasProducto),
    unidadesMedida: bigintToStr(unidadesMedida),
    tiposGasto: bigintToStr(tiposGasto),
    metodosPago: bigintToStr(metodosPago),
    insumos: insumos.map((i) => ({
      id: i.id.toString(),
      nombre: i.nombre,
      costoPromedioActual: i.costoPromedioActual.toString(),
      stockActual: i.stockActual.toString(),
    })),
    productos: productos.map((p) => ({
      id: p.id.toString(),
      nombre: p.nombre,
      precioVenta: p.precioVenta.toString(),
      requiereReceta: p.requiereReceta,
    })),
    clientes: clientes.map((c) => ({ id: c.id.toString(), nombre: c.nombre })),
    locales: locales.map((l) => ({ id: l.id.toString(), nombre: l.nombre })),
  });
}
