import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/inventario — catálogo completo de insumos y
// productos ACTIVOS de la empresa (con su categoría, unidad y stock/costo
// actuales) para la pantalla de "Conteo de inventario": una toma física
// donde se cuenta todo de una vez, agrupado por categoría, y se graba en
// un solo paso (ver POST más abajo). Los "productos" de tipo "servicio"
// no se listan aquí — no manejan stock físico.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "inventario");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const [insumos, productos] = await Promise.all([
    prisma.insumo.findMany({
      where: { empresaId, estado: "activo" },
      include: { categoria: true, unidadMedida: true },
      orderBy: { nombre: "asc" },
    }),
    prisma.producto.findMany({
      where: { empresaId, estado: "activo", tipo: "producto" },
      include: { categoria: true, unidadMedida: true },
      orderBy: { nombre: "asc" },
    }),
  ]);

  return NextResponse.json({
    insumos: insumos.map((i) => ({
      id: i.id.toString(),
      codigo: i.codigo,
      nombre: i.nombre,
      categoriaId: i.categoriaId ? i.categoriaId.toString() : null,
      categoriaNombre: i.categoria?.nombre ?? null,
      unidadNombre: i.unidadMedida?.abreviatura ?? i.unidadMedida?.nombre ?? "-",
      stockActual: i.stockActual.toString(),
      costoPromedioActual: i.costoPromedioActual.toString(),
    })),
    productos: productos.map((p) => ({
      id: p.id.toString(),
      codigo: p.codigo,
      nombre: p.nombre,
      categoriaId: p.categoriaId ? p.categoriaId.toString() : null,
      categoriaNombre: p.categoria?.nombre ?? null,
      unidadNombre: p.unidadMedida?.abreviatura ?? p.unidadMedida?.nombre ?? "-",
      stockActual: p.stockActual.toString(),
      costoPromedioActual: p.costoPromedioActual.toString(),
    })),
  });
}

const itemContadoSchema = z.object({
  tipo: z.enum(["insumo", "producto"]),
  id: z.string(),
  // Un conteo físico nunca puede ser negativo — es lo que la persona
  // encontró en el almacén.
  cantidadContada: z.number().min(0),
  // Solo obligatorio cuando el conteo da MÁS de lo que el sistema tenía
  // registrado (ver validación más abajo) — es el costo unitario del
  // excedente encontrado.
  costoUnitarioExcedente: z.number().min(0).optional(),
});

const registrarConteoSchema = z.object({
  items: z.array(itemContadoSchema).min(1, "No hay ítems contados para grabar"),
});

