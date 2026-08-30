import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { NATURALEZAS_EGRESO } from "@/lib/naturalezaEgreso";
import { TIPOS_COMPROBANTE } from "@/lib/tiposComprobante";

export const dynamic = "force-dynamic";

const NATURALEZAS_VALIDAS = NATURALEZAS_EGRESO.map((n) => n.value) as [string, ...string[]];
const TIPOS_COMPROBANTE_VALIDOS = TIPOS_COMPROBANTE.map((t) => t.value) as [string, ...string[]];

const itemSchema = z.object({
  descripcion: z.string().min(2, "Describe brevemente el ítem"),
  naturaleza: z.enum(NATURALEZAS_VALIDAS),
  categoriaEspecifica: z.string().optional(),
  monto: z.number().positive(),
});

const documentoSchema = z.object({
  localId: z.string().optional(),
  proveedorNombre: z.string().optional(),
  tipoComprobante: z.enum(TIPOS_COMPROBANTE_VALIDOS).default("sin_comprobante"),
  numeroComprobante: z.string().optional(),
  fecha: z.string(), // YYYY-MM-DD
  condicion: z.enum(["contado", "credito"]),
  medioPago: z.string().optional(),
  cuentaBancariaId: z.string().optional(),
  fechaVencimiento: z.string().optional(),
  items: z.array(itemSchema).min(1, "Agrega al menos un ítem"),
});

// POST /api/empresas/[id]/documentos-compra
//
// Registra UN documento (factura/boleta/nota) que trae VARIOS ítems, cada
// uno con su propia naturaleza/categoría/monto — por ejemplo, una factura
// de un proveedor que incluye insumos (costo directo) y a la vez algún
// material de limpieza (gasto operativo) en el mismo comprobante.
//
// Crea: 1 DocumentoCompra (cabecera) + N Gasto (uno por ítem, cada uno
// clasificable y visible individualmente en Gastos y Costos) +, si es al
// contado, UN solo movimiento bancario por el total (no uno por ítem) +,
// si es al crédito, UNA sola Cuenta por Pagar por el total del documento.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "gastos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = documentoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  if (datos.condicion === "contado" && !datos.medioPago) {
    return NextResponse.json({ error: "Indica el medio de pago para un documento al contado" }, { status: 400 });
  }

  const localId = datos.localId ? BigInt(datos.localId) : null;
  const cuentaBancariaId = datos.condicion === "contado" && datos.cuentaBancariaId ? BigInt(datos.cuentaBancariaId) : null;
  const montoTotal = datos.items.reduce((acc, i) => acc + i.monto, 0);
  const usuarioId = usuarioActual.id;

  const documento = await prisma.$transaction(async (tx) => {
    const nuevoDocumento = await tx.documentoCompra.create({
      data: {
        empresaId,
        localId,
        proveedorNombre: datos.proveedorNombre || null,
        tipoComprobante: datos.tipoComprobante,
        numeroComprobante: datos.numeroComprobante || null,
        fecha: new Date(datos.fecha),
        condicion: datos.condicion,
        medioPago: datos.condicion === "contado" ? datos.medioPago : null,
        cuentaBancariaId,
        montoTotal,
        usuarioId,
      },
    });

    // Un Gasto por cada ítem, todos apuntando al mismo documento — así
    // cada uno se ve clasificado por su propia naturaleza en Gastos y
    // Costos, pero comparten proveedor/comprobante/fecha/condición.
    for (const item of datos.items) {
      const nuevoGasto = await tx.gasto.create({
        data: {
          empresaId,
          localId,
          documentoCompraId: nuevoDocumento.id,
          naturaleza: item.naturaleza,
          categoriaEspecifica: item.categoriaEspecifica || null,
          proveedorNombre: datos.proveedorNombre || null,
          descripcion: item.descripcion,
          tipoComprobante: datos.tipoComprobante,
          numeroComprobante: datos.numeroComprobante || null,
          montoTotal: item.monto,
          fecha: new Date(datos.fecha),
          condicion: datos.condicion,
          medioPago: datos.condicion === "contado" ? datos.medioPago : null,
          cuentaBancariaId,
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
          valorNuevo: { origen: "documento_compra", descripcion: item.descripcion, monto: item.monto.toString() },
        },
      });
    }

    // Una sola CxP para todo el documento (si es a crédito) — no una por ítem.
    if (datos.condicion === "credito") {
      await tx.cuentaPorPagar.create({
        data: {
          empresaId,
          documentoCompraId: nuevoDocumento.id,
          proveedorNombre: datos.proveedorNombre || null,
          montoTotal,
          saldoPendiente: montoTotal,
          fechaVencimiento: datos.fechaVencimiento ? new Date(datos.fechaVencimiento) : null,
        },
      });
    }

    // Un solo movimiento bancario por el total (si es al contado con cuenta).
    if (cuentaBancariaId) {
      await tx.movimientoBancario.create({
        data: {
          cuentaBancariaId,
          tipo: "egreso",
          monto: montoTotal,
          concepto: `${datos.proveedorNombre ?? "Compra"} — ${datos.numeroComprobante ?? "sin número"} (${datos.items.length} ítems)`,
          referenciaTipo: "documento_compra",
          referenciaId: nuevoDocumento.id,
          usuarioId,
        },
      });
      await tx.cuentaBancaria.update({
        where: { id: cuentaBancariaId },
        data: { saldoActual: { decrement: montoTotal } },
      });
    }

    return nuevoDocumento;
  });

  return NextResponse.json({ id: documento.id.toString(), montoTotal }, { status: 201 });
}
