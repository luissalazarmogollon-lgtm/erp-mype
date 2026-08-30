import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { NATURALEZAS_EGRESO } from "@/lib/naturalezaEgreso";
import { TIPOS_COMPROBANTE } from "@/lib/tiposComprobante";

export const dynamic = "force-dynamic";

const NATURALEZAS_VALIDAS = NATURALEZAS_EGRESO.map((n) => n.value) as [string, ...string[]];
const TIPOS_COMPROBANTE_VALIDOS = TIPOS_COMPROBANTE.map((t) => t.value) as [string, ...string[]];

// Registrar una factura por pagar directamente desde este módulo — sin
// pasar por Gastos y Costos ni por una compra/pedido previo. Por debajo
// crea el mismo par Gasto (condicion="credito") + CuentaPorPagar que ya
// generaba la pantalla de Gastos, para que la factura también aparezca
// correctamente clasificada en Gastos y Costos y en el Estado de
// Resultados (según su `naturaleza`).
const registrarFacturaSchema = z.object({
  localId: z.string().optional(),
  naturaleza: z.enum(NATURALEZAS_VALIDAS),
  categoriaEspecifica: z.string().optional(),
  proveedorNombre: z.string().min(1, "Indica el proveedor"),
  descripcion: z.string().min(2, "Describe brevemente la factura"),
  tipoComprobante: z.enum(TIPOS_COMPROBANTE_VALIDOS),
  numeroComprobante: z.string().optional(),
  montoTotal: z.number().positive(),
  fecha: z.string(),
  fechaVencimiento: z.string().optional(),
});

// GET /api/empresas/[id]/cuentas-por-pagar — listado con saldo pendiente.
// Cada fila puede venir de un gasto simple (un solo ítem) o de un
// documento de compra con varios ítems — se arma una descripción que
// funciona para ambos casos.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "cuentas_por_pagar");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const cxps = await prisma.cuentaPorPagar.findMany({
    where: { empresaId },
    include: {
      gasto: true,
      pagos: true,
      documentoCompra: { include: { items: true } },
    },
    orderBy: { fechaEmision: "desc" },
  });

  return NextResponse.json(
    cxps.map((c) => {
      const descripcion = c.gasto
        ? c.gasto.descripcion
        : c.documentoCompra
        ? `${c.documentoCompra.numeroComprobante ?? "Documento"} (${c.documentoCompra.items.length} ítems)`
        : "-";

      return {
        id: c.id.toString(),
        proveedorNombre: c.proveedorNombre,
        descripcionGasto: descripcion,
        montoTotal: c.montoTotal.toString(),
        saldoPendiente: c.saldoPendiente.toString(),
        fechaEmision: c.fechaEmision,
        fechaVencimiento: c.fechaVencimiento,
        estado: c.estado,
        pagos: c.pagos.map((p) => ({ monto: p.monto.toString(), fecha: p.fecha, medioPago: p.medioPago })),
      };
    })
  );
}

// POST /api/empresas/[id]/cuentas-por-pagar
//
// Registra una factura por pagar directamente (sin pasar por Gastos y
// Costos). Crea un Gasto con condicion="credito" y su CuentaPorPagar
// asociada, igual que hace la pantalla de Gastos — así la factura queda
// clasificada por naturaleza para el Estado de Resultados y aparece en
// ambas pantallas de forma consistente.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "cuentas_por_pagar");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = registrarFacturaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const datos = parsed.data;

  const localId = datos.localId ? BigInt(datos.localId) : null;
  const usuarioId = usuarioActual.id;

  const { gasto, cuentaPorPagar } = await prisma.$transaction(async (tx) => {
    const nuevoGasto = await tx.gasto.create({
      data: {
        empresaId,
        localId,
        naturaleza: datos.naturaleza,
        categoriaEspecifica: datos.categoriaEspecifica || null,
        proveedorNombre: datos.proveedorNombre,
        descripcion: datos.descripcion,
        tipoComprobante: datos.tipoComprobante,
        numeroComprobante: datos.numeroComprobante || null,
        montoTotal: datos.montoTotal,
        fecha: new Date(datos.fecha),
        condicion: "credito",
        usuarioId,
      },
    });

    const nuevaCxp = await tx.cuentaPorPagar.create({
      data: {
        empresaId,
        gastoId: nuevoGasto.id,
        proveedorNombre: datos.proveedorNombre,
        montoTotal: datos.montoTotal,
        saldoPendiente: datos.montoTotal,
        fechaVencimiento: datos.fechaVencimiento ? new Date(datos.fechaVencimiento) : null,
      },
    });

    await tx.auditoria.create({
      data: {
        usuarioId,
        empresaId,
        tablaAfectada: "gastos",
        registroId: nuevoGasto.id,
        accion: "crear",
        valorNuevo: { descripcion: nuevoGasto.descripcion, montoTotal: nuevoGasto.montoTotal.toString(), origen: "cuentas_por_pagar" },
      },
    });

    return { gasto: nuevoGasto, cuentaPorPagar: nuevaCxp };
  });

  return NextResponse.json({ id: cuentaPorPagar.id.toString(), gastoId: gasto.id.toString() }, { status: 201 });
}
