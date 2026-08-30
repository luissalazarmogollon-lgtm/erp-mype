import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const saldoInicialSchema = z.object({
  saldo: z.number(),
  concepto: z.string().default("Saldo inicial"),
});

// POST /api/empresas/[id]/cuentas-bancarias/[cuentaId]/saldo-inicial
// Fija el saldo de una cuenta a un valor exacto (por ejemplo, al iniciar
// un mes nuevo, o para corregir un desfase) y deja un movimiento tipo
// "apertura" registrando la diferencia aplicada.
export async function POST(
  request: Request,
  { params }: { params: { id: string; cuentaId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "flujo_caja");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = saldoInicialSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const cuentaId = BigInt(params.cuentaId);
  const cuenta = await prisma.cuentaBancaria.findFirst({ where: { id: cuentaId, empresaId } });
  if (!cuenta) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });

  const diferencia = datos.saldo - Number(cuenta.saldoActual);

  await prisma.$transaction([
    prisma.cuentaBancaria.update({ where: { id: cuentaId }, data: { saldoActual: datos.saldo } }),
    prisma.movimientoBancario.create({
      data: {
        cuentaBancariaId: cuentaId,
        tipo: "apertura",
        monto: diferencia,
        concepto: datos.concepto,
        usuarioId: usuarioActual.id,
      },
    }),
  ]);

  return NextResponse.json({ saldoActual: datos.saldo });
}
