import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoAlguno } from "@/lib/auth";
import { TIPOS_COMPROBANTE } from "@/lib/tiposComprobante";

export const dynamic = "force-dynamic";

const TIPOS_COMPROBANTE_VALIDOS = TIPOS_COMPROBANTE.map((t) => t.value) as [string, ...string[]];

// Registrar una factura por pagar directamente desde este módulo — sin
// pasar por Gastos y Costos ni por una compra/pedido previo, y puede
// traer uno o varios ítems (igual que un documento de compra normal).
//
// A propósito NO pide Naturaleza del egreso ni Categoría específica: la
// persona que registra facturas ("cuentas_por_pagar_registrar") solo
// digita cada ítem con su descripción y monto — nada de clasificación
// contable, para que le sea simple. Cada ítem queda "sin clasificar"
// (naturaleza = NULL) hasta que el responsable de finanzas/contabilidad
// ("cuentas_por_pagar") se lo asigne desde esta misma pantalla — recién
// ahí esa factura se puede pagar (ver API de pago) y cuenta en el Estado
// de Resultados.
const itemFacturaSchema = z.object({
  descripcion: z.string().min(2, "Describe brevemente el ítem"),
  monto: z.number().positive(),
});

const registrarFacturaSchema = z.object({
  localId: z.string().optional(),
  proveedorNombre: z.string().min(1, "Indica el proveedor"),
  tipoComprobante: z.enum(TIPOS_COMPROBANTE_VALIDOS),
  numeroComprobante: z.string().optional(),
  fecha: z.string(),
  fechaVencimiento: z.string().optional(),
  items: z.array(itemFacturaSchema).min(1, "Agrega al menos un ítem"),
});

// GET /api/empresas/[id]/cuentas-por-pagar — listado con saldo pendiente
// y el detalle de ítems de cada factura (uno si viene de un gasto simple,
// varios si viene de un documento de compra), con la naturaleza de cada
// ítem para saber si ya está clasificado o sigue pendiente.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoAlguno(usuarioActual.id, empresaId, ["cuentas_por_pagar", "cuentas_por_pagar_registrar"]);
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
      const itemsRaw = c.documentoCompra ? c.documentoCompra.items : c.gasto ? [c.gasto] : [];
      const items = itemsRaw.map((g) => ({
        id: g.id.toString(),
        descripcion: g.descripcion,
        monto: g.montoTotal.toString(),
        naturaleza: g.naturaleza,
        categoriaEspecifica: g.categoriaEspecifica,
      }));
      const pendienteClasificar = items.some((i) => !i.naturaleza);

      const descripcion = c.documentoCompra
        ? `${c.documentoCompra.numeroComprobante ?? "Documento"} (${items.length} ítem${items.length !== 1 ? "s" : ""})`
        : c.gasto
        ? c.gasto.descripcion
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
        items,
        pendienteClasificar,
        pagos: c.pagos.map((p) => ({ monto: p.monto.toString(), fecha: p.fecha, medioPago: p.medioPago })),
      };
    })
  );
}

// POST /api/empresas/[id]/cuentas-por-pagar
//
// Registra una factura por pagar directamente, con uno o varios ítems.
// Crea 1 DocumentoCompra (cabecera) + N Gasto (uno por ítem, todos con
// naturaleza=NULL, "sin clasificar") + 1 CuentaPorPagar por el total —
// igual que el flujo de "Documento con varios ítems" de Gastos y Costos,
// pero sin pedir naturaleza/categoría en este paso.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoAlguno(usuarioActual.id, empresaId, ["cuentas_por_pagar", "cuentas_por_pagar_registrar"]);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = registrarFacturaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const localId = datos.localId ? BigInt(datos.localId) : null;
  const usuarioId = usuarioActual.id;
  const montoTotal = datos.items.reduce((acc, i) => acc + i.monto, 0);

  const documento = await prisma.$transaction(async (tx) => {
    const nuevoDocumento = await tx.documentoCompra.create({
      data: {
        empresaId,
        localId,
        proveedorNombre: datos.proveedorNombre,
        tipoComprobante: datos.tipoComprobante,
        numeroComprobante: datos.numeroComprobante || null,
        fecha: new Date(datos.fecha),
        condicion: "credito",
        montoTotal,
        usuarioId,
      },
    });

    for (const item of datos.items) {
      const nuevoGasto = await tx.gasto.create({
        data: {
          empresaId,
          localId,
          documentoCompraId: nuevoDocumento.id,
          naturaleza: null,
          categoriaEspecifica: null,
          proveedorNombre: datos.proveedorNombre,
          descripcion: item.descripcion,
          tipoComprobante: datos.tipoComprobante,
          numeroComprobante: datos.numeroComprobante || null,
          montoTotal: item.monto,
          fecha: new Date(datos.fecha),
          condicion: "credito",
          usuarioId,
        },
      });

      await tx.auditoria.create({
        data: {
          usuarioId,
          empresaId,
          tablaAfectada: "gastos",
          registroId: nuevoGasto.id,
          accion: "crear",
          valorNuevo: { origen: "cuentas_por_pagar", descripcion: item.descripcion, monto: item.monto.toString() },
        },
      });
    }

    const nuevaCxp = await tx.cuentaPorPagar.create({
      data: {
        empresaId,
        documentoCompraId: nuevoDocumento.id,
        proveedorNombre: datos.proveedorNombre,
        montoTotal,
        saldoPendiente: montoTotal,
        fechaVencimiento: datos.fechaVencimiento ? new Date(datos.fechaVencimiento) : null,
      },
    });

    await tx.auditoria.create({
      data: {
        usuarioId,
        empresaId,
        tablaAfectada: "cuentas_por_pagar",
        registroId: nuevaCxp.id,
        accion: "crear",
        valorNuevo: { proveedorNombre: datos.proveedorNombre, montoTotal: montoTotal.toString(), items: datos.items.length },
      },
    });

    return nuevoDocumento;
  });

  return NextResponse.json({ id: documento.id.toString(), montoTotal }, { status: 201 });
}
