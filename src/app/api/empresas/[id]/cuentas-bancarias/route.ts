import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const crearCuentaSchema = z.object({
  bancoNombre: z.string().min(2, "Indica el banco (o 'Caja Efectivo')"),
  numeroCuenta: z.string().optional(),
  moneda: z.enum(["PEN", "USD"]).default("PEN"),
  saldoInicial: z.number().default(0),
});

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "flujo_caja");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const cuentas = await prisma.cuentaBancaria.findMany({
    where: { empresaId, estado: "activo" },
    orderBy: { bancoNombre: "asc" },
  });

  return NextResponse.json(
    cuentas.map((c) => ({
      id: c.id.toString(),
      bancoNombre: c.bancoNombre,
      numeroCuenta: c.numeroCuenta,
      moneda: c.moneda,
      saldoActual: c.saldoActual.toString(),
    }))
  );
}

// POST /api/empresas/[id]/cuentas-bancarias — crea una cuenta (o "Caja
// Efectivo" registrada igual) con su saldo inicial, generando el primer
// movimiento tipo "apertura" para dejar rastro de dónde partió el saldo.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "flujo_caja");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearCuentaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const cuenta = await prisma.$transaction(async (tx) => {
    const nuevaCuenta = await tx.cuentaBancaria.create({
      data: {
        empresaId,
        bancoNombre: datos.bancoNombre,
        numeroCuenta: datos.numeroCuenta || null,
        moneda: datos.moneda,
        saldoActual: datos.saldoInicial,
      },
    });

    if (datos.saldoInicial !== 0) {
      await tx.movimientoBancario.create({
        data: {
          cuentaBancariaId: nuevaCuenta.id,
          tipo: "apertura",
          monto: datos.saldoInicial,
          concepto: "Saldo inicial",
          usuarioId: usuarioActual.id,
        },
      });
    }

    return nuevaCuenta;
  });

  return NextResponse.json({ id: cuenta.id.toString() }, { status: 201 });
}
