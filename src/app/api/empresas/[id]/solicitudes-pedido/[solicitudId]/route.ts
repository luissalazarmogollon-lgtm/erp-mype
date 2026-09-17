import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { reversarDespachoItem, reversarLineaCompra } from "@/lib/reversarAlmacen";

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
  // Quien de verdad puede DECIDIR (aprobar/rechazar y definir si sale de
  // almacén o va a compra) es solo el encargado de almacén — mismo
  // permiso que exige POST .../decidir — o acceso total/superadmin.
  // `puedeAprobar` se mantiene para el acceso de lectura de arriba (quien
  // solo gestiona áreas también puede ver esta pantalla).
  const puedeDecidir = puedeDespachar;

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
    areaId: solicitud.areaId ? solicitud.areaId.toString() : null,
    area: solicitud.area?.nombre ?? null,
    motivo: solicitud.motivo,
    estado: solicitud.estado,
    fecha: solicitud.fecha,
    responsableId: solicitud.responsableId,
    esDueno,
    puedeAprobar,
    puedeDecidir,
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

const itemEdicionSchema = z.object({
  insumoId: z.string().min(1),
  cantidad: z.number().positive("La cantidad debe ser mayor a 0"),
});

const editarSolicitudSchema = z.object({
  areaId: z.string().nullable().optional(),
  motivo: z.string().nullable().optional(),
  items: z.array(itemEdicionSchema).min(1, "Agrega al menos un ítem"),
});

