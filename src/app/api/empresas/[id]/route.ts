import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, requiereSuperadmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// DELETE /api/empresas/[id] — elimina la empresa y TODOS sus datos
// relacionados (ventas, gastos, insumos, catálogos, equipo asignado...).
// Reservado a superadmin, igual que el alta de empresas (RN-004).
//
// El borrado ocurre en una transacción, en el orden correcto (hijos antes
// que padres) para no violar las llaves foráneas. Algunas tablas ya tienen
// ON DELETE CASCADE en la base de datos (ventas_detalle, fichas_tecnicas,
// empresa_modulos) y se limpian solas; el resto se borra explícitamente aquí.
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();

  try {
    requiereSuperadmin(usuarioActual);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const empresaId = BigInt(params.id);
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.cobroCxc.deleteMany({ where: { cxc: { empresaId } } }),
    prisma.pagoCxp.deleteMany({ where: { cxp: { empresaId } } }),
    prisma.cuentaPorPagar.deleteMany({ where: { empresaId } }),
    prisma.gasto.deleteMany({ where: { empresaId } }),
    prisma.cuentaPorCobrar.deleteMany({ where: { empresaId } }),
    prisma.registroVentaDiaria.deleteMany({ where: { empresaId } }),
    prisma.venta.deleteMany({ where: { empresaId } }), // cascada: ventas_detalle
    prisma.merma.deleteMany({ where: { empresaId } }),
    prisma.movimientoInventario.deleteMany({ where: { empresaId } }),
    prisma.producto.deleteMany({ where: { empresaId } }), // cascada: fichas_tecnicas
    prisma.insumo.deleteMany({ where: { empresaId } }),
    prisma.cliente.deleteMany({ where: { empresaId } }),
    prisma.local.deleteMany({ where: { empresaId } }),
    prisma.categoriaInsumo.deleteMany({ where: { empresaId } }),
    prisma.unidadMedida.deleteMany({ where: { empresaId } }),
    prisma.categoriaProducto.deleteMany({ where: { empresaId } }),
    prisma.tipoGasto.deleteMany({ where: { empresaId } }),
    prisma.metodoPago.deleteMany({ where: { empresaId } }),
    prisma.conceptoMovimientoCaja.deleteMany({ where: { empresaId } }),
    prisma.usuarioEmpresa.deleteMany({ where: { empresaId } }),
    prisma.auditoria.deleteMany({ where: { empresaId } }),
    prisma.empresa.delete({ where: { id: empresaId } }), // cascada: empresa_modulos
  ]);

  return NextResponse.json({ ok: true });
}
