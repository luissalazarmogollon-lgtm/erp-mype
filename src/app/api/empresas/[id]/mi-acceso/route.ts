import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { esEmpresaDeServicios } from "@/lib/permisosModulo";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/mi-acceso — devuelve el tipo de actor, rol y
// permisos del usuario actual en ESTA empresa. Lo usan las pantallas de
// cliente (Ventas diarias / Facturación, Caja Chica) para decidir qué
// acciones mostrar según quién está logueado — sin depender solo de
// esconder botones en el servidor, ya que la acción real igual se valida
// en cada API. También devuelve `esServicios`: la pantalla de
// "ventas-diarias" la usa para decidir si mostrar la caja registradora
// diaria (empresas de Productos/Mixta) o el módulo de Facturación
// (empresas de Servicios).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    const acceso = await verificarAccesoEmpresa(usuarioActual.id, empresaId);
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      include: { tipoNegocio: true },
    });
    return NextResponse.json({
      esSuperadminPlataforma: usuarioActual.esSuperadminPlataforma,
      tipoActor: acceso.tipoActor,
      rolOperativo: acceso.rolOperativo,
      accesoTotal: acceso.accesoTotal,
      permisos: acceso.permisos,
      esServicios: esEmpresaDeServicios(empresa?.tipoNegocio?.nombre),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }
}