// PATCH /api/empresas/[id]/solicitudes-pedido/[solicitudId]
//
// Permite corregir una solicitud (área, motivo, y la lista completa de
// ítems: agregar, quitar o cambiar cantidades) MIENTRAS todavía está
// pendiente de decisión ("enviada") — una vez aprobada o rechazada, ya no
// se edita aquí (la aprobación tiene su propio mecanismo de ajuste de
// cantidades en decidir/route.ts, y reabrir una decisión ya tomada
// rompería el Kardex/las órdenes de compra que puedan haber salido de
// ella). Solo el responsable que la creó, o alguien con acceso total /
// superadmin, puede editarla — ni siquiera quien aprueba o despacha,
// para que nadie reescriba a nombre de otro lo que en realidad pidió.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; solicitudId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  // Se extrae a una variable local porque TypeScript no arrastra este
  // "if (!usuarioActual) return" hacia dentro de la función anidada de
  // prisma.$transaction(async (tx) => {...}) más abajo — el mismo error de
  // build ("'usuarioActual' is possibly 'null'") que ya pasó en
  // decidir/route.ts.
  const usuarioId = usuarioActual.id;

  const empresaId = BigInt(params.id);
  let acceso;
  try {
    acceso = await verificarAccesoEmpresa(usuarioId, empresaId, "solicitudes_pedido");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = editarSolicitudSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  }
  const datos = parsed.data;

  const solicitudId = BigInt(params.solicitudId);
  const solicitud = await prisma.solicitudPedido.findFirst({ where: { id: solicitudId, empresaId } });
  if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  if (solicitud.responsableId !== usuarioId && !acceso.accesoTotal) {
    return NextResponse.json({ error: "Solo quien creó la solicitud puede modificarla" }, { status: 403 });
  }
  if (solicitud.estado !== "enviada") {
    return NextResponse.json(
      { error: "Esta solicitud ya fue decidida — no se puede modificar (puedes crear una nueva)" },
      { status: 400 }
    );
  }

  const insumoIds = datos.items.map((i) => BigInt(i.insumoId));
  const insumosValidos = await prisma.insumo.findMany({ where: { id: { in: insumoIds }, empresaId } });
  if (insumosValidos.length !== new Set(insumoIds.map(String)).size) {
    return NextResponse.json({ error: "Uno o más insumos no son válidos para esta empresa" }, { status: 400 });
  }
  if (datos.areaId) {
    const area = await prisma.area.findFirst({ where: { id: BigInt(datos.areaId), empresaId } });
    if (!area) return NextResponse.json({ error: "El área seleccionada no existe en esta empresa" }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    // Todavía no hay ninguna decisión tomada (estado "enviada"), así que
    // ningún ítem tiene lote, orden de compra ni despacho vinculado — se
    // puede reemplazar la lista completa sin riesgo de dejar nada huérfano.
    await tx.solicitudPedidoDetalle.deleteMany({ where: { solicitudId } });
    await tx.solicitudPedido.update({
      where: { id: solicitudId },
      data: {
        areaId: datos.areaId ? BigInt(datos.areaId) : null,
        motivo: datos.motivo || null,
        detalle: {
          create: datos.items.map((i) => ({
            insumoId: BigInt(i.insumoId),
            cantidadSolicitada: i.cantidad,
            estadoItem: "pendiente",
          })),
        },
      },
    });
    await tx.auditoria.create({
      data: {
        usuarioId,
        empresaId,
        tablaAfectada: "solicitudes_pedido",
        registroId: solicitudId,
        accion: "editar",
        valorNuevo: { items: datos.items.length, areaId: datos.areaId ?? null },
      },
    });
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/empresas/[id]/solicitudes-pedido/[solicitudId]
//
// RN nueva: elimina la solicitud EN CUALQUIER ESTADO (enviada, aprobada,
// rechazada) — incluso si ya tiene ítems despachados o comprados —
// reversando automáticamente todo lo que haya generado, ítem por ítem:
//   - "despachado"       -> deshace el despacho: devuelve el stock a sus
//                            lotes, borra el Kardex de esa salida y el
//                            Gasto de Costo de Venta que generó (RN del
//                            usuario: "eliminando la operación que se
//                            haya generado en el Estado de Resultados").
//   - con Pedido de Compra vinculado (recibido o no) -> deshace también
//                            esa compra: si ya se recepcionó, revierte el
//                            lote/stock/costo y el Gasto de compra de
//                            mercadería (activo) + su Cuenta por Pagar.
//   - "por_despachar" sin compra, "pendiente", "eliminado" -> nada que
//                            revertir, se borran directo.
// Si algún Pedido de Compra queda sin ítems tras esto, se elimina también
// (ya no representa nada pendiente de comprar ni de recibir).
//
// Bloqueos (no se permite eliminar, se detiene TODO — transacción atómica):
//   - Si alguna Cuenta por Pagar involucrada ya tiene pagos registrados
//     (el dinero ya salió de una cuenta bancaria real — el Flujo de Caja
//     nunca se toca acá, tal como pidió el usuario).
//
// Permisos: el encargado de almacén (mismo permiso que decide/despacha) o
// acceso total/superadmin — es quien conoce el estado real del almacén y
// asume la responsabilidad de una reversión contable. Mientras la
// solicitud siga "enviada" (sin decidir todavía, sin ningún efecto que
// revertir), el propio dueño también puede eliminarla, igual que ya puede
// editarla.
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; solicitudId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const usuarioId = usuarioActual.id;

  const empresaId = BigInt(params.id);
  let acceso;
  try {
    acceso = await verificarAccesoEmpresa(usuarioId, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const solicitudId = BigInt(params.solicitudId);
  const solicitud = await prisma.solicitudPedido.findFirst({
    where: { id: solicitudId, empresaId },
    include: { detalle: true },
  });
  if (!solicitud) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

  const puedeDespachar = acceso.accesoTotal || acceso.permisos.includes("despachar_solicitudes_pedido");
  const esDuenoDeSolicitudSinDecidir = solicitud.responsableId === usuarioId && solicitud.estado === "enviada";
  if (!puedeDespachar && !esDuenoDeSolicitudSinDecidir) {
    return NextResponse.json(
      { error: "Solo el encargado de almacén (o acceso total) puede eliminar una solicitud ya decidida" },
      { status: 403 }
    );
  }

  // Se extrae a variables locales (ver nota de closures en decidir/route.ts
  // y en el PATCH de arriba) porque TypeScript no arrastra el
  // "if (!solicitud) return" hacia dentro de la función anidada de
  // prisma.$transaction(async (tx) => {...}) más abajo.
  const detalleSolicitud = solicitud.detalle;
  const estadoAnterior = solicitud.estado;

  try {
    const resumen = await prisma.$transaction(async (tx) => {
      let despachosRevertidos = 0;
      let montoCostoVentaRevertido = 0;
      let comprasRevertidas = 0;
      let montoComprasRevertido = 0;
      const pedidosCompraTocados = new Set<string>();

      for (const item of detalleSolicitud) {
        if (item.estadoItem === "despachado") {
          const r = await reversarDespachoItem(tx, item.id);
          despachosRevertidos += 1;
          montoCostoVentaRevertido += r.montoReversado;
        }

        const pcd = await tx.pedidoCompraDetalle.findUnique({ where: { solicitudDetalleId: item.id } });
        if (pcd) {
          const r = await reversarLineaCompra(tx, pcd.id);
          pedidosCompraTocados.add(r.pedidoCompraId.toString());
          if (r.montoReversado > 0) {
            comprasRevertidas += 1;
            montoComprasRevertido += r.montoReversado;
          }
        }
      }

      // Si algún Pedido de Compra tocado se quedó sin ítems, ya no
      // representa nada — se elimina también.
      for (const idStr of pedidosCompraTocados) {
        const pedidoCompraId = BigInt(idStr);
        const restantes = await tx.pedidoCompraDetalle.count({ where: { pedidoCompraId } });
        if (restantes === 0) {
          await tx.pedidoCompra.delete({ where: { id: pedidoCompraId } });
        }
      }

      await tx.solicitudPedido.delete({ where: { id: solicitudId } });

      await tx.auditoria.create({
        data: {
          usuarioId,
          empresaId,
          tablaAfectada: "solicitudes_pedido",
          registroId: solicitudId,
          accion: "eliminar",
          valorAnterior: {
            estado: estadoAnterior,
            items: detalleSolicitud.length,
            despachosRevertidos,
            montoCostoVentaRevertido,
            comprasRevertidas,
            montoComprasRevertido,
          },
        },
      });

      return { despachosRevertidos, montoCostoVentaRevertido, comprasRevertidas, montoComprasRevertido };
    });

    return NextResponse.json({ ok: true, ...resumen });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
