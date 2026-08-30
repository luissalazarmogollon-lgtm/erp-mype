import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, requiereSuperadmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODULOS_DISPONIBLES } from "@/lib/permisosModulo";

export const dynamic = "force-dynamic";

const CLAVES_VALIDAS = MODULOS_DISPONIBLES.map((m) => m.key) as [string, ...string[]];

const editarUsuarioSchema = z.object({
  nombres: z.string().min(2),
  apellidos: z.string().min(2),
  email: z.string().email(),
  // Contraseña nueva (opcional) — si se deja vacío, no se cambia.
  password: z.string().min(8).optional().or(z.literal("")),
  tipoActor: z.enum(["asesor", "asistente", "cliente"]),
  rolOperativoNombre: z.enum(["Gerencial", "Admin Local", "Cajero", "Almacén-Cocina"]),
  accesoTotal: z.boolean().default(true),
  permisos: z.array(z.enum(CLAVES_VALIDAS)).default([]),
});

// PATCH /api/empresas/[id]/usuarios/[usuarioId]
// Edita los datos de login (nombre, correo, contraseña) de un usuario ya
// asignado a la empresa, y su rol/tipo de actor en esa asignación.
// Reservado a superadmin, igual que crear/invitar (RN-004).
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; usuarioId: string } }
) {
  const usuarioActual = await getUsuarioActual();

  try {
    requiereSuperadmin(usuarioActual);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const empresaId = BigInt(params.id);
  const usuarioId = params.usuarioId;

  const asignacion = await prisma.usuarioEmpresa.findUnique({
    where: { usuarioId_empresaId: { usuarioId, empresaId } },
    include: { usuario: true, rolOperativo: true },
  });
  if (!asignacion) {
    return NextResponse.json({ error: "Esta persona no está asignada a esta empresa" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = editarUsuarioSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const rolOperativo = await prisma.rolOperativo.findUnique({ where: { nombre: datos.rolOperativoNombre } });
  if (!rolOperativo) return NextResponse.json({ error: "Rol operativo inválido" }, { status: 400 });

  // Si cambió el correo o se indicó una contraseña nueva, actualizamos
  // primero en Supabase Auth (de donde depende el login real).
  const emailCambio = datos.email !== asignacion.usuario.email;
  if (emailCambio || datos.password) {
    const adminClient = createAdminClient();
    const { error: authError } = await adminClient.auth.admin.updateUserById(usuarioId, {
      ...(emailCambio ? { email: datos.email } : {}),
      ...(datos.password ? { password: datos.password } : {}),
    });
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }
  }

  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: usuarioId },
      data: { nombres: datos.nombres, apellidos: datos.apellidos, email: datos.email },
    }),
    prisma.usuarioEmpresa.update({
      where: { usuarioId_empresaId: { usuarioId, empresaId } },
      data: {
        tipoActor: datos.tipoActor,
        rolOperativoId: rolOperativo.id,
        accesoTotal: datos.accesoTotal,
        permisos: datos.accesoTotal ? Prisma.JsonNull : datos.permisos,
      },
    }),
    prisma.auditoria.create({
      data: {
        usuarioId: usuarioActual!.id,
        empresaId,
        tablaAfectada: "usuarios",
        registroId: BigInt(0),
        accion: "editar",
        valorAnterior: { email: asignacion.usuario.email, rol: asignacion.rolOperativo.nombre },
        valorNuevo: { email: datos.email, rolOperativoNombre: datos.rolOperativoNombre },
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
