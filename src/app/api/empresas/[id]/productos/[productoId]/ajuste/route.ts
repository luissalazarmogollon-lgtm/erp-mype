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

// POST /api/empresas/[id]/productos/[productoId]/ajuste
// Mismo mecanismo que /insumos/[insumoId]/ajuste (RN-031 promedio
// ponderado, RN-033 stock nunca negativo, lotes PEPS), aplicado a
// Producto — el módulo de Productos ya no se construye con una receta
// (ficha técnica): es mercadería comprada ya terminada para revender
// (gaseosa, agua, etc.), con su propio stock/costo independiente. Como
// todavía no existe un flujo de Solicitud/Compra/Recepción para
// Productos (a diferencia de Insumo), esta pantalla de "Ajustar stock"
// es, por ahora, la única forma de registrar entradas de mercadería:
//   - cantidad > 0 → entrada (ej. una compra que llegó) → crea un
//     LoteCompra nuevo (origen "ajuste_manual")
//   - cantidad < 0 → salida manual (ej. corrección de conteo, merma no
//     registrada aparte) → consume de los lotes existentes en orden PEPS
export async function POST(
  request: Request,
  { params }: { params: { id: string; productoId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "productos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = ajusteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  }
  const datos = parsed.data;

  const productoId = BigInt(params.productoId);
  const producto = await prisma.producto.findFirst({ where: { id: productoId, empresaId } });
  if (!producto) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  const stockActual = Number(producto.stockActual);
  const costoActual = Number(producto.costoPromedioActual);
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
    const productoActualizado = await prisma.$transaction(async (tx) => {
      const actualizado = await tx.producto.update({
        where: { id: productoId },
        data: { stockActual: nuevoStock, costoPromedioActual: nuevoCosto },
      });

      if (datos.cantidad > 0) {
        const lote = await tx.loteCompra.create({
          data: {
            empresaId,
            productoId,
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
            productoId,
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
          where: { productoId, cantidadDisponible: { gt: 0 } },
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
              productoId,
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
            "No hay lotes suficientes registrados para este producto. Contacta soporte antes de continuar."
          );
        }
      }

      return actualizado;
    });

    return NextResponse.json({
      stockActual: productoActualizado.stockActual.toString(),
      costoPromedioActual: productoActualizado.costoPromedioActual.toString(),
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
