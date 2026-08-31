import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, requiereSuperadmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const crearAccesoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "La contraseña temporal debe tener al menos 8 caracteres"),
});

// POST /api/empresas/[id]/empleados/[empleadoId]/crear-acceso
// Crea (o reutiliza, si ya existe por correo) una cuenta de acceso al
// sistema para este trabajador y la vincula a su ficha de RRHH, para que
// pueda iniciar sesión y ver "Mis actividades" en Gestión de Actividades.
// Igual que /api/empresas/[id]/usuarios, la creación de cuentas queda
// reservada al superadmin de la plataforma (ver nota en la arquitectura,
// sección 2). El acceso que se otorga es limitado: solo el módulo
// "actividades" en esta empresa — un trabajador de campo no necesita ver
// el resto del sistema.
export async function POST(
  request: Request,
  { params }: { params: { id: string; empleadoId: string } }
) {
  const usuarioActual = await getUsuarioActual();

  try {
    requiereSuperadmin(usuarioActual);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const empresaId = BigInt(params.id);
  const empleadoId = BigInt(params.empleadoId);

  const empleado = await prisma.empleado.findFirst({ where: { id: empleadoId, empresaId } });
  if (!empleado) return NextResponse.json({ error: "Trabajador no encontrado" }, { status: 404 });

  if (empleado.usuarioId) {
    return NextResponse.json(
      { error: "Este trabajador ya tiene una cuenta de acceso vinculada" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const parsed = crearAccesoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const rolOperativo = await prisma.rolOperativo.findUnique({ where: { nombre: "Admin Local" } });
  if (!rolOperativo) {
    return NextResponse.json({ error: "No se encontró el rol operativo base" }, { status: 500 });
  }

  // Si el correo ya existe como Usuario en la plataforma (por ejemplo,
  // porque el consultor ya lo usó para otra empresa), se reutiliza esa
  // cuenta en lugar de duplicarla — pero solo si no está ya vinculada a
  // OTRO trabajador de RRHH.
  let usuario = await prisma.usuario.findUnique({ where: { email: datos.email } });

  if (usuario) {
    const yaVinculado = await prisma.empleado.findFirst({ where: { usuarioId: usuario.id } });
    if (yaVinculado) {
      return NextResponse.json(
        { error: "Ese correo ya está vinculado a otro trabajador" },
        { status: 400 }
      );
    }
  } else {
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
        nombres: empleado.nombres,
        apellidos: empleado.apellidos,
        email: datos.email,
        tipoActorBase: "cliente",
        esSuperadminPlataforma: false,
      },
    });
  }

  const asignacionExistente = await prisma.usuarioEmpresa.findUnique({
    where: { usuarioId_empresaId: { usuarioId: usuario.id, empresaId } },
  });

  await prisma.$transaction(async (tx) => {
    if (!asignacionExistente) {
      await tx.usuarioEmpresa.create({
        data: {
          usuarioId: usuario!.id,
          empresaId,
          tipoActor: "cliente",
          rolOperativoId: rolOperativo.id,
          accesoTotal: false,
          permisos: ["actividades"],
        },
      });
    }

    await tx.empleado.update({ where: { id: empleadoId }, data: { usuarioId: usuario!.id } });

    await tx.auditoria.create({
      data: {
        usuarioId: usuarioActual!.id,
        empresaId,
        tablaAfectada: "empleados",
        registroId: empleadoId,
        accion: "editar",
        valorNuevo: { usuarioId: usuario!.id, email: usuario!.email, accion: "vincular_acceso" },
      },
    });
  });

  return NextResponse.json({ ok: true, usuarioId: usuario.id, email: usuario.email }, { status: 201 });
}
