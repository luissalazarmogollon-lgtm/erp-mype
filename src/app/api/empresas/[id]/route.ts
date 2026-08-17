import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, requiereSuperadmin, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  umbralAlertaAnomaliaPct: z.number().min(0).max(100),
});

// PATCH /api/empresas/[id] — por ahora solo permite ajustar el umbral de
// alerta de anomalía de costo (Sprint 6). Reservado a quien tiene acceso
// total a la empresa (superadmin o Asesor principal).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    const acceso = await verificarAccesoEmpresa(usuarioActual.id, empresaId);
    if (!acceso.accesoTotal) {
      return NextResponse.json({ error: "No tienes permiso para cambiar esta configuración" }, { status: 403 });
    }
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.empresa.update({
    where: { id: empresaId },
    data: { umbralAlertaAnomaliaPct: parsed.data.umbralAlertaAnomaliaPct },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/empresas/[id] — elimina la empresa y TODOS sus datos
// relacionados. Reservado a superadmin, igual que el alta de empresas (RN-004).
//
// El borrado ocurre en una transacción, en el orden correcto (siempre los
// hijos antes que los padres) para no violar las llaves foráneas. Algunas
// tablas ya tienen ON DELETE CASCADE en la base de datos (ventas_detalle,
// fichas_tecnicas, empresa_modulos, solicitudes_pedido_detalle) y se limpian
// solas; el resto se borra explícitamente aquí. Esta lista debe mantenerse
// al día cada vez que se agrega una tabla nueva vinculada a una empresa —
// si algo se olvida aquí, el borrado de la empresa vuelve a fallar por una
// llave foránea pendiente.
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
    // Créditos a clientes (CxC)
    prisma.cobroCxc.deleteMany({ where: { cxc: { empresaId } } }),
    prisma.cuentaPorCobrar.deleteMany({ where: { empresaId } }),
    // Caja Chica (antes de Gastos, porque puede referenciar un gasto trasladado)
    prisma.gastoCajaChica.deleteMany({ where: { cajaChica: { empresaId } } }),
    prisma.movimientoCajaChica.deleteMany({ where: { cajaChica: { empresaId } } }),
    prisma.cajaChica.deleteMany({ where: { empresaId } }),
    // Cuentas por pagar (CxP) y Gastos / Documentos de compra
    prisma.pagoCxp.deleteMany({ where: { cxp: { empresaId } } }),
    prisma.cuentaPorPagar.deleteMany({ where: { empresaId } }),
    prisma.gasto.deleteMany({ where: { empresaId } }),
    prisma.documentoCompra.deleteMany({ where: { empresaId } }),
    // Ventas diarias, RRHH
    prisma.registroVentaDiaria.deleteMany({ where: { empresaId } }),
    prisma.adelantoSueldo.deleteMany({ where: { empresaId } }),
    prisma.empleado.deleteMany({ where: { empresaId } }),
    // Flujo de caja (cuentas bancarias) — al final de lo que las referencia
    prisma.movimientoBancario.deleteMany({ where: { cuentaBancaria: { empresaId } } }),
    prisma.cuentaBancaria.deleteMany({ where: { empresaId } }),
    // Solicitudes de Pedido / Compras — ANTES de insumos y proveedores,
    // porque pedidos_compra_detalle referencia insumo Y solicitud_detalle,
    // y solicitud_pedido referencia área.
    prisma.alertaAnomaliaCosto.deleteMany({ where: { empresaId } }),
    prisma.pedidoCompraDetalle.deleteMany({ where: { pedidoCompra: { empresaId } } }),
    prisma.pedidoCompra.deleteMany({ where: { empresaId } }),
    prisma.solicitudPedido.deleteMany({ where: { empresaId } }), // cascada: solicitudes_pedido_detalle
    // Ventas (POS), inventario, catálogo de productos/insumos
    prisma.venta.deleteMany({ where: { empresaId } }), // cascada: ventas_detalle
    prisma.merma.deleteMany({ where: { empresaId } }),
    prisma.movimientoInventario.deleteMany({ where: { empresaId } }), // referencia lotes_compra
    prisma.loteCompra.deleteMany({ where: { empresaId } }),
    prisma.producto.deleteMany({ where: { empresaId } }), // cascada: fichas_tecnicas
    prisma.insumo.deleteMany({ where: { empresaId } }), // referencia proveedor preferido
    prisma.cliente.deleteMany({ where: { empresaId } }),
    prisma.proveedor.deleteMany({ where: { empresaId } }),
    prisma.area.deleteMany({ where: { empresaId } }),
    // Locales y catálogos base
    prisma.local.deleteMany({ where: { empresaId } }),
    prisma.categoriaInsumo.deleteMany({ where: { empresaId } }),
    prisma.unidadMedida.deleteMany({ where: { empresaId } }),
    prisma.categoriaProducto.deleteMany({ where: { empresaId } }),
    prisma.tipoGasto.deleteMany({ where: { empresaId } }),
    prisma.metodoPago.deleteMany({ where: { empresaId } }),
    prisma.conceptoMovimientoCaja.deleteMany({ where: { empresaId } }),
    // Equipo asignado, auditoría, y la empresa misma
    prisma.usuarioEmpresa.deleteMany({ where: { empresaId } }),
    prisma.auditoria.deleteMany({ where: { empresaId } }),
    prisma.empresa.delete({ where: { id: empresaId } }), // cascada: empresa_modulos
  ]);

  return NextResponse.json({ ok: true });
}
