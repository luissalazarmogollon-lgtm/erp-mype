import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
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
    include: { categoria: true, unidadMedida: true, proveedorPreferido: true },
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
      proveedorPreferidoId: i.proveedorPreferidoId?.toString() ?? null,
      proveedorPreferidoNombre: i.proveedorPreferido?.nombre ?? null,
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
    return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  }
  const datos = parsed.data;

  // Validación cross-tenant: sin esto, un categoriaId/unidadMedidaId de
  // otra empresa se aceptaría igual (la FK no exige que empresaId
  // coincida), rompiendo el aislamiento multi-tenant.
  if (datos.categoriaId) {
    const categoria = await prisma.categoriaInsumo.findFirst({
      where: { id: BigInt(datos.categoriaId), empresaId },
    });
    if (!categoria) {
      return NextResponse.json({ error: "La categoría seleccionada no existe en esta empresa" }, { status: 400 });
    }
  }
  if (datos.unidadMedidaId) {
    const unidad = await prisma.unidadMedida.findFirst({
      where: { id: BigInt(datos.unidadMedidaId), empresaId },
    });
    if (!unidad) {
      return NextResponse.json({ error: "La unidad de medida seleccionada no existe en esta empresa" }, { status: 400 });
    }
  }

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
