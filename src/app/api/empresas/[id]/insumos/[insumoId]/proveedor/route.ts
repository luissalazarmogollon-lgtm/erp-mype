import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  proveedorId: z.string().nullable(),
});

// PATCH /api/empresas/[id]/insumos/[insumoId]/proveedor — asigna (o quita,
// con null) el proveedor preferido de un insumo. Se usa para la
// consolidación automática de Pedidos de Compra por proveedor.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; insumoId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "insumos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const insumoId = BigInt(params.insumoId);
  const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, empresaId } });
  if (!insumo) return NextResponse.json({ error: "Insumo no encontrado" }, { status: 404 });

  if (parsed.data.proveedorId) {
    const proveedor = await prisma.proveedor.findFirst({
      where: { id: BigInt(parsed.data.proveedorId), empresaId },
    });
    if (!proveedor) return NextResponse.json({ error: "Proveedor no válido" }, { status: 400 });
  }

  await prisma.insumo.update({
    where: { id: insumoId },
    data: { proveedorPreferidoId: parsed.data.proveedorId ? BigInt(parsed.data.proveedorId) : null },
  });

  return NextResponse.json({ ok: true });
}
