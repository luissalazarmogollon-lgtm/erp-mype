import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/flujo-caja — saldo consolidado, por cuenta, y
// el historial de movimientos AGRUPADO por cuenta bancaria y luego por
// día (para no mostrar una lista larga sin organizar).
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
    take: 300,
  });

  const saldoConsolidado = cuentas.reduce((acc, c) => acc + Number(c.saldoActual), 0);

  // Agrupar: cuenta → fecha (YYYY-MM-DD) → movimientos del día
  type MovimientoPlano = {
    id: string; tipo: string; monto: number; concepto: string; fecha: string;
  };
  const porCuenta = new Map<string, { cuentaId: string; cuentaNombre: string; porDia: Map<string, MovimientoPlano[]> }>();

  for (const m of movimientos) {
    const cuentaId = m.cuentaBancariaId.toString();
    if (!porCuenta.has(cuentaId)) {
      porCuenta.set(cuentaId, { cuentaId, cuentaNombre: m.cuentaBancaria.bancoNombre, porDia: new Map() });
    }
    const grupoCuenta = porCuenta.get(cuentaId)!;
    const diaKey = m.fecha.toISOString().slice(0, 10);
    if (!grupoCuenta.porDia.has(diaKey)) grupoCuenta.porDia.set(diaKey, []);
    grupoCuenta.porDia.get(diaKey)!.push({
      id: m.id.toString(),
      tipo: m.tipo,
      monto: Number(m.monto),
      concepto: m.concepto,
      fecha: m.fecha.toISOString(),
    });
  }

  const movimientosPorCuenta = Array.from(porCuenta.values()).map((grupo) => ({
    cuentaId: grupo.cuentaId,
    cuentaNombre: grupo.cuentaNombre,
    dias: Array.from(grupo.porDia.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([fecha, movs]) => ({
        fecha,
        movimientos: movs,
        totalIngreso: movs.filter((x) => x.tipo === "ingreso" || x.tipo === "apertura").reduce((acc, x) => acc + x.monto, 0),
        totalEgreso: movs.filter((x) => x.tipo === "egreso").reduce((acc, x) => acc + x.monto, 0),
      })),
  }));

  return NextResponse.json({
    saldoConsolidado,
    cuentas: cuentas.map((c) => ({
      id: c.id.toString(),
      bancoNombre: c.bancoNombre,
      numeroCuenta: c.numeroCuenta,
      moneda: c.moneda,
      saldoActual: c.saldoActual.toString(),
    })),
    movimientosPorCuenta,
  });
}
