import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const itemVentaSchema = z.object({
  productoId: z.string(),
  cantidad: z.number().positive(),
  precioUnitario: z.number().min(0),
});

const registrarVentaSchema = z.object({
  clienteId: z.string().optional(),
  metodoPagoId: z.string().optional(),
  items: z.array(itemVentaSchema).min(1, "Agrega al menos un producto"),
  descuento: z.number().min(0).default(0),
  // RN-022: por defecto el sistema BLOQUEA la venta si falta stock de algún
  // insumo. Este flag permite forzarla de todas formas (decisión operativa
  // puntual del cajero/admin), quedando registrada igual en auditoría.
  forzarSinStock: z.boolean().default(false),
});

// GET /api/empresas/[id]/ventas — historial de ventas de la empresa.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const ventas = await prisma.venta.findMany({
    where: { empresaId },
    include: { cliente: true, metodoPago: true, detalle: { include: { producto: true } } },
    orderBy: { fecha: "desc" },
    take: 100,
  });

  return NextResponse.json(
    ventas.map((v) => ({
      id: v.id.toString(),
      numero: v.numero,
      fecha: v.fecha,
      cliente: v.cliente?.nombre ?? "Consumidor final",
      metodoPago: v.metodoPago?.nombre ?? "-",
      subtotal: v.subtotal.toString(),
      igv: v.igv.toString(),
      total: v.total.toString(),
      estado: v.estado,
      items: v.detalle.map((d) => ({
        producto: d.producto.nombre,
        cantidad: d.cantidad.toString(),
        precioUnitario: d.precioUnitario.toString(),
        costoUnitario: d.costoUnitarioCalculado.toString(),
      })),
    }))
  );
}

// POST /api/empresas/[id]/ventas — registra una venta completa (HU-10):
// calcula costo por ficha técnica (RN-020), lo congela en el detalle
// (RN-021), valida y descuenta stock (RN-022, RN-023), calcula IGV
// según configuración de la empresa (RN-025).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

  const body = await request.json();
  const parsed = registrarVentaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const datos = parsed.data;

  // Cargamos cada producto con su ficha técnica (receta) para calcular
  // costo y validar stock ANTES de tocar la base de datos.
  const productos = await prisma.producto.findMany({
    where: { empresaId, id: { in: datos.items.map((i) => BigInt(i.productoId)) } },
    include: { fichaTecnica: { include: { insumo: true } } },
  });

  if (productos.length !== datos.items.length) {
    return NextResponse.json({ error: "Algún producto no existe en esta empresa" }, { status: 400 });
  }

  // Acumulamos el consumo total de cada insumo across todos los items de
  // la venta, para validar stock una sola vez por insumo (RN-022).
  const consumoPorInsumo = new Map<string, { cantidad: number; nombre: string; stockActual: number }>();
  const itemsCalculados = datos.items.map((item) => {
    const producto = productos.find((p) => p.id === BigInt(item.productoId))!;

    // RN-020: costo real = Σ (cantidad_receta × costo_promedio_insumo)
    const costoUnitarioCalculado = producto.fichaTecnica.reduce(
      (acc, f) => acc + Number(f.cantidadRequerida) * Number(f.insumo.costoPromedioActual),
      0
    );

    for (const f of producto.fichaTecnica) {
      const key = f.insumoId.toString();
      const consumoLinea = Number(f.cantidadRequerida) * item.cantidad;
      const existente = consumoPorInsumo.get(key);
      consumoPorInsumo.set(key, {
        cantidad: (existente?.cantidad ?? 0) + consumoLinea,
        nombre: f.insumo.nombre,
        stockActual: Number(f.insumo.stockActual),
      });
    }

    return {
      productoId: producto.id,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      costoUnitarioCalculado,
      subtotal: item.precioUnitario * item.cantidad,
    };
  });

  // RN-022: validar stock suficiente (bloquea por defecto).
  if (!datos.forzarSinStock) {
    const faltantes = Array.from(consumoPorInsumo.entries())
      .filter(([, v]) => v.cantidad > v.stockActual)
      .map(([, v]) => `${v.nombre} (necesitas ${v.cantidad}, tienes ${v.stockActual})`);

    if (faltantes.length > 0) {
      return NextResponse.json(
        {
          error: `Stock insuficiente: ${faltantes.join(", ")}`,
          stockInsuficiente: true,
        },
        { status: 409 }
      );
    }
  }

  const subtotal = itemsCalculados.reduce((acc, i) => acc + i.subtotal, 0);
  const descuento = datos.descuento;
  // RN-025: el IGV solo se calcula si la empresa lo aplica.
  const igv = empresa.aplicaIgv ? ((subtotal - descuento) * Number(empresa.tasaIgv)) / 100 : 0;
  const total = subtotal - descuento + igv;

  const numeroVentas = await prisma.venta.count({ where: { empresaId } });
  const numero = `V-${String(numeroVentas + 1).padStart(6, "0")}`;

  const venta = await prisma.$transaction(async (tx) => {
    const nuevaVenta = await tx.venta.create({
      data: {
        empresaId,
        numero,
        clienteId: datos.clienteId ? BigInt(datos.clienteId) : null,
        usuarioId: usuarioActual.id,
        metodoPagoId: datos.metodoPagoId ? BigInt(datos.metodoPagoId) : null,
        subtotal,
        descuento,
        igv,
        total,
        estado: "cobrada",
      },
    });

    // RN-021: el costo queda congelado en el detalle, no se recalcula después.
    await tx.ventaDetalle.createMany({
      data: itemsCalculados.map((i) => ({
        ventaId: nuevaVenta.id,
        productoId: i.productoId,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
        costoUnitarioCalculado: i.costoUnitarioCalculado,
        subtotal: i.subtotal,
      })),
    });

    // RN-023: descuenta stock generando movimientos_inventario tipo salida_venta.
    for (const [insumoIdStr, consumo] of consumoPorInsumo.entries()) {
      const insumoId = BigInt(insumoIdStr);
      await tx.movimientoInventario.create({
        data: {
          empresaId,
          insumoId,
          tipo: "salida_venta",
          cantidad: -consumo.cantidad,
          costoUnitario: 0, // se registra el costo en ventas_detalle, no aquí
          referenciaTipo: "venta",
          referenciaId: nuevaVenta.id,
          usuarioId: usuarioActual.id,
        },
      });
      await tx.insumo.update({
        where: { id: insumoId },
        data: { stockActual: { decrement: consumo.cantidad } },
      });
    }

    await tx.auditoria.create({
      data: {
        usuarioId: usuarioActual.id,
        empresaId,
        tablaAfectada: "ventas",
        registroId: nuevaVenta.id,
        accion: "crear",
        valorNuevo: { numero: nuevaVenta.numero, total: nuevaVenta.total.toString() },
      },
    });

    return nuevaVenta;
  });

  return NextResponse.json(
    { id: venta.id.toString(), numero: venta.numero, total: venta.total.toString() },
    { status: 201 }
  );
}
