import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const crearTipoActividadSchema = z.object({
  nombre: z.string().min(2, "Ponle un nombre al tipo de actividad"),
  tiempoEstimadoMin: z.number().min(0).optional(),
});

// GET /api/empresas/[id]/actividades/tipos — catálogo de tipos de
// actividad de esta empresa (ej. "Editar reel", "Diseñar pieza estática"),
// cada uno con su tiempo estándar de referencia en minutos.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "actividades");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const tipos = await prisma.tipoActividad.findMany({
    where: { empresaId, estado: "activo" },
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json(
    tipos.map((t) => ({
      id: t.id.toString(),
      nombre: t.nombre,
      tiempoEstimadoMin: t.tiempoEstimadoMin,
    }))
  );
}

// POST /api/empresas/[id]/actividades/tipos — agrega un tipo de actividad
// al catálogo (se puede ir armando sobre la marcha, al registrar tareas).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "actividades");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearTipoActividadSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });

  const tipo = await prisma.tipoActividad.create({
    data: {
      empresaId,
      nombre: parsed.data.nombre,
      tiempoEstimadoMin: parsed.data.tiempoEstimadoMin ?? null,
    },
  });

  return NextResponse.json(
    { id: tipo.id.toString(), nombre: tipo.nombre, tiempoEstimadoMin: tipo.tiempoEstimadoMin },
    { status: 201 }
  );
}
