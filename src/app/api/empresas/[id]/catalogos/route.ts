import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import type { ModuloKey } from "@/lib/permisosModulo";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/catalogos — devuelve en un solo request todos los
// catálogos que necesitan los formularios de Insumos, Productos, Ventas,
// Ventas diarias y Gastos.
//
// Antes, cualquier persona con acceso a la empresa (aunque solo tuviera
// permiso de, por ejemplo, Ventas POS) recibía TODO: incluyendo el saldo
// de las cuentas bancarias y la lista de proveedores — datos que no tienen
// relación con su módulo. Ahora cada sección solo se incluye si la
// persona tiene permiso sobre algún módulo que realmente la necesita
// (o acceso total). `areas`, `empleados` y `tiposGasto` se quitaron del
// todo: no los usa ningún formulario actual.
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
  let acceso: Awaited<ReturnType<typeof verificarAccesoEmpresa>>;
  try {
    acceso = await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const tienePermiso = (modulos: ModuloKey[]) =>
    acceso.accesoTotal || modulos.some((m) => acceso.permisos.includes(m));

  // Las cuentas bancarias incluyen su saldo — solo se ofrecen a módulos
  // que de verdad necesitan elegir una cuenta para un movimiento de dinero.
  const incluirCuentasBancarias = tienePermiso([
    "flujo_caja",
    "gastos",
    "cuentas_por_pagar",
    "cuentas_por_pagar_registrar",
    "ventas_diarias",
    "rrhh",
    "creditos",
    "caja_chica",
  ]);
  // Proveedores solo lo usa el formulario de Insumos (proveedor preferido).
  const incluirProveedores = tienePermiso(["insumos", "compras"]);

  const [
    categoriasInsumo,
    categoriasProducto,
    unidadesMedida,
    metodosPago,
    insumos,
    productos,
    clientes,
    locales,
    cuentasBancarias,
    proveedores,
  ] = await Promise.all([
    prisma.categoriaInsumo.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } }),
    prisma.categoriaProducto.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } }),
    prisma.unidadMedida.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } }),
    prisma.metodoPago.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } }),
    prisma.insumo.findMany({ where: { empresaId }, include: { unidadMedida: true }, orderBy: { nombre: "asc" } }),
    prisma.producto.findMany({ where: { empresaId, estado: "activo" }, orderBy: { nombre: "asc" } }),
    prisma.cliente.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } }),
    prisma.local.findMany({ where: { empresaId, estado: "activo" }, orderBy: { nombre: "asc" } }),
    incluirCuentasBancarias
      ? prisma.cuentaBancaria.findMany({ where: { empresaId, estado: "activo" }, orderBy: { bancoNombre: "asc" } })
      : Promise.resolve([]),
    incluirProveedores
      ? prisma.proveedor.findMany({ where: { empresaId, estado: "activo" }, orderBy: { nombre: "asc" } })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    categoriasInsumo: categoriasInsumo.map((c) => ({ id: c.id.toString(), nombre: c.nombre })),
    categoriasProducto: categoriasProducto.map((c) => ({ id: c.id.toString(), nombre: c.nombre })),
    unidadesMedida: unidadesMedida.map((u) => ({ id: u.id.toString(), nombre: u.nombre, abreviatura: u.abreviatura })),
    metodosPago: metodosPago.map((m) => ({ id: m.id.toString(), nombre: m.nombre })),
    insumos: insumos.map((i) => ({
      id: i.id.toString(),
      nombre: i.nombre,
      costoPromedioActual: i.costoPromedioActual.toString(),
      stockActual: i.stockActual.toString(),
      unidadMedida: i.unidadMedida?.abreviatura ?? null,
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
    proveedores: proveedores.map((p) => ({ id: p.id.toString(), nombre: p.nombre })),
  });
}
