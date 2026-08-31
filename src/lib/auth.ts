import { prisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MODULOS_SOLO_PRODUCTOS, MODULOS_SOLO_SERVICIOS, esEmpresaDeServicios, type ModuloKey } from "@/lib/permisosModulo";

/**
 * Resuelve quién es el usuario autenticado y a qué empresas tiene acceso.
 * Implementa RN-001: un usuario solo puede ver/operar empresas donde tenga
 * una fila activa en usuario_empresa, salvo que sea superadmin de plataforma.
 *
 * Devuelve null si no hay sesión — cada API route/página decide qué hacer
 * con eso (normalmente redirigir a /login).
 */
export async function getUsuarioActual() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const usuario = await prisma.usuario.findUnique({
    where: { id: user.id },
    include: {
      asignaciones: {
        where: { estado: "activo" },
        include: { empresa: true, rolOperativo: true },
      },
    },
  });

  return usuario;
}

/**
 * Lista las empresas visibles para el usuario en su selector (HU-03).
 * Si es superadmin, ve todas las empresas activas de la plataforma;
 * si no, solo las que tiene asignadas en usuario_empresa.
 */
export async function getEmpresasVisibles(usuarioId: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) return [];

  if (usuario.esSuperadminPlataforma) {
    return prisma.empresa.findMany({
      where: { estado: "activo" },
      orderBy: { nombreComercial: "asc" },
    });
  }

  const asignaciones = await prisma.usuarioEmpresa.findMany({
    where: { usuarioId, estado: "activo" },
    include: { empresa: true, rolOperativo: true },
  });

  return asignaciones.map((a) => a.empresa);
}

/**
 * Verifica que el usuario tenga acceso a una empresa puntual y, si se
 * indica `moduloRequerido`, verifica además que tenga permiso sobre ESE
 * módulo específico (acceso total, o ese módulo en su lista de permisos).
 * Lanza error si no tiene acceso — usar en cada API route que reciba un
 * empresaId, pasando el módulo correspondiente a esa pantalla/acción.
 */
export async function verificarAccesoEmpresa(
  usuarioId: string,
  empresaId: bigint,
  moduloRequerido?: ModuloKey
) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) throw new Error("Usuario no encontrado");

  if (usuario.esSuperadminPlataforma) {
    return { rolOperativo: "Gerencial", tipoActor: "superadmin" as const, accesoTotal: true, permisos: [] as string[] };
  }

  const asignacion = await prisma.usuarioEmpresa.findFirst({
    where: { usuarioId, empresaId, estado: "activo" },
    include: { rolOperativo: true, empresa: { include: { tipoNegocio: true } } },
  });

  if (!asignacion) {
    throw new Error("No tienes acceso a esta empresa");
  }

  // Defensa en profundidad: si el módulo pedido solo aplica a empresas que
  // venden productos (maneja inventario) y esta empresa está clasificada
  // como "Servicios", se niega el acceso sin importar el permiso o si
  // tiene acceso total — el módulo simplemente no aplica al modelo de
  // negocio de esta empresa. El panel ya lo oculta; esto cubre además
  // quien intente llamar a la API directamente.
  if (moduloRequerido && MODULOS_SOLO_PRODUCTOS.includes(moduloRequerido) && esEmpresaDeServicios(asignacion.empresa.tipoNegocio.nombre)) {
    throw new Error("Este módulo no está disponible para empresas de tipo Servicios");
  }

  // Simétrico al bloqueo anterior: un módulo exclusivo de empresas de
  // Servicios (ej. "actividades") no aplica a una empresa de Productos.
  if (moduloRequerido && MODULOS_SOLO_SERVICIOS.includes(moduloRequerido) && !esEmpresaDeServicios(asignacion.empresa.tipoNegocio.nombre)) {
    throw new Error("Este módulo no está disponible para empresas de tipo Productos");
  }

  if (moduloRequerido && !asignacion.accesoTotal) {
    const permisos = (asignacion.permisos as unknown as string[] | null) ?? [];
    if (!permisos.includes(moduloRequerido)) {
      throw new Error("No tienes permiso para acceder a esta sección de la empresa");
    }
  }

  return {
    rolOperativo: asignacion.rolOperativo.nombre,
    tipoActor: asignacion.tipoActor,
    accesoTotal: asignacion.accesoTotal,
    permisos: (asignacion.permisos as unknown as string[] | null) ?? [],
  };
}

/**
 * Variante de verificarAccesoEmpresa para pantallas donde MÁS DE UN
 * módulo da acceso — por ejemplo, Cuentas por Pagar: quien solo tiene
 * "cuentas_por_pagar_registrar" (registra facturas sin clasificar) y
 * quien tiene "cuentas_por_pagar" (clasifica y paga) ambos pueden entrar
 * a ver/crear, pero cada acción específica (clasificar, pagar) valida
 * el módulo exacto por separado con verificarAccesoEmpresa.
 */
export async function verificarAccesoAlguno(
  usuarioId: string,
  empresaId: bigint,
  modulosPermitidos: ModuloKey[]
) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) throw new Error("Usuario no encontrado");

  if (usuario.esSuperadminPlataforma) {
    return { rolOperativo: "Gerencial", tipoActor: "superadmin" as const, accesoTotal: true, permisos: [] as string[] };
  }

  const asignacion = await prisma.usuarioEmpresa.findFirst({
    where: { usuarioId, empresaId, estado: "activo" },
    include: { rolOperativo: true, empresa: { include: { tipoNegocio: true } } },
  });

  if (!asignacion) {
    throw new Error("No tienes acceso a esta empresa");
  }

  // Igual defensa en profundidad que en verificarAccesoEmpresa: si TODOS
  // los módulos que darían acceso son exclusivos de empresas de productos,
  // no aplican en una empresa de Servicios.
  if (
    modulosPermitidos.length > 0 &&
    modulosPermitidos.every((m) => MODULOS_SOLO_PRODUCTOS.includes(m)) &&
    esEmpresaDeServicios(asignacion.empresa.tipoNegocio.nombre)
  ) {
    throw new Error("Este módulo no está disponible para empresas de tipo Servicios");
  }

  // Simétrico: si TODOS los módulos que darían acceso son exclusivos de
  // empresas de Servicios, no aplican en una empresa de Productos.
  if (
    modulosPermitidos.length > 0 &&
    modulosPermitidos.every((m) => MODULOS_SOLO_SERVICIOS.includes(m)) &&
    !esEmpresaDeServicios(asignacion.empresa.tipoNegocio.nombre)
  ) {
    throw new Error("Este módulo no está disponible para empresas de tipo Productos");
  }

  if (!asignacion.accesoTotal) {
    const permisos = (asignacion.permisos as unknown as string[] | null) ?? [];
    const tieneAlguno = modulosPermitidos.some((m) => permisos.includes(m));
    if (!tieneAlguno) {
      throw new Error("No tienes permiso para acceder a esta sección de la empresa");
    }
  }

  return {
    rolOperativo: asignacion.rolOperativo.nombre,
    tipoActor: asignacion.tipoActor,
    accesoTotal: asignacion.accesoTotal,
    permisos: (asignacion.permisos as unknown as string[] | null) ?? [],
  };
}

/** RN-004: solo el superadmin de plataforma puede dar de alta empresas nuevas. */
export function requiereSuperadmin(usuario: { esSuperadminPlataforma: boolean } | null) {
  if (!usuario || !usuario.esSuperadminPlataforma) {
    throw new Error("Solo el superadmin de la plataforma puede realizar esta acción");
  }
}
