import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const editarAreaSchema = z.object({
  esAlmacen: z.boolean(),
});

// PATCH /api/empresas/[id]/areas/[areaId] — por ahora solo cambia la marca
// "Es Almacén" (ver Area.esAlmacen en schema.prisma): qué área representa
// al propio Almacén para autoabastecimiento, y por lo tanto qué permiso
// decide sus Solicitudes de Pedido ("aprobar_solicitudes_almacen" en vez
// de "despachar_solicitudes_pedido" — ver decidir/route.ts). Mismo
// permiso que crear/desactivar áreas.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; areaId: string } }
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
  const parsed = editarAreaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  }

  const area = await prisma.area.findFirst({ where: { id: BigInt(params.areaId), empresaId } });
  if (!area) return NextResponse.json({ error: "Área no encontrada" }, { status: 404 });

  const actualizada = await prisma.area.update({
    where: { id: area.id },
    data: { esAlmacen: parsed.data.esAlmacen },
  });

  return NextResponse.json({ id: actualizada.id.toString(), nombre: actualizada.nombre, esAlmacen: actualizada.esAlmacen });
}

// DELETE /api/empresas/[id]/areas/[areaId] — desactiva el área (no la
// borra físicamente, para no romper el historial de solicitudes que ya
// la usaron). Deja de aparecer en el selector de nuevas solicitudes.
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; areaId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "aprobar_solicitudes_pedido");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const area = await prisma.area.findFirst({ where: { id: BigInt(params.areaId), empresaId } });
  if (!area) return NextResponse.json({ error: "Área no encontrada" }, { status: 404 });

  await prisma.area.update({ where: { id: area.id }, data: { estado: "inactivo" } });

  return NextResponse.json({ ok: true });
}
