import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ajusteSchema = z.object({
  cantidad: z.number().refine((v) => v !== 0, "La cantidad no puede ser 0"),
  costoUnitario: z.number().min(0),
  observacion: z.string().optional(),
});

// POST /api/empresas/[id]/insumos/[insumoId]/ajuste
// Movimiento manual de inventario (tipo ajuste_manual). Sigue aplicando
// RN-031 (promedio ponderado) sobre Insumo.costoPromedioActual exactamente
// como antes — ese KPI no cambia de comportamiento.
//
// Sprint 5: además mueve Lotes, porque el Despacho (PEPS) necesita lotes
// reales de donde consumir, incluso para stock cargado manualmente:
//   - cantidad > 0 → crea un LoteCompra nuevo (origen "ajuste_manual")
//   - cantidad < 0 → consume de los lotes existentes en orden PEPS
//     (más antiguo primero) y registra un movimiento de Kardex POR CADA
//     lote tocado, con su costo real — no el promedio.
export async function POST(
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
  const parsed = ajusteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  }
  const datos = parsed.data;

  const insumoId = BigInt(params.insumoId);
  const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, empresaId } });
  if (!insumo) {
    return NextResponse.json({ error: "Insumo no encontrado" }, { status: 404 });
  }

  const stockActual = Number(insumo.stockActual);
  const costoActual = Number(insumo.costoPromedioActual);
  const nuevoStock = stockActual + datos.cantidad;

  // RN-033: el stock no puede quedar negativo.
  if (nuevoStock < 0) {
    return NextResponse.json(
      { error: `El ajuste dejaría el stock en negativo (actual: ${stockActual}, ajuste: ${datos.cantidad})` },
      { status: 400 }
    );
  }

  // RN-031: promedio ponderado solo al aumentar stock. Al reducirlo
  // manualmente (ej. corrección de conteo), el costo promedio no cambia.
  const nuevoCosto =
    datos.cantidad > 0
      ? (stockActual * costoActual + datos.cantidad * datos.costoUnitario) / nuevoStock
      : costoActual;

  try {
    const insumoActualizado = await prisma.$transaction(async (tx) => {
      const actualizado = await tx.insumo.update({
        where: { id: insumoId },
        data: { stockActual: nuevoStock, costoPromedioActual: nuevoCosto },
      });

      if (datos.cantidad > 0) {
        const lote = await tx.loteCompra.create({
          data: {
            empresaId,
            insumoId,
            origen: "ajuste_manual",
            cantidadInicial: datos.cantidad,
            cantidadDisponible: datos.cantidad,
            costoUnitario: datos.costoUnitario,
            referenciaTipo: "ajuste_manual",
          },
        });
        await tx.movimientoInventario.create({
          data: {
            empresaId,
            insumoId,
            tipo: "ajuste_manual",
            cantidad: datos.cantidad,
            costoUnitario: datos.costoUnitario,
            loteId: lote.id,
            usuarioId: usuarioActual.id,
            referenciaTipo: "ajuste_manual",
          },
        });
      } else {
        // Consumo PEPS de lotes existentes para cubrir la reducción.
        let faltante = Math.abs(datos.cantidad);
        const lotes = await tx.loteCompra.findMany({
          where: { insumoId, cantidadDisponible: { gt: 0 } },
          orderBy: { fechaIngreso: "asc" },
        });

        for (const lote of lotes) {
          if (faltante <= 0) break;
          const disponibleLote = Number(lote.cantidadDisponible);
          const consumir = Math.min(disponibleLote, faltante);

          await tx.loteCompra.update({
            where: { id: lote.id },
            data: { cantidadDisponible: disponibleLote - consumir },
          });
          await tx.movimientoInventario.create({
            data: {
              empresaId,
              insumoId,
              tipo: "ajuste_manual",
              cantidad: -consumir,
              costoUnitario: lote.costoUnitario,
              loteId: lote.id,
              usuarioId: usuarioActual.id,
              referenciaTipo: "ajuste_manual",
            },
          });
          faltante -= consumir;
        }

        if (faltante > 0) {
          // No hay lotes suficientes para respaldar la reducción — se
          // detiene la transacción entera (throw revierte todo).
          throw new Error(
            "No hay lotes suficientes registrados para este insumo. Contacta soporte antes de continuar."
          );
        }
      }

      return actualizado;
    });

    return NextResponse.json({
      stockActual: insumoActualizado.stockActual.toString(),
      costoPromedioActual: insumoActualizado.costoPromedioActual.toString(),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
