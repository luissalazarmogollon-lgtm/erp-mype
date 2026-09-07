import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, requiereSuperadmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

type CuentaResumen = {
  id: string;
  cliente: string;
  clienteRuc: string | null;
  numeroFactura: string | null;
  descripcion: string | null;
  montoTotal: string;
  saldoPendiente: string;
  fechaEmision: string;
  fechaVencimiento: string | null;
  estado: string;
};

// GET /api/cuentas-por-cobrar — resumen consolidado de Cuentas por Cobrar
// de TODAS las empresas, agrupado por empresa, con el total general de lo
// que se debe (para mostrarlo arriba a la derecha en la pantalla). Solo
// incluye cuentas pendientes/vencidas — las ya cobradas se consultan
// desde la pantalla de Créditos/Cuentas por Cobrar de cada empresa.
//
// Vista exclusiva del superadmin de la plataforma: es quien gestiona
// varias empresas a la vez como consultor y necesita el panorama
// completo; cada empresa por separado ya tiene su propia pantalla de
// Créditos con el detalle y las acciones (cobrar, eliminar).
export async function GET() {
  const usuarioActual = await getUsuarioActual();
  try {
    requiereSuperadmin(usuarioActual);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const cxcs = await prisma.cuentaPorCobrar.findMany({
    where: { estado: { not: "pagada" } },
    include: { cliente: true, empresa: true },
    orderBy: [{ fechaVencimiento: "asc" }, { fechaEmision: "asc" }],
  });

  const porEmpresa = new Map<
    string,
    { empresaId: string; nombreComercial: string; totalPorCobrar: number; cuentas: CuentaResumen[] }
  >();

  for (const c of cxcs) {
    const empresaId = c.empresaId.toString();
    if (!porEmpresa.has(empresaId)) {
      porEmpresa.set(empresaId, {
        empresaId,
        nombreComercial: c.empresa.nombreComercial,
        totalPorCobrar: 0,
        cuentas: [],
      });
    }
    const grupo = porEmpresa.get(empresaId)!;
    grupo.totalPorCobrar += Number(c.saldoPendiente);
    grupo.cuentas.push({
      id: c.id.toString(),
      cliente: c.cliente.nombre,
      clienteRuc: c.cliente.docIdentidad,
      numeroFactura: c.numeroFactura,
      descripcion: c.descripcion,
      montoTotal: c.montoTotal.toString(),
      saldoPendiente: c.saldoPendiente.toString(),
      fechaEmision: c.fechaEmision.toISOString(),
      fechaVencimiento: c.fechaVencimiento ? c.fechaVencimiento.toISOString() : null,
      estado: c.estado,
    });
  }

  // Las empresas con más deuda pendiente primero — es lo más útil para
  // decidir a quién cobrarle primero.
  const empresas = Array.from(porEmpresa.values())
    .sort((a, b) => b.totalPorCobrar - a.totalPorCobrar)
    .map((g) => ({
      empresaId: g.empresaId,
      nombreComercial: g.nombreComercial,
      totalPorCobrar: g.totalPorCobrar.toFixed(2),
      cantidadPendientes: g.cuentas.length,
      cuentas: g.cuentas,
    }));

  const totalGeneral = Array.from(porEmpresa.values()).reduce((acc, g) => acc + g.totalPorCobrar, 0);

  return NextResponse.json({
    totalPorCobrar: totalGeneral.toFixed(2),
    empresas,
  });
}
