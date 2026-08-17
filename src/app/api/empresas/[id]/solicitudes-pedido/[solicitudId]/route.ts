import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/solicitudes-pedido/[solicitudId] — detalle completo,
// incluye el stock actual de cada insumo (para que el aprobador vea en vivo
// cuánto hay disponible antes de decidir).
export async function GET(
  request: Request,
  { params }: { params: { id: string; solicitudId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  let acceso;
  try {
    acceso = await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const solicitud = await prisma.solicitudPedido.findFirst({
    where: { id: BigInt(params.solicitudId), empresaId },
    include: {
      area: true,
      detalle: { include: { insumo: { include: { unidadMedida: true } } } },
    },
  });
  if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  // Solo el responsable dueño, quien puede aprobar, o quien puede
  // despachar (Logística) puede ver el detalle.
  const esDueno = solicitud.responsableId === usuarioActual.id;
  const puedeAprobar = acceso.accesoTotal || acceso.permisos.includes("aprobar_solicitudes_pedido");
  const puedeDespachar = acceso.accesoTotal || acceso.permisos.includes("despachar_solicitudes_pedido");
  if (!esDueno && !puedeAprobar && !puedeDespachar) {
    return NextResponse.json({ error: "No tienes acceso a esta solicitud" }, { status: 403 });
  }

  // Stock "comprometido": suma de lo que YA quedó por_despachar en otras
  // solicitudes para el mismo insumo (todavía no descontado del Kardex,
  // ver nota de diseño en schema.prisma). Se resta al stock real para
  // saber cuánto está realmente libre para ESTA decisión.
  const insumoIds = solicitud.detalle.map((d) => d.insumoId);
  const comprometidos = await prisma.solicitudPedidoDetalle.groupBy({
    by: ["insumoId"],
    where: { insumoId: { in: insumoIds }, estadoItem: "por_despachar" },
    _sum: { cantidadAprobada: true },
  });
  const comprometidoPorInsumo = new Map(
    comprometidos.map((c) => [c.insumoId.toString(), Number(c._sum.cantidadAprobada ?? 0)])
  );

  return NextResponse.json({
    id: solicitud.id.toString(),
    area: solicitud.area?.nombre ?? null,
    motivo: solicitud.motivo,
    estado: solicitud.estado,
    fecha: solicitud.fecha,
    responsableId: solicitud.responsableId,
    esDueno,
    puedeAprobar,
    comentarioAprobador: solicitud.comentarioAprobador,
    detalle: solicitud.detalle.map((d) => {
      const stockReal = Number(d.insumo.stockActual);
      const comprometido = comprometidoPorInsumo.get(d.insumoId.toString()) ?? 0;
      return {
        id: d.id.toString(),
        insumoId: d.insumoId.toString(),
        insumoNombre: d.insumo.nombre,
        unidadMedida: d.insumo.unidadMedida?.abreviatura ?? null,
        cantidadSolicitada: d.cantidadSolicitada.toString(),
        cantidadAprobada: d.cantidadAprobada?.toString() ?? null,
        estadoItem: d.estadoItem,
        observacion: d.observacion,
        stockDisponible: Math.max(stockReal - comprometido, 0),
      };
    }),
  });
}
