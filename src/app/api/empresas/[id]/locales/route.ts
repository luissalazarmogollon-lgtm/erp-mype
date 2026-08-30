import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const crearLocalSchema = z.object({
  nombre: z.string().min(2, "El nombre es obligatorio"),
});

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "locales");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const locales = await prisma.local.findMany({
    where: { empresaId, estado: "activo" },
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json(locales.map((l) => ({ id: l.id.toString(), nombre: l.nombre })));
}

// POST /api/empresas/[id]/locales — crea un local/centro de costo. No
// es obligatorio usarlo: una empresa de un solo punto de venta puede no
// tener ningún local y seguir registrando ventas/gastos "consolidado".
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "locales");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearLocalSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });

  const local = await prisma.local.create({
    data: { empresaId, nombre: parsed.data.nombre },
  });

  return NextResponse.json({ id: local.id.toString(), nombre: local.nombre }, { status: 201 });
}
