import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const crearClienteSchema = z.object({
  nombre: z.string().min(2, "El nombre es obligatorio"),
  docIdentidad: z.string().optional(),
  telefono: z.string().optional(),
});

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const clientes = await prisma.cliente.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } });
  return NextResponse.json(
    clientes.map((c) => ({ id: c.id.toString(), nombre: c.nombre, docIdentidad: c.docIdentidad, telefono: c.telefono }))
  );
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearClienteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });

  const cliente = await prisma.cliente.create({
    data: {
      empresaId,
      nombre: parsed.data.nombre,
      docIdentidad: parsed.data.docIdentidad || null,
      telefono: parsed.data.telefono || null,
      creditoHabilitado: true,
    },
  });

  return NextResponse.json({ id: cliente.id.toString(), nombre: cliente.nombre }, { status: 201 });
}
