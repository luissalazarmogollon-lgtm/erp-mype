import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// DELETE /api/empresas/[id]/ventas-diarias/[registroId]
//
// Elimina un registro de ventas diarias, PERO solo si todavía no se
// concilió ningún método de pago con una cuenta bancaria (las 4 columnas
// *CuentaId deben estar vacías). Si ya se concilió aunque sea un método,
// se bloquea el borrado — eliminar en ese punto dejaría un movimiento
// bancario y un saldo de cuenta huérfanos, sin la venta que los originó.
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; registroId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "ventas_diarias");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const registroId = BigInt(params.registroId);
  const registro = await prisma.registroVentaDiaria.findFirst({ where: { id: registroId, empresaId } });
  if (!registro) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });

  const yaConciliado =
    registro.efectivoCuentaId !== null ||
    registro.yapeCuentaId !== null ||
    registro.plinCuentaId !== null ||
    registro.tarjetaCuentaId !== null;

  if (yaConciliado) {
    return NextResponse.json(
      { error: "No se puede eliminar: al menos un método de pago ya se actualizó en el flujo de caja." },
      { status: 400 }
    );
  }

  await prisma.$transaction([
    prisma.auditoria.create({
      data: {
        usuarioId: usuarioActual.id,
        empresaId,
        tablaAfectada: "registros_venta_diaria",
        registroId,
        accion: "eliminar",
        valorAnterior: {
          fecha: registro.fecha.toISOString().slice(0, 10),
          montoEfectivo: registro.montoEfectivo.toString(),
          montoYape: registro.montoYape.toString(),
          montoPlin: registro.montoPlin.toString(),
          montoTarjeta: registro.montoTarjeta.toString(),
        },
      },
    }),
    prisma.registroVentaDiaria.delete({ where: { id: registroId } }),
  ]);

  return NextResponse.json({ ok: true });
}
