import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, requiereSuperadmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/empresas/[id]/vaciar-datos
//
// Borra TODOS los registros operativos/transaccionales de una empresa
// (ventas, gastos, CxC, CxP, caja chica, RRHH, insumos, productos,
// clientes, movimientos bancarios) para "empezar desde cero", pero
// CONSERVA lo que es configuración, no dato de prueba:
//   - La empresa misma (rubro, moneda, IGV, nombre...)
//   - Los catálogos clonados del rubro (categorías, unidades, tipos de gasto...)
//   - Los locales (centros de costo)
//   - Las cuentas bancarias — se conservan como cuentas, pero su saldo se
//     resetea a S/ 0 y se borra su historial de movimientos
//   - El equipo asignado (usuarios y sus permisos en esta empresa)
//
// Reservado a superadmin, igual que eliminar una empresa — es igual de
// destructivo para los datos que sí borra.
export async function POST(request: Request, { params }: { params: { id: string } }) {
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
    // Caja Chica
    prisma.gastoCajaChica.deleteMany({ where: { cajaChica: { empresaId } } }),
    prisma.movimientoCajaChica.deleteMany({ where: { cajaChica: { empresaId } } }),
    prisma.cajaChica.deleteMany({ where: { empresaId } }),
    // Cuentas por pagar (CxP), Gastos, Documentos de compra
    prisma.pagoCxp.deleteMany({ where: { cxp: { empresaId } } }),
    prisma.cuentaPorPagar.deleteMany({ where: { empresaId } }),
    prisma.gasto.deleteMany({ where: { empresaId } }),
    prisma.documentoCompra.deleteMany({ where: { empresaId } }),
    // Ventas diarias, RRHH
    prisma.registroVentaDiaria.deleteMany({ where: { empresaId } }),
    prisma.adelantoSueldo.deleteMany({ where: { empresaId } }),
    prisma.empleado.deleteMany({ where: { empresaId } }),
    // Flujo de caja: se borra el HISTORIAL, pero la cuenta se conserva con saldo en 0
    prisma.movimientoBancario.deleteMany({ where: { cuentaBancaria: { empresaId } } }),
    prisma.cuentaBancaria.updateMany({ where: { empresaId }, data: { saldoActual: 0 } }),
    // Solicitudes de Pedido / Compras — datos transaccionales, se borran.
    // Las Áreas se CONSERVAN (son estructura organizativa, igual que Locales).
    prisma.alertaAnomaliaCosto.deleteMany({ where: { empresaId } }),
    prisma.pedidoCompraDetalle.deleteMany({ where: { pedidoCompra: { empresaId } } }),
    prisma.pedidoCompra.deleteMany({ where: { empresaId } }),
    prisma.solicitudPedido.deleteMany({ where: { empresaId } }), // cascada: solicitudes_pedido_detalle
    // Ventas (POS), inventario, productos/insumos, clientes
    prisma.venta.deleteMany({ where: { empresaId } }), // cascada: ventas_detalle
    prisma.merma.deleteMany({ where: { empresaId } }),
    prisma.movimientoInventario.deleteMany({ where: { empresaId } }), // referencia lotes_compra
    prisma.loteCompra.deleteMany({ where: { empresaId } }),
    prisma.producto.deleteMany({ where: { empresaId } }), // cascada: fichas_tecnicas
    prisma.insumo.deleteMany({ where: { empresaId } }), // referencia proveedor preferido
    prisma.cliente.deleteMany({ where: { empresaId } }),
    prisma.proveedor.deleteMany({ where: { empresaId } }),
    // Se CONSERVAN: locales, áreas, cuentas_bancarias (como cuentas), catálogos
    // (categorías/unidades/tipos_gasto/metodos_pago/conceptos), equipo
    // asignado (usuario_empresa), y la empresa misma.
  ]);

  await prisma.auditoria.create({
    data: {
      usuarioId: usuarioActual!.id,
      empresaId,
      tablaAfectada: "empresa",
      registroId: empresaId,
      accion: "eliminar",
      valorAnterior: { accion: "vaciar_datos", nota: "Se borraron todos los registros operativos de prueba" },
    },
  });

  return NextResponse.json({ ok: true });
}
