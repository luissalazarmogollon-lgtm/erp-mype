import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, requiereSuperadmin } from "@/lib/auth";
import { MODULOS_DISPONIBLES } from "@/lib/permisosModulo";

export const dynamic = "force-dynamic";

const CLAVES_VALIDAS = MODULOS_DISPONIBLES.map((m) => m.key) as [string, ...string[]];

const asignarSchema = z.object({
  empresaId: z.string(),
  tipoActor: z.enum(["asesor", "asistente", "cliente"]),
  rolOperativoNombre: z.enum(["Gerencial", "Admin Local", "Cajero", "Almacén-Cocina"]),
  accesoTotal: z.boolean().default(true),
  permisos: z.array(z.enum(CLAVES_VALIDAS)).default([]),
});

// POST /api/usuarios/[usuarioId]/asignaciones — asigna (o reactiva) el
// acceso de un usuario ya existente a una empresa, con un rol específico.
// Es el mecanismo central de segregación de funciones: un mismo consultor
// puede tener accesos distintos (o ninguno) en cada empresa que asesoras.
export async function POST(request: Request, { params }: { params: { usuarioId: string } }) {
  const usuarioActual = await getUsuarioActual();
  try {
    requiereSuperadmin(usuarioActual);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = asignarSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const datos = parsed.data;

  const usuarioId = params.usuarioId;
  const empresaId = BigInt(datos.empresaId);

  const [usuario, empresa, rolOperativo] = await Promise.all([
    prisma.usuario.findUnique({ where: { id: usuarioId } }),
    prisma.empresa.findUnique({ where: { id: empresaId } }),
    prisma.rolOperativo.findUnique({ where: { nombre: datos.rolOperativoNombre } }),
  ]);
  if (!usuario) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  if (!empresa) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  if (!rolOperativo) return NextResponse.json({ error: "Rol operativo inválido" }, { status: 400 });

  // upsert: si ya tuvo (o tiene) una asignación a esta empresa, la
  // actualiza/reactiva en vez de duplicar (la llave única es usuario+empresa).
  const asignacion = await prisma.usuarioEmpresa.upsert({
    where: { usuarioId_empresaId: { usuarioId, empresaId } },
    update: {
      tipoActor: datos.tipoActor,
      rolOperativoId: rolOperativo.id,
      estado: "activo",
      accesoTotal: datos.accesoTotal,
      permisos: datos.accesoTotal ? null : datos.permisos,
    },
    create: {
      usuarioId,
      empresaId,
      tipoActor: datos.tipoActor,
      rolOperativoId: rolOperativo.id,
      accesoTotal: datos.accesoTotal,
      permisos: datos.accesoTotal ? null : datos.permisos,
    },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: usuarioActual!.id,
      empresaId,
      tablaAfectada: "usuario_empresa",
      registroId: asignacion.id,
      accion: "crear",
      valorNuevo: { usuarioId, tipoActor: datos.tipoActor, rolOperativoNombre: datos.rolOperativoNombre },
    },
  });

  return NextResponse.json({ asignacionId: asignacion.id.toString() }, { status: 201 });
}
