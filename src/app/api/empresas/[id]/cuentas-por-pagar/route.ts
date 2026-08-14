import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/cuentas-por-pagar — listado con saldo pendiente,
// generadas automáticamente desde gastos registrados a crédito.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const cxps = await prisma.cuentaPorPagar.findMany({
    where: { empresaId },
    include: { gasto: true, pagos: true },
    orderBy: { fechaEmision: "desc" },
  });

  return NextResponse.json(
    cxps.map((c) => ({
      id: c.id.toString(),
      proveedorNombre: c.proveedorNombre,
      descripcionGasto: c.gasto.descripcion,
      montoTotal: c.montoTotal.toString(),
      saldoPendiente: c.saldoPendiente.toString(),
      fechaEmision: c.fechaEmision,
      fechaVencimiento: c.fechaVencimiento,
      estado: c.estado,
      pagos: c.pagos.map((p) => ({ monto: p.monto.toString(), fecha: p.fecha, medioPago: p.medioPago })),
    }))
  );
}
