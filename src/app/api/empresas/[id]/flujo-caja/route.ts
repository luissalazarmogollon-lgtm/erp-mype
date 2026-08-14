import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/flujo-caja — saldo consolidado (suma de todas las
// cuentas) y por cuenta, más el historial reciente de movimientos.
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

  const movimientos = await prisma.movimientoBancario.findMany({
    where: { cuentaBancaria: { empresaId } },
    include: { cuentaBancaria: true },
    orderBy: { fecha: "desc" },
    take: 80,
  });

  const saldoConsolidado = cuentas.reduce((acc, c) => acc + Number(c.saldoActual), 0);

  return NextResponse.json({
    saldoConsolidado,
    cuentas: cuentas.map((c) => ({
      id: c.id.toString(),
      bancoNombre: c.bancoNombre,
      numeroCuenta: c.numeroCuenta,
      moneda: c.moneda,
      saldoActual: c.saldoActual.toString(),
    })),
    movimientos: movimientos.map((m) => ({
      id: m.id.toString(),
      cuenta: m.cuentaBancaria.bancoNombre,
      tipo: m.tipo,
      monto: m.monto.toString(),
      concepto: m.concepto,
      fecha: m.fecha,
    })),
  });
}
