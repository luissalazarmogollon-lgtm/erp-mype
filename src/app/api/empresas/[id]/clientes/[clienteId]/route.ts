import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const editarClienteSchema = z.object({
  nombre: z.string().min(2, "El nombre comercial es obligatorio"),
  docIdentidad: z.string().optional(),
  telefono: z.string().optional(),
  razonSocial: z.string().optional(),
  representanteLegal: z.string().optional(),
  personaContacto: z.string().optional(),
  direccion: z.string().optional(),
  telefono2: z.string().optional(),
  email: z.string().optional(),
  rubro: z.string().optional(),
  paginaWeb: z.string().optional(),
  instagram: z.string().optional(),
  tiktok: z.string().optional(),
  logoUrl: z.string().optional(),
  estado: z.enum(["activo", "inactivo"]).optional(),
});

// PATCH /api/empresas/[id]/clientes/[clienteId] — edita la ficha completa
// del cliente (módulo Clientes), incluyendo activar/desactivar.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; clienteId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const clienteId = BigInt(params.clienteId);
  const existente = await prisma.cliente.findFirst({ where: { id: clienteId, empresaId } });
  if (!existente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const body = await request.json();
  const parsed = editarClienteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  await prisma.$transaction([
    prisma.cliente.update({
      where: { id: clienteId },
      data: {
        nombre: datos.nombre,
        docIdentidad: datos.docIdentidad || null,
        telefono: datos.telefono || null,
        razonSocial: datos.razonSocial || null,
        representanteLegal: datos.representanteLegal || null,
        personaContacto: datos.personaContacto || null,
        direccion: datos.direccion || null,
        telefono2: datos.telefono2 || null,
        email: datos.email || null,
        rubro: datos.rubro || null,
        paginaWeb: datos.paginaWeb || null,
        instagram: datos.instagram || null,
        tiktok: datos.tiktok || null,
        logoUrl: datos.logoUrl || null,
        ...(datos.estado ? { estado: datos.estado } : {}),
      },
    }),
    prisma.auditoria.create({
      data: {
        usuarioId: usuarioActual.id,
        empresaId,
        tablaAfectada: "clientes",
        registroId: clienteId,
        accion: "editar",
        valorAnterior: { nombre: existente.nombre, estado: existente.estado },
        valorNuevo: { nombre: datos.nombre, estado: datos.estado ?? existente.estado },
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
