import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/catalogos — devuelve en un solo request todos los
// catálogos que necesitan los formularios de Insumos, Productos, Ventas,
// Ventas diarias y Gastos.
//
// IMPORTANTE: cada fila de Prisma trae campos BigInt (id, empresaId, y a
// veces otras llaves foráneas) que NextResponse.json() NO puede serializar
// directamente — lanza "Do not know how to serialize a BigInt" y la
// petición completa falla con 500. Por eso aquí NUNCA se hace `{...x}`
// (spread) sobre una fila de Prisma; siempre se listan explícitamente
// los campos que se necesitan, ya convertidos a string donde aplica.
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
    cuentasBancarias,
    empleados,
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
    prisma.cuentaBancaria.findMany({ where: { empresaId, estado: "activo" }, orderBy: { bancoNombre: "asc" } }),
    prisma.empleado.findMany({ where: { empresaId, estado: "activo" }, orderBy: { nombres: "asc" } }),
  ]);

  return NextResponse.json({
    categoriasInsumo: categoriasInsumo.map((c) => ({ id: c.id.toString(), nombre: c.nombre })),
    categoriasProducto: categoriasProducto.map((c) => ({ id: c.id.toString(), nombre: c.nombre })),
    unidadesMedida: unidadesMedida.map((u) => ({ id: u.id.toString(), nombre: u.nombre, abreviatura: u.abreviatura })),
    tiposGasto: tiposGasto.map((t) => ({ id: t.id.toString(), nombre: t.nombre })),
    metodosPago: metodosPago.map((m) => ({ id: m.id.toString(), nombre: m.nombre })),
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
    cuentasBancarias: cuentasBancarias.map((c) => ({
      id: c.id.toString(),
      bancoNombre: c.bancoNombre,
      saldoActual: c.saldoActual.toString(),
    })),
    empleados: empleados.map((e) => ({ id: e.id.toString(), nombre: `${e.nombres} ${e.apellidos}` })),
  });
}
