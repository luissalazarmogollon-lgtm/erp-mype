import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { NATURALEZAS_EGRESO } from "@/lib/naturalezaEgreso";

export const dynamic = "force-dynamic";

const NATURALEZAS_VALIDAS = NATURALEZAS_EGRESO.map((n) => n.value) as [string, ...string[]];

const clasificarSchema = z.object({
  naturaleza: z.enum(NATURALEZAS_VALIDAS),
  categoriaEspecifica: z.string().optional(),
});

// PATCH /api/empresas/[id]/cuentas-por-pagar/[cxpId]/items/[gastoId]
//
// Asigna Naturaleza del egreso y Categoría específica a UN ítem de una
// factura por pagar registrada sin clasificar. Solo puede hacerlo quien
// tiene el permiso completo "cuentas_por_pagar" (responsable de finanzas
// y contabilidad) — quien solo tiene "cuentas_por_pagar_registrar" (la
// persona que digita las facturas) no puede llegar a este endpoint.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; cxpId: string; gastoId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "cuentas_por_pagar");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = clasificarSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const datos = parsed.data;

  const cxpId = BigInt(params.cxpId);
  const gastoId = BigInt(params.gastoId);

  // Verifica que el ítem realmente pertenezca a esta cuenta por pagar
  // (por gastoId directo, o por ser uno de los ítems de su documento de
  // compra) — evita clasificar un gasto de otra factura cambiando el id
  // en la URL.
  const cxp = await prisma.cuentaPorPagar.findFirst({
    where: { id: cxpId, empresaId },
    include: { gasto: true, documentoCompra: { include: { items: true } } },
  });
  if (!cxp) return NextResponse.json({ error: "Cuenta por pagar no encontrada" }, { status: 404 });

  const perteneceAEstaCxp =
    cxp.gasto?.id === gastoId || (cxp.documentoCompra?.items ?? []).some((g) => g.id === gastoId);
  if (!perteneceAEstaCxp) {
    return NextResponse.json({ error: "Ese ítem no pertenece a esta cuenta por pagar" }, { status: 400 });
  }

  const gastoActualizado = await prisma.gasto.update({
    where: { id: gastoId },
    data: { naturaleza: datos.naturaleza, categoriaEspecifica: datos.categoriaEspecifica || null },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: usuarioActual.id,
      empresaId,
      tablaAfectada: "gastos",
      registroId: gastoId,
      accion: "editar",
      valorNuevo: {
        origen: "clasificacion_cxp",
        naturaleza: datos.naturaleza,
        categoriaEspecifica: datos.categoriaEspecifica ?? null,
      },
    },
  });

  return NextResponse.json({
    id: gastoActualizado.id.toString(),
    naturaleza: gastoActualizado.naturaleza,
    categoriaEspecifica: gastoActualizado.categoriaEspecifica,
  });
}
