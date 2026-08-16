import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/cuentas-por-pagar — listado con saldo pendiente.
// Cada fila puede venir de un gasto simple (un solo ítem) o de un
// documento de compra con varios ítems — se arma una descripción que
// funciona para ambos casos.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "cuentas_por_pagar");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const cxps = await prisma.cuentaPorPagar.findMany({
    where: { empresaId },
    include: {
      gasto: true,
      pagos: true,
      documentoCompra: { include: { items: true } },
    },
    orderBy: { fechaEmision: "desc" },
  });

  return NextResponse.json(
    cxps.map((c) => {
      const descripcion = c.gasto
        ? c.gasto.descripcion
        : c.documentoCompra
        ? `${c.documentoCompra.numeroComprobante ?? "Documento"} (${c.documentoCompra.items.length} ítems)`
        : "-";

      return {
        id: c.id.toString(),
        proveedorNombre: c.proveedorNombre,
        descripcionGasto: descripcion,
        montoTotal: c.montoTotal.toString(),
        saldoPendiente: c.saldoPendiente.toString(),
        fechaEmision: c.fechaEmision,
        fechaVencimiento: c.fechaVencimiento,
        estado: c.estado,
        pagos: c.pagos.map((p) => ({ monto: p.monto.toString(), fecha: p.fecha, medioPago: p.medioPago })),
      };
    })
  );
}
