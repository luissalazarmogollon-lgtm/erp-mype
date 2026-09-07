import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoAlguno, requiereSuperadmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// DELETE /api/empresas/[id]/cuentas-por-cobrar/[cxcId]
//
// Elimina un crédito a cliente (cuenta por cobrar) registrado por error —
// acción destructiva sobre datos financieros, reservada exclusivamente al
// superadmin de la plataforma, en cualquier empresa (mismo criterio que ya
// se aplica en Gastos y Costos y en Cuentas por Pagar).
//
// Si ya tiene cobros registrados, se BLOQUEA: no existe hoy una forma de
// deshacer un cobro individual, así que eliminar la CxC borraría el
// rastro de un dinero que sí entró a caja — hay que dejarla como está.
export async function DELETE(request: Request, { params }: { params: { id: string; cxcId: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    // El permiso normal de Créditos/Facturación confirma que la empresa
    // existe y el usuario tiene relación con ella; eliminar en sí queda
    // reservado al superadmin.
    await verificarAccesoAlguno(usuarioActual.id, empresaId, ["creditos", "ventas_diarias"]);
    requiereSuperadmin(usuarioActual);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const cxcId = BigInt(params.cxcId);
  const usuarioId = usuarioActual.id;

  try {
    await prisma.$transaction(async (tx) => {
      const cxc = await tx.cuentaPorCobrar.findFirst({
        where: { id: cxcId, empresaId },
        include: { cobros: true, cliente: true },
      });
      if (!cxc) throw new Error("__404__");

      if (cxc.cobros.length > 0) {
        throw new Error(
          "Este crédito ya tiene cobros registrados — no se puede eliminar, para no perder el rastro de ese dinero que ya entró a caja."
        );
      }

      await tx.cuentaPorCobrar.delete({ where: { id: cxc.id } });

      await tx.auditoria.create({
        data: {
          usuarioId,
          empresaId,
          tablaAfectada: "cuentas_por_cobrar",
          registroId: cxc.id,
          accion: "eliminar",
          valorAnterior: {
            cliente: cxc.cliente.nombre,
            numeroFactura: cxc.numeroFactura,
            montoTotal: cxc.montoTotal.toString(),
          },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const mensaje = (error as Error).message;
    if (mensaje === "__404__") return NextResponse.json({ error: "Cuenta por cobrar no encontrada" }, { status: 404 });
    return NextResponse.json({ error: mensaje }, { status: 400 });
  }
}
