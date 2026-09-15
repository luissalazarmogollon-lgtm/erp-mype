import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa, requiereSuperadmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// DELETE /api/empresas/[id]/prestamos/[prestamoId]
//
// Elimina un préstamo, PERO solo si todavía no se le registró ninguna
// cuota — una vez que hay cuotas pagadas (dinero real que ya salió del
// banco como capital/interés), eliminar el préstamo dejaría esos gastos
// huérfanos, sin el préstamo que los originó. Si tenía un desembolso a
// una cuenta bancaria, se reversa (se resta lo que había sumado).
//
// Igual que eliminar un Gasto/CxP/CxC, queda reservado al superadmin de
// la plataforma — es una acción destructiva sobre datos financieros.
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; prestamoId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "prestamos");
    requiereSuperadmin(usuarioActual);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const prestamoId = BigInt(params.prestamoId);
  const prestamo = await prisma.prestamo.findFirst({
    where: { id: prestamoId, empresaId },
    include: { cuotas: true },
  });
  if (!prestamo) return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });

  if (prestamo.cuotas.length > 0) {
    return NextResponse.json(
      { error: "Este préstamo ya tiene cuotas registradas — no se puede eliminar sin perder ese rastro de pagos." },
      { status: 400 }
    );
  }

  const usuarioId = usuarioActual.id;

  await prisma.$transaction(async (tx) => {
    if (prestamo.cuentaBancariaId) {
      // Reversa el desembolso: el ingreso original a la cuenta bancaria.
      const movimiento = await tx.movimientoBancario.findFirst({
        where: { referenciaTipo: "prestamo", referenciaId: prestamo.id },
      });
      if (movimiento) {
        await tx.cuentaBancaria.update({
          where: { id: movimiento.cuentaBancariaId },
          data: { saldoActual: { decrement: movimiento.monto } },
        });
        await tx.movimientoBancario.delete({ where: { id: movimiento.id } });
      }
    }

    await tx.prestamo.delete({ where: { id: prestamoId } });

    await tx.auditoria.create({
      data: {
        usuarioId,
        empresaId,
        tablaAfectada: "prestamos",
        registroId: prestamoId,
        accion: "eliminar",
        valorAnterior: {
          entidadFinanciera: prestamo.entidadFinanciera,
          montoOriginal: prestamo.montoOriginal.toString(),
        },
      },
    });
  });

  return NextResponse.json({ ok: true });
}
