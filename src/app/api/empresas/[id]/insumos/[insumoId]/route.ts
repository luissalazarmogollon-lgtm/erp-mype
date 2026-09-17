import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const editarInsumoSchema = z.object({
  codigo: z.string().nullable().optional(),
  nombre: z.string().min(2, "El nombre es obligatorio"),
  categoriaId: z.string().nullable().optional(),
  unidadMedidaId: z.string().nullable().optional(),
  stockMinimo: z.number().min(0).optional(),
});

// PATCH /api/empresas/[id]/insumos/[insumoId] — edita los datos maestros de
// un insumo (nombre, código, categoría, unidad de medida, stock mínimo).
// No toca stockActual ni costoPromedioActual — esos solo cambian por
// "Ajustar stock" o por el flujo de compras/despacho, nunca desde aquí.
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
  const parsed = editarInsumoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  }
  const datos = parsed.data;

  const insumoId = BigInt(params.insumoId);
  const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, empresaId } });
  if (!insumo) return NextResponse.json({ error: "Insumo no encontrado" }, { status: 404 });

  // Validación cross-tenant: igual que en la creación, sin esto se podría
  // asignar una categoría o unidad de medida de otra empresa.
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

  await prisma.insumo.update({
    where: { id: insumoId },
    data: {
      codigo: datos.codigo || null,
      nombre: datos.nombre,
      categoriaId: datos.categoriaId ? BigInt(datos.categoriaId) : null,
      unidadMedidaId: datos.unidadMedidaId ? BigInt(datos.unidadMedidaId) : null,
      ...(datos.stockMinimo !== undefined ? { stockMinimo: datos.stockMinimo } : {}),
    },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: usuarioActual.id,
      empresaId,
      tablaAfectada: "insumos",
      registroId: insumoId,
      accion: "editar",
      valorNuevo: { nombre: datos.nombre, codigo: datos.codigo ?? null },
    },
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/empresas/[id]/insumos/[insumoId] — "elimina" un insumo. Un
// insumo real casi siempre tiene historial detrás (Kardex, lotes,
// despachos, mermas, líneas de compra) que NO se puede borrar sin perder
// trazabilidad contable — así que esto NUNCA es un borrado físico: solo
// marca el insumo como "inactivo" (mismo patrón que Área/Cliente/
// Proveedor/Producto). Un insumo inactivo desaparece de la lista y de
// los selectores (nueva Solicitud de Pedido, Pedido de Compra, etc.),
// pero todo su stock/costo/Kardex queda intacto y consultable.
export async function DELETE(
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

  const insumoId = BigInt(params.insumoId);
  const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, empresaId } });
  if (!insumo) return NextResponse.json({ error: "Insumo no encontrado" }, { status: 404 });

  await prisma.insumo.update({ where: { id: insumoId }, data: { estado: "inactivo" } });

  await prisma.auditoria.create({
    data: {
      usuarioId: usuarioActual.id,
      empresaId,
      tablaAfectada: "insumos",
      registroId: insumoId,
      accion: "eliminar",
      valorAnterior: { nombre: insumo.nombre, stockActual: insumo.stockActual.toString() },
    },
  });

  return NextResponse.json({ ok: true });
}
