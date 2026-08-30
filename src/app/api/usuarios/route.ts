import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, requiereSuperadmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const crearUsuarioSchema = z.object({
  nombres: z.string().min(2),
  apellidos: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  tipoActorBase: z.enum(["asesor", "asistente", "cliente"]),
});

// GET /api/usuarios — lista todos los usuarios de la plataforma con las
// empresas a las que tienen acceso actualmente y su rol en cada una.
// Es la vista central de "quién puede ver/hacer qué" (segregación de funciones).
export async function GET() {
  const usuarioActual = await getUsuarioActual();
  try {
    requiereSuperadmin(usuarioActual);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const usuarios = await prisma.usuario.findMany({
    where: { esSuperadminPlataforma: false }, // el/los superadmin no necesitan asignación
    include: {
      asignaciones: {
        where: { estado: "activo" },
        include: { empresa: true, rolOperativo: true },
      },
    },
    orderBy: { fechaCreacion: "desc" },
  });

  return NextResponse.json(
    usuarios.map((u) => ({
      id: u.id,
      nombres: u.nombres,
      apellidos: u.apellidos,
      email: u.email,
      tipoActorBase: u.tipoActorBase,
      asignaciones: u.asignaciones.map((a) => ({
        asignacionId: a.id.toString(),
        empresaId: a.empresa.id.toString(),
        empresaNombre: a.empresa.nombreComercial,
        tipoActor: a.tipoActor,
        rolOperativo: a.rolOperativo.nombre,
        accesoTotal: a.accesoTotal,
        permisos: (a.permisos as unknown as string[] | null) ?? [],
      })),
    }))
  );
}

// POST /api/usuarios — crea un usuario nuevo SIN asignarlo todavía a
// ninguna empresa (eso se hace después, eligiendo una o varias, desde
// esta misma pantalla). Si el correo ya existe, devuelve error.
export async function POST(request: Request) {
  const usuarioActual = await getUsuarioActual();
  try {
    requiereSuperadmin(usuarioActual);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearUsuarioSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const existente = await prisma.usuario.findUnique({ where: { email: datos.email } });
  if (existente) {
    return NextResponse.json({ error: "Ya existe un usuario con ese correo" }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: datos.email,
    password: datos.password,
    email_confirm: true,
  });
  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message ?? "No se pudo crear el usuario" }, { status: 400 });
  }

  const usuario = await prisma.usuario.create({
    data: {
      id: authData.user.id,
      nombres: datos.nombres,
      apellidos: datos.apellidos,
      email: datos.email,
      tipoActorBase: datos.tipoActorBase,
      esSuperadminPlataforma: false,
    },
  });

  return NextResponse.json({ id: usuario.id, nombres: usuario.nombres }, { status: 201 });
}