// POST /api/empresas/[id]/inventario — graba de una sola vez el resultado
// de una toma de inventario física, para varios insumos/productos a la
// vez (a diferencia de /insumos/[id]/ajuste y /productos/[id]/ajuste, que
// ajustan uno por uno). Por cada ítem:
//   - Recibe la cantidad CONTADA (absoluta, lo que la persona vio en el
//     almacén), no un delta — este endpoint calcula
//     delta = cantidadContada - stockActual internamente.
//   - Si delta === 0 (el conteo coincide con lo registrado), no se toca.
//   - Si delta > 0 (sobrante), se exige costoUnitarioExcedente y se crea
//     un LoteCompra nuevo, igual que un ajuste manual con cantidad > 0.
//   - Si delta < 0 (faltante), se consume de los lotes existentes en
//     orden PEPS, igual que un ajuste manual con cantidad < 0. Como la
//     cantidad contada nunca puede ser negativa, el stock resultante
//     siempre es >= 0 (RN-033 no puede violarse desde este endpoint).
// Todo se procesa en UNA sola transacción: primero se valida CADA ítem
// (costo del excedente presente, lotes suficientes para cubrir cualquier
// faltante) y solo si TODOS pasan se aplican los cambios — así una
// persona que acaba de contar decenas de ítems no pierde su trabajo por
// un solo ítem con problema; ve de una vez la lista completa de qué
// corregir antes de grabar.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "inventario");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = registrarConteoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  }
  const { items } = parsed.data;

  // Ítems repetidos en el mismo envío (mismo tipo + id dos veces) son un
  // error del cliente, no algo que debamos adivinar cómo combinar.
  const claves = new Set<string>();
  for (const it of items) {
    const clave = `${it.tipo}:${it.id}`;
    if (claves.has(clave)) {
      return NextResponse.json({ error: "Hay un ítem repetido dos veces en el conteo enviado." }, { status: 400 });
    }
    claves.add(clave);
  }

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const idsInsumo = items.filter((i) => i.tipo === "insumo").map((i) => BigInt(i.id));
      const idsProducto = items.filter((i) => i.tipo === "producto").map((i) => BigInt(i.id));

      const [insumos, productos] = await Promise.all([
        idsInsumo.length > 0
          ? tx.insumo.findMany({ where: { id: { in: idsInsumo }, empresaId } })
          : Promise.resolve([]),
        idsProducto.length > 0
          ? tx.producto.findMany({ where: { id: { in: idsProducto }, empresaId } })
          : Promise.resolve([]),
      ]);
      const insumoPorId = new Map(insumos.map((i) => [i.id.toString(), i]));
      const productoPorId = new Map(productos.map((p) => [p.id.toString(), p]));

      // --- Paso 1: validar TODO antes de escribir nada ---
      type ItemAAplicar = {
        tipo: "insumo" | "producto";
        id: bigint;
        nombre: string;
        stockActual: number;
        costoActual: number;
        cantidadContada: number;
        costoUnitarioExcedente?: number;
        delta: number;
      };
      const aAplicar: ItemAAplicar[] = [];
      const errores: string[] = [];

      for (const item of items) {
        const registro = item.tipo === "insumo" ? insumoPorId.get(item.id) : productoPorId.get(item.id);
        if (!registro) {
          errores.push(`${item.tipo === "insumo" ? "Insumo" : "Producto"} no encontrado (id ${item.id}).`);
          continue;
        }
        const stockActual = Number(registro.stockActual);
        const costoActual = Number(registro.costoPromedioActual);
        const delta = item.cantidadContada - stockActual;

        if (delta > 0 && item.costoUnitarioExcedente === undefined) {
          errores.push(
            `"${registro.nombre}": el conteo (${item.cantidadContada}) es mayor al stock registrado (${stockActual}) — falta indicar el costo unitario del excedente.`
          );
          continue;
        }

        if (delta === 0) continue; // coincide con lo registrado, nada que hacer

        aAplicar.push({
          tipo: item.tipo,
          id: BigInt(item.id),
          nombre: registro.nombre,
          stockActual,
          costoActual,
          cantidadContada: item.cantidadContada,
          costoUnitarioExcedente: item.costoUnitarioExcedente,
          delta,
        });
      }

      // Para los ítems con faltante (delta < 0), verificar que haya lotes
      // suficientes para cubrirlo ANTES de tocar nada — igual que hace
      // /ajuste para un solo ítem, pero acá se revisan todos de una vez.
      for (const item of aAplicar) {
        if (item.delta >= 0) continue;
        const lotes = await tx.loteCompra.findMany({
          where:
            item.tipo === "insumo"
              ? { insumoId: item.id, cantidadDisponible: { gt: 0 } }
              : { productoId: item.id, cantidadDisponible: { gt: 0 } },
        });
        const disponibleTotal = lotes.reduce((acc, l) => acc + Number(l.cantidadDisponible), 0);
        if (disponibleTotal < Math.abs(item.delta)) {
          errores.push(
            `"${item.nombre}": no hay lotes suficientes registrados para cubrir el faltante (necesita cubrir ${Math.abs(item.delta)}, hay ${disponibleTotal} en lotes). Contacta soporte antes de continuar.`
          );
        }
      }

      if (errores.length > 0) {
        throw new ErrorDeValidacionConteo(errores);
      }

      // --- Paso 2: ya validado todo, aplicar los cambios ---
      const cambios: { tipo: string; nombre: string; stockAnterior: number; stockNuevo: number }[] = [];

      for (const item of aAplicar) {
        const nuevoStock = item.stockActual + item.delta;
        const nuevoCosto =
          item.delta > 0
            ? (item.stockActual * item.costoActual + item.delta * (item.costoUnitarioExcedente ?? 0)) / nuevoStock
            : item.costoActual;

        if (item.tipo === "insumo") {
          await tx.insumo.update({
            where: { id: item.id },
            data: { stockActual: nuevoStock, costoPromedioActual: nuevoCosto },
          });
        } else {
          await tx.producto.update({
            where: { id: item.id },
            data: { stockActual: nuevoStock, costoPromedioActual: nuevoCosto },
          });
        }

        if (item.delta > 0) {
          const lote = await tx.loteCompra.create({
            data: {
              empresaId,
              ...(item.tipo === "insumo" ? { insumoId: item.id } : { productoId: item.id }),
              origen: "ajuste_inventario",
              cantidadInicial: item.delta,
              cantidadDisponible: item.delta,
              costoUnitario: item.costoUnitarioExcedente ?? 0,
              referenciaTipo: "ajuste_inventario",
            },
          });
          await tx.movimientoInventario.create({
            data: {
              empresaId,
              ...(item.tipo === "insumo" ? { insumoId: item.id } : { productoId: item.id }),
              tipo: "ajuste_inventario",
              cantidad: item.delta,
              costoUnitario: item.costoUnitarioExcedente ?? 0,
              loteId: lote.id,
              usuarioId: usuarioActual.id,
              referenciaTipo: "ajuste_inventario",
            },
          });
        } else {
          // Consumo PEPS de lotes existentes para cubrir el faltante
          // (ya se validó en el paso 1 que alcanzan).
          let faltante = Math.abs(item.delta);
          const lotes = await tx.loteCompra.findMany({
            where:
              item.tipo === "insumo"
                ? { insumoId: item.id, cantidadDisponible: { gt: 0 } }
                : { productoId: item.id, cantidadDisponible: { gt: 0 } },
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
                ...(item.tipo === "insumo" ? { insumoId: item.id } : { productoId: item.id }),
                tipo: "ajuste_inventario",
                cantidad: -consumir,
                costoUnitario: lote.costoUnitario,
                loteId: lote.id,
                usuarioId: usuarioActual.id,
                referenciaTipo: "ajuste_inventario",
              },
            });
            faltante -= consumir;
          }
        }

        cambios.push({
          tipo: item.tipo,
          nombre: item.nombre,
          stockAnterior: item.stockActual,
          stockNuevo: nuevoStock,
        });
      }

      await tx.auditoria.create({
        data: {
          usuarioId: usuarioActual.id,
          empresaId,
          tablaAfectada: "inventario",
          registroId: empresaId,
          accion: "conteo_fisico",
          valorNuevo: { itemsAjustados: cambios.length, detalle: cambios },
        },
      });

      return cambios;
    });

    return NextResponse.json({ ok: true, itemsAjustados: resultado.length, detalle: resultado });
  } catch (error) {
    if (error instanceof ErrorDeValidacionConteo) {
      return NextResponse.json({ error: "No se grabó nada — corrige lo siguiente:", detalles: error.errores }, { status: 400 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

class ErrorDeValidacionConteo extends Error {
  errores: string[];
  constructor(errores: string[]) {
    super("Errores de validación en el conteo de inventario");
    this.errores = errores;
  }
}
