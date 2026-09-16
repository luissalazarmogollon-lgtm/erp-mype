import { prisma } from "@/lib/prisma";

export type CuentaCxCResumen = {
  id: string;
  clienteId: string;
  cliente: string;
  clienteRuc: string | null;
  numeroFactura: string | null;
  descripcion: string | null;
  montoTotal: number;
  saldoPendiente: number;
  fechaEmision: Date;
  fechaVencimiento: Date | null;
  estado: string;
};

export type EmpresaCxCResumen = {
  empresaId: string;
  nombreComercial: string;
  ruc: string | null;
  totalPorCobrar: number;
  cuentas: CuentaCxCResumen[];
};

export type ReporteCuentasPorCobrar = {
  totalPorCobrar: number;
  empresas: EmpresaCxCResumen[];
};

// Consolidado de Cuentas por Cobrar de TODAS las empresas (o de una sola,
// pasando "empresaId"), agrupado por empresa — base compartida por la
// pantalla (JSON), el PDF consolidado y el PDF por empresa, para que los
// tres muestren siempre exactamente los mismos números. Solo incluye
// cuentas pendientes/vencidas (no las ya cobradas).
export async function calcularCuentasPorCobrarConsolidado(empresaId?: bigint): Promise<ReporteCuentasPorCobrar> {
  const cxcs = await prisma.cuentaPorCobrar.findMany({
    where: {
      estado: { not: "pagada" },
      ...(empresaId !== undefined ? { empresaId } : {}),
    },
    include: { cliente: true, empresa: true },
    orderBy: [{ fechaVencimiento: "asc" }, { fechaEmision: "asc" }],
  });

  const porEmpresa = new Map<
    string,
    { empresaId: string; nombreComercial: string; ruc: string | null; totalPorCobrar: number; cuentas: CuentaCxCResumen[] }
  >();

  for (const c of cxcs) {
    const empresaId = c.empresaId.toString();
    if (!porEmpresa.has(empresaId)) {
      porEmpresa.set(empresaId, {
        empresaId,
        nombreComercial: c.empresa.nombreComercial,
        ruc: c.empresa.ruc,
        totalPorCobrar: 0,
        cuentas: [],
      });
    }
    const grupo = porEmpresa.get(empresaId)!;
    grupo.totalPorCobrar += Number(c.saldoPendiente);
    grupo.cuentas.push({
      id: c.id.toString(),
      clienteId: c.clienteId.toString(),
      cliente: c.cliente.nombre,
      clienteRuc: c.cliente.docIdentidad,
      numeroFactura: c.numeroFactura,
      descripcion: c.descripcion,
      montoTotal: Number(c.montoTotal),
      saldoPendiente: Number(c.saldoPendiente),
      fechaEmision: c.fechaEmision,
      fechaVencimiento: c.fechaVencimiento,
      estado: c.estado,
    });
  }

  // Las empresas con más deuda pendiente primero — es lo más útil para
  // decidir a quién cobrarle primero.
  const empresas = Array.from(porEmpresa.values()).sort((a, b) => b.totalPorCobrar - a.totalPorCobrar);
  const totalPorCobrar = empresas.reduce((acc, e) => acc + e.totalPorCobrar, 0);

  return { totalPorCobrar, empresas };
}
