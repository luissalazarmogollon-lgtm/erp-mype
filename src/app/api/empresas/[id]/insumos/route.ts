import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const crearInsumoSchema = z.object({
  codigo: z.string().optional(),
  nombre: z.string().min(2, "El nombre es obligatorio"),
  categoriaId: z.string().optional(),
  unidadMedidaId: z.string().optional(),
  stockMinimo: z.number().min(0).default(0),
});

// GET /api/empresas/[id]/insumos — lista de insumos con su stock y costo actual.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "insumos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const insumos = await prisma.insumo.findMany({
    where: { empresaId },
    include: { categoria: true, unidadMedida: true },
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json(
    insumos.map((i) => ({
      id: i.id.toString(),
      codigo: i.codigo,
      nombre: i.nombre,
      categoria: i.categoria?.nombre ?? null,
      unidadMedida: i.unidadMedida?.abreviatura ?? null,
      stockMinimo: i.stockMinimo.toString(),
      stockActual: i.stockActual.toString(),
      costoPromedioActual: i.costoPromedioActual.toString(),
      bajoMinimo: Number(i.stockActual) < Number(i.stockMinimo),
    }))
  );
}

// POST /api/empresas/[id]/insumos — crea un insumo nuevo (stock y costo
// inician en 0; se cargan con "Ajustar stock" hasta que exista el módulo
// de Compras — Sprint 4).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "insumos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearInsumoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const datos = parsed.data;

  const insumo = await prisma.insumo.create({
    data: {
      empresaId,
      codigo: datos.codigo || null,
      nombre: datos.nombre,
      categoriaId: datos.categoriaId ? BigInt(datos.categoriaId) : null,
      unidadMedidaId: datos.unidadMedidaId ? BigInt(datos.unidadMedidaId) : null,
      stockMinimo: datos.stockMinimo,
    },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: usuarioActual.id,
      empresaId,
      tablaAfectada: "insumos",
      registroId: insumo.id,
      accion: "crear",
      valorNuevo: { nombre: insumo.nombre },
    },
  });

  return NextResponse.json({ id: insumo.id.toString(), nombre: insumo.nombre }, { status: 201 });
}
