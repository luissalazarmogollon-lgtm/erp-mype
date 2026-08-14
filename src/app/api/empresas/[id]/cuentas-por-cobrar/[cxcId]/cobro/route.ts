import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const cobroSchema = z.object({
  monto: z.number().positive(),
  medioPago: z.string().optional(),
});

// POST /api/empresas/[id]/cuentas-por-cobrar/[cxcId]/cobro
// Registra un cobro (total o parcial). RN-053: actualiza automáticamente
// el saldo pendiente y, si llega a 0, cambia el estado a "pagada".
export async function POST(
  request: Request,
  { params }: { params: { id: string; cxcId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "creditos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = cobroSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const datos = parsed.data;

  const cxcId = BigInt(params.cxcId);
  const cxc = await prisma.cuentaPorCobrar.findFirst({ where: { id: cxcId, empresaId } });
  if (!cxc) return NextResponse.json({ error: "Cuenta por cobrar no encontrada" }, { status: 404 });

  const saldoActual = Number(cxc.saldoPendiente);
  if (datos.monto > saldoActual) {
    return NextResponse.json(
      { error: `El cobro (${datos.monto}) es mayor al saldo pendiente (${saldoActual})` },
      { status: 400 }
    );
  }

  const nuevoSaldo = saldoActual - datos.monto;

  const [, cxcActualizada] = await prisma.$transaction([
    prisma.cobroCxc.create({
      data: { cxcId, monto: datos.monto, medioPago: datos.medioPago || null, usuarioId: usuarioActual.id },
    }),
    prisma.cuentaPorCobrar.update({
      where: { id: cxcId },
      data: { saldoPendiente: nuevoSaldo, estado: nuevoSaldo <= 0 ? "pagada" : "pendiente" },
    }),
  ]);

  return NextResponse.json({
    saldoPendiente: cxcActualizada.saldoPendiente.toString(),
    estado: cxcActualizada.estado,
  });
}
