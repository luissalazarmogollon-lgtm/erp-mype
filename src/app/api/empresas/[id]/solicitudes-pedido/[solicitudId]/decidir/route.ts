import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const itemDecisionSchema = z.object({
  detalleId: z.string(),
  eliminado: z.boolean().default(false),
  cantidadAprobada: z.number().positive().optional(),
});

const decidirSchema = z.object({
  decision: z.enum(["aprobar", "rechazar"]),
  comentario: z.string().optional(),
  items: z.array(itemDecisionSchema).optional(),
});

// POST /api/empresas/[id]/solicitudes-pedido/[solicitudId]/decidir
// El aprobador (cualquier Asesor/superadmin con permiso) modifica cantidades
// o elimina ítems, y aprueba o rechaza. Al aprobar, cada ítem se separa
// automáticamente:
//   - stock alcanza          -> "por_despachar" (se descuenta al Despacho,
//                                todavía no en esta fase)
//   - stock alcanza parcial  -> se parte en dos filas: una por_despachar
//                                con lo disponible, otra pendiente_compra
//                                con el resto
//   - no hay stock           -> "pendiente_compra" completo
// El stock disponible de cada insumo se calcula como
// stockActual del Insumo MENOS lo ya comprometido (por_despachar) en
// otras solicitudes — así dos solicitudes no se pisan el mismo stock.
export async function POST(
  request: Request,
  { params }: { params: { id: string; solicitudId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "aprobar_solicitudes_pedido");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = decidirSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const datos = parsed.data;

  const solicitudId = BigInt(params.solicitudId);
  const solicitud = await prisma.solicitudPedido.findFirst({
    where: { id: solicitudId, empresaId },
    include: { detalle: { include: { insumo: true } } },
  });
  if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  if (solicitud.estado !== "enviada") {
    return NextResponse.json({ error: "Esta solicitud ya fue decidida" }, { status: 400 });
  }

  // --- Rechazo: simple, no toca ítems individualmente ---
  if (datos.decision === "rechazar") {
    await prisma.$transaction([
      prisma.solicitudPedido.update({
        where: { id: solicitudId },
        data: {
          estado: "rechazada",
          aprobadorId: usuarioActual.id,
          fechaAprobacion: new Date(),
          comentarioAprobador: datos.comentario || null,
        },
      }),
      prisma.auditoria.create({
        data: {
          usuarioId: usuarioActual.id,
          empresaId,
          tablaAfectada: "solicitudes_pedido",
          registroId: solicitudId,
          accion: "aprobar", // decisión sobre una solicitud (rechazo incluido)
          valorNuevo: { decision: "rechazar", comentario: datos.comentario ?? null },
        },
      }),
    ]);
    return NextResponse.json({ estado: "rechazada" });
  }

  // --- Aprobación: separación automática por stock ---
  const decisiones = new Map(datos.items?.map((i) => [i.detalleId, i]) ?? []);

  // Stock ya comprometido por OTRAS solicitudes (por_despachar), por insumo.
  const insumoIds = [...new Set(solicitud.detalle.map((d) => d.insumoId.toString()))].map(BigInt);
  const comprometidos = await prisma.solicitudPedidoDetalle.groupBy({
    by: ["insumoId"],
    where: { insumoId: { in: insumoIds }, estadoItem: "por_despachar" },
    _sum: { cantidadAprobada: true },
  });
  const disponiblePorInsumo = new Map<string, number>();
  for (const insumoId of insumoIds) {
    const insumo = solicitud.detalle.find((d) => d.insumoId === insumoId)!.insumo;
    const comprometido = comprometidos.find((c) => c.insumoId === insumoId)?._sum.cantidadAprobada ?? 0;
    disponiblePorInsumo.set(insumoId.toString(), Number(insumo.stockActual) - Number(comprometido));
  }

  const operaciones = [];
  for (const item of solicitud.detalle) {
    const decision = decisiones.get(item.id.toString());

    if (!decision || decision.eliminado) {
      operaciones.push(
        prisma.solicitudPedidoDetalle.update({
          where: { id: item.id },
          data: { estadoItem: "eliminado", cantidadAprobada: null },
        })
      );
      continue;
    }

    const cantidad = decision.cantidadAprobada ?? Number(item.cantidadSolicitada);
    const insumoKey = item.insumoId.toString();
    const disponible = Math.max(disponiblePorInsumo.get(insumoKey) ?? 0, 0);

    if (cantidad <= disponible) {
      disponiblePorInsumo.set(insumoKey, disponible - cantidad);
      operaciones.push(
        prisma.solicitudPedidoDetalle.update({
          where: { id: item.id },
          data: { cantidadAprobada: cantidad, estadoItem: "por_despachar" },
        })
      );
    } else if (disponible > 0) {
      // Se parte: una parte atendida con stock, el resto a compra.
      disponiblePorInsumo.set(insumoKey, 0);
      operaciones.push(
        prisma.solicitudPedidoDetalle.update({
          where: { id: item.id },
          data: { cantidadAprobada: disponible, estadoItem: "por_despachar" },
        })
      );
      operaciones.push(
        prisma.solicitudPedidoDetalle.create({
          data: {
            solicitudId,
            insumoId: item.insumoId,
            cantidadSolicitada: cantidad - disponible,
            cantidadAprobada: cantidad - disponible,
            estadoItem: "pendiente_compra",
            observacion: "Saldo sin stock, dividido automáticamente al aprobar",
          },
        })
      );
    } else {
      operaciones.push(
        prisma.solicitudPedidoDetalle.update({
          where: { id: item.id },
          data: { cantidadAprobada: cantidad, estadoItem: "pendiente_compra" },
        })
      );
    }
  }

  operaciones.push(
    prisma.solicitudPedido.update({
      where: { id: solicitudId },
      data: {
        estado: "aprobada",
        aprobadorId: usuarioActual.id,
        fechaAprobacion: new Date(),
        comentarioAprobador: datos.comentario || null,
      },
    })
  );
  operaciones.push(
    prisma.auditoria.create({
      data: {
        usuarioId: usuarioActual.id,
        empresaId,
        tablaAfectada: "solicitudes_pedido",
        registroId: solicitudId,
        accion: "aprobar",
        valorNuevo: { decision: "aprobar", comentario: datos.comentario ?? null },
      },
    })
  );

  await prisma.$transaction(operaciones);

  return NextResponse.json({ estado: "aprobada" });
}
