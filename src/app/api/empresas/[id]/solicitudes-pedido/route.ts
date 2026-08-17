import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const itemSchema = z.object({
  insumoId: z.string().min(1),
  cantidad: z.number().positive("La cantidad debe ser mayor a 0"),
});

const crearSolicitudSchema = z.object({
  areaId: z.string().optional(),
  motivo: z.string().optional(),
  items: z.array(itemSchema).min(1, "Agrega al menos un ítem"),
});

// GET /api/empresas/[id]/solicitudes-pedido
// ?vista=aprobacion  -> bandeja de aprobación (estado "enviada", todas las
//                        áreas). Requiere permiso "aprobar_solicitudes_pedido".
// ?vista=despacho    -> solicitudes aprobadas con ítems "por_despachar".
//                        Requiere permiso "despachar_solicitudes_pedido".
// (sin parámetro)    -> "mis solicitudes": las que creó el usuario actual.
//                        Requiere permiso "solicitudes_pedido".
//
// El acceso a la empresa se valida sin exigir un módulo específico, porque
// cada vista tiene su propio permiso — un usuario de Logística puede tener
// SOLO "despachar_solicitudes_pedido" y nada más, y aun así debe poder
// listar lo que le toca despachar.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  let acceso;
  try {
    acceso = await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const url = new URL(request.url);
  const vista = url.searchParams.get("vista");
  const tienePermiso = (modulo: string) => acceso.accesoTotal || acceso.permisos.includes(modulo);

  let solicitudes;
  if (vista === "aprobacion") {
    if (!tienePermiso("aprobar_solicitudes_pedido")) {
      return NextResponse.json({ error: "No tienes permiso para ver la bandeja de aprobación" }, { status: 403 });
    }
    solicitudes = await prisma.solicitudPedido.findMany({
      where: { empresaId, estado: "enviada" },
      include: { area: true, detalle: true },
      orderBy: { fecha: "desc" },
    });
  } else if (vista === "despacho") {
    if (!tienePermiso("despachar_solicitudes_pedido")) {
      return NextResponse.json({ error: "No tienes permiso para ver la bandeja de despacho" }, { status: 403 });
    }
    solicitudes = await prisma.solicitudPedido.findMany({
      where: { empresaId, estado: "aprobada", detalle: { some: { estadoItem: "por_despachar" } } },
      include: { area: true, detalle: true },
      orderBy: { fecha: "desc" },
    });
  } else {
    if (!tienePermiso("solicitudes_pedido")) {
      return NextResponse.json({ error: "No tienes permiso para ver solicitudes de pedido" }, { status: 403 });
    }
    solicitudes = await prisma.solicitudPedido.findMany({
      where: { empresaId, responsableId: usuarioActual.id },
      include: { area: true, detalle: true },
      orderBy: { fecha: "desc" },
    });
  }

  return NextResponse.json(
    solicitudes.map((s) => ({
      id: s.id.toString(),
      area: s.area?.nombre ?? null,
      motivo: s.motivo,
      estado: s.estado,
      fecha: s.fecha,
      cantidadItems: s.detalle.length,
    }))
  );
}

// POST /api/empresas/[id]/solicitudes-pedido — crea y envía la solicitud
// directamente (queda en estado "enviada", lista para la bandeja del
// aprobador). El responsable siempre es el usuario que la crea.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "solicitudes_pedido");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearSolicitudSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const datos = parsed.data;

  // Valida que todos los insumos existan y pertenezcan a esta empresa.
  const insumoIds = datos.items.map((i) => BigInt(i.insumoId));
  const insumosValidos = await prisma.insumo.findMany({
    where: { id: { in: insumoIds }, empresaId },
  });
  if (insumosValidos.length !== new Set(insumoIds.map(String)).size) {
    return NextResponse.json({ error: "Uno o más insumos no son válidos para esta empresa" }, { status: 400 });
  }

  const solicitud = await prisma.solicitudPedido.create({
    data: {
      empresaId,
      areaId: datos.areaId ? BigInt(datos.areaId) : null,
      responsableId: usuarioActual.id,
      motivo: datos.motivo || null,
      estado: "enviada",
      detalle: {
        create: datos.items.map((i) => ({
          insumoId: BigInt(i.insumoId),
          cantidadSolicitada: i.cantidad,
          estadoItem: "pendiente",
        })),
      },
    },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: usuarioActual.id,
      empresaId,
      tablaAfectada: "solicitudes_pedido",
      registroId: solicitud.id,
      accion: "crear",
      valorNuevo: { items: datos.items.length },
    },
  });

  return NextResponse.json({ id: solicitud.id.toString() }, { status: 201 });
}
