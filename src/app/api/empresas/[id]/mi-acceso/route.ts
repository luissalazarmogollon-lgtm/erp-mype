import { NextResponse } from "next/server";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/mi-acceso — devuelve el tipo de actor, rol y
// permisos del usuario actual en ESTA empresa. Lo usan las pantallas de
// cliente (Ventas diarias, Caja Chica) para decidir qué acciones mostrar
// según quién está logueado — sin depender solo de esconder botones en
// el servidor, ya que la acción real igual se valida en cada API.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    const acceso = await verificarAccesoEmpresa(usuarioActual.id, empresaId);
    return NextResponse.json({
      esSuperadminPlataforma: usuarioActual.esSuperadminPlataforma,
      tipoActor: acceso.tipoActor,
      rolOperativo: acceso.rolOperativo,
      accesoTotal: acceso.accesoTotal,
      permisos: acceso.permisos,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }
}
