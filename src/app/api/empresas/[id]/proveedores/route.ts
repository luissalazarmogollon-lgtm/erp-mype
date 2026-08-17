import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const crearProveedorSchema = z.object({
  nombre: z.string().min(2, "El nombre es obligatorio"),
  ruc: z.string().optional(),
  contacto: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().optional(),
});

// GET /api/empresas/[id]/proveedores
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const proveedores = await prisma.proveedor.findMany({
    where: { empresaId, estado: "activo" },
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json(
    proveedores.map((p) => ({
      id: p.id.toString(),
      nombre: p.nombre,
      ruc: p.ruc,
      contacto: p.contacto,
      telefono: p.telefono,
      email: p.email,
    }))
  );
}

// POST /api/empresas/[id]/proveedores
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "compras");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearProveedorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const datos = parsed.data;

  try {
    const proveedor = await prisma.proveedor.create({
      data: {
        empresaId,
        nombre: datos.nombre,
        ruc: datos.ruc || null,
        contacto: datos.contacto || null,
        telefono: datos.telefono || null,
        email: datos.email || null,
      },
    });
    return NextResponse.json({ id: proveedor.id.toString(), nombre: proveedor.nombre }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Ya existe un proveedor con ese nombre" }, { status: 400 });
  }
}
