import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, requiereSuperadmin, verificarAccesoEmpresa } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODULOS_DISPONIBLES } from "@/lib/permisosModulo";

export const dynamic = "force-dynamic";

const CLAVES_VALIDAS = MODULOS_DISPONIBLES.map((m) => m.key) as [string, ...string[]];

const invitarUsuarioSchema = z.object({
  nombres: z.string().min(2),
  apellidos: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8, "La contraseña temporal debe tener al menos 8 caracteres"),
  tipoActor: z.enum(["asesor", "asistente", "cliente"]),
  rolOperativoNombre: z.enum(["Gerencial", "Admin Local", "Cajero", "Almacén-Cocina"]),
  accesoTotal: z.boolean().default(true),
  permisos: z.array(z.enum(CLAVES_VALIDAS)).default([]),
});

// GET /api/empresas/[id]/usuarios — lista el equipo asignado a esta empresa.
// Cualquiera con acceso a la empresa puede ver quién más está asignado.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const empresaId = BigInt(params.id);

  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const asignaciones = await prisma.usuarioEmpresa.findMany({
    where: { empresaId, estado: "activo" },
    include: { usuario: true, rolOperativo: true },
    orderBy: { fechaAsignacion: "asc" },
  });

  return NextResponse.json(
    asignaciones.map((a) => ({
      id: a.id.toString(),
      tipoActor: a.tipoActor,
      rolOperativo: a.rolOperativo.nombre,
      fechaAsignacion: a.fechaAsignacion,
      usuario: {
        nombres: a.usuario.nombres,
        apellidos: a.usuario.apellidos,
        email: a.usuario.email,
      },
    }))
  );
}

// POST /api/empresas/[id]/usuarios — crea un usuario nuevo (Auth + tabla
// usuarios) y lo asigna a esta empresa con un rol operativo (HU-02).
// Reservado a superadmin en este sprint (ver nota en la arquitectura,
// sección 2: la gestión de usuarios queda centralizada por ahora).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();

  try {
    requiereSuperadmin(usuarioActual);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const empresaId = BigInt(params.id);
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = invitarUsuarioSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const datos = parsed.data;

  const rolOperativo = await prisma.rolOperativo.findUnique({
    where: { nombre: datos.rolOperativoNombre },
  });
  if (!rolOperativo) {
    return NextResponse.json({ error: "Rol operativo inválido" }, { status: 400 });
  }

  // Si el usuario (por email) ya existe en la plataforma, lo reutilizamos
  // y solo agregamos la asignación a esta empresa — no duplicamos su cuenta
  // de Auth. Si es nuevo, lo creamos en Supabase Auth primero.
  let usuario = await prisma.usuario.findUnique({ where: { email: datos.email } });

  if (!usuario) {
    const adminClient = createAdminClient();
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: datos.email,
      password: datos.password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message ?? "No se pudo crear el usuario en Auth" },
        { status: 400 }
      );
    }

    usuario = await prisma.usuario.create({
      data: {
        id: authData.user.id,
        nombres: datos.nombres,
        apellidos: datos.apellidos,
        email: datos.email,
        tipoActorBase: datos.tipoActor,
        esSuperadminPlataforma: false,
      },
    });

    await prisma.auditoria.create({
      data: {
        usuarioId: usuarioActual!.id,
        empresaId,
        tablaAfectada: "usuarios",
        registroId: BigInt(0), // usuarios usa UUID, no bigint — se referencia por valorNuevo
        accion: "crear",
        valorNuevo: { id: usuario.id, email: usuario.email },
      },
    });
  }

  const asignacionExistente = await prisma.usuarioEmpresa.findUnique({
    where: { usuarioId_empresaId: { usuarioId: usuario.id, empresaId } },
  });
  if (asignacionExistente) {
    return NextResponse.json(
      { error: "Este usuario ya está asignado a esta empresa" },
      { status: 400 }
    );
  }

  const asignacion = await prisma.usuarioEmpresa.create({
    data: {
      usuarioId: usuario.id,
      empresaId,
      tipoActor: datos.tipoActor,
      rolOperativoId: rolOperativo.id,
      accesoTotal: datos.accesoTotal,
      permisos: datos.accesoTotal ? Prisma.JsonNull : datos.permisos,
    },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: usuarioActual!.id,
      empresaId,
      tablaAfectada: "usuario_empresa",
      registroId: asignacion.id,
      accion: "crear",
      valorNuevo: { usuarioId: usuario.id, tipoActor: datos.tipoActor, rolOperativoId: rolOperativo.id },
    },
  });

  return NextResponse.json(
    { ok: true, usuarioId: usuario.id, email: usuario.email },
    { status: 201 }
  );
}
