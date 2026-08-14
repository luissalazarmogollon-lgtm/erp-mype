import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const pagoSchema = z.object({
  monto: z.number().positive(),
  medioPago: z.string().optional(),
});

// POST /api/empresas/[id]/cuentas-por-pagar/[cxpId]/pago
export async function POST(
  request: Request,
  { params }: { params: { id: string; cxpId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "cuentas_por_pagar");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = pagoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const datos = parsed.data;

  const cxpId = BigInt(params.cxpId);
  const cxp = await prisma.cuentaPorPagar.findFirst({ where: { id: cxpId, empresaId } });
  if (!cxp) return NextResponse.json({ error: "Cuenta por pagar no encontrada" }, { status: 404 });

  const saldoActual = Number(cxp.saldoPendiente);
  if (datos.monto > saldoActual) {
    return NextResponse.json(
      { error: `El pago (${datos.monto}) es mayor al saldo pendiente (${saldoActual})` },
      { status: 400 }
    );
  }

  const nuevoSaldo = saldoActual - datos.monto;

  const [, cxpActualizada] = await prisma.$transaction([
    prisma.pagoCxp.create({
      data: { cxpId, monto: datos.monto, medioPago: datos.medioPago || null, usuarioId: usuarioActual.id },
    }),
    prisma.cuentaPorPagar.update({
      where: { id: cxpId },
      data: { saldoPendiente: nuevoSaldo, estado: nuevoSaldo <= 0 ? "pagada" : "pendiente" },
    }),
  ]);

  return NextResponse.json({
    saldoPendiente: cxpActualizada.saldoPendiente.toString(),
    estado: cxpActualizada.estado,
  });
}
