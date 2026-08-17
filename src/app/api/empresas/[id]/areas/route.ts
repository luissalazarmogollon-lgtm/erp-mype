import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const crearAreaSchema = z.object({
  nombre: z.string().min(2, "El nombre es obligatorio"),
});

// GET /api/empresas/[id]/areas — lista de áreas de la empresa (para el
// selector de la Solicitud de Pedido). Cualquiera con acceso a la empresa
// puede verlas; solo quien tiene "aprobar_solicitudes_pedido" puede crear.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const areas = await prisma.area.findMany({
    where: { empresaId, estado: "activo" },
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json(areas.map((a) => ({ id: a.id.toString(), nombre: a.nombre })));
}

// POST /api/empresas/[id]/areas — crea un área nueva (ej. Cocina, Barra,
// Administración). Restringido a quien puede aprobar solicitudes, para
// que el catálogo de áreas no lo desordene cualquier responsable.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "aprobar_solicitudes_pedido");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearAreaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const area = await prisma.area.create({
      data: { empresaId, nombre: parsed.data.nombre },
    });
    return NextResponse.json({ id: area.id.toString(), nombre: area.nombre }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Ya existe un área con ese nombre" }, { status: 400 });
  }
}
