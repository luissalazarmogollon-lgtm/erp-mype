import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { NATURALEZAS_EGRESO, impactaResultados } from "@/lib/naturalezaEgreso";

export const dynamic = "force-dynamic";

const NATURALEZAS_VALIDAS = NATURALEZAS_EGRESO.map((n) => n.value) as [string, ...string[]];

const registrarGastoSchema = z.object({
  localId: z.string().optional(),
  naturaleza: z.enum(NATURALEZAS_VALIDAS),
  categoriaEspecifica: z.string().optional(),
  proveedorNombre: z.string().optional(),
  descripcion: z.string().min(2, "Describe brevemente el egreso"),
  tipoComprobante: z.enum(["boleta", "factura", "recibo_honorarios", "ticket", "sin_comprobante"]),
  montoTotal: z.number().positive(),
  fecha: z.string(),
  condicion: z.enum(["contado", "credito"]),
  medioPago: z.string().optional(),
  cuentaBancariaId: z.string().optional(),
  fechaVencimiento: z.string().optional(),
  montoInteres: z.number().min(0).default(0),
});

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "gastos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const gastos = await prisma.gasto.findMany({
    where: { empresaId },
    include: { local: true, cuentaPorPagar: true, cuentaBancaria: true },
    orderBy: { fecha: "desc" },
    take: 150,
  });

  return NextResponse.json(
    gastos.map((g) => ({
      id: g.id.toString(),
      local: g.local?.nombre ?? null,
      naturaleza: g.naturaleza,
      categoriaEspecifica: g.categoriaEspecifica,
      proveedorNombre: g.proveedorNombre,
      descripcion: g.descripcion,
      tipoComprobante: g.tipoComprobante,
      montoTotal: g.montoTotal.toString(),
      fecha: g.fecha,
      condicion: g.condicion,
      medioPago: g.medioPago,
      cuentaBancaria: g.cuentaBancaria?.bancoNombre ?? null,
      estadoPago: g.cuentaPorPagar?.estado ?? "pagado",
      impactaResultados: impactaResultados(g.naturaleza),
    }))
  );
}

// POST /api/empresas/[id]/gastos
//
// LOGICA CLAVE: todo egreso se registra por su monto total (lo que
// realmente salio de caja), pero solo la parte que corresponde a
// costo/gasto (segun `naturaleza`) impacta el Estado de Resultados.
//
// Si es al contado y se indica cuentaBancariaId, se genera automaticamente
// el movimiento bancario de egreso y se descuenta el saldo de esa cuenta
// (flujo de caja por cuenta bancaria).
//
// Caso especial "pago de deuda": si se otorga un montoInteres > 0, el
// pago se parte automaticamente en DOS registros: uno de naturaleza
// 'deuda' (capital, no afecta resultados) y otro de 'gasto_financiero'
// (interes, si afecta resultados).
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
  const parsed = registrarGastoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const datos = parsed.data;

  if (datos.condicion === "contado" && !datos.medioPago) {
    return NextResponse.json({ error: "Indica el medio de pago para un egreso al contado" }, { status: 400 });
  }
  if (datos.naturaleza === "deuda" && datos.montoInteres > datos.montoTotal) {
    return NextResponse.json({ error: "El interes no puede ser mayor al monto total pagado" }, { status: 400 });
  }

  const localId = datos.localId ? BigInt(datos.localId) : null;
  const cuentaBancariaId = datos.condicion === "contado" && datos.cuentaBancariaId ? BigInt(datos.cuentaBancariaId) : null;
  const usuarioId = usuarioActual.id;

  const gastosCreados = await prisma.$transaction(async (tx) => {
    async function crearGastoConCxp(naturaleza: string, monto: number, descripcionExtra?: string) {
      const nuevoGasto = await tx.gasto.create({
        data: {
          empresaId,
          localId,
          naturaleza,
          categoriaEspecifica: datos.categoriaEspecifica || null,
          proveedorNombre: datos.proveedorNombre || null,
          descripcion: descripcionExtra ? `${datos.descripcion} — ${descripcionExtra}` : datos.descripcion,
          tipoComprobante: datos.tipoComprobante,
          montoTotal: monto,
          fecha: new Date(datos.fecha),
          condicion: datos.condicion,
          medioPago: datos.condicion === "contado" ? datos.medioPago : null,
          cuentaBancariaId,
          usuarioId,
        },
      });

      if (datos.condicion === "credito") {
        await tx.cuentaPorPagar.create({
          data: {
            empresaId,
            gastoId: nuevoGasto.id,
            proveedorNombre: datos.proveedorNombre || null,
            montoTotal: monto,
            saldoPendiente: monto,
            fechaVencimiento: datos.fechaVencimiento ? new Date(datos.fechaVencimiento) : null,
          },
        });
      }

      if (cuentaBancariaId) {
        await tx.movimientoBancario.create({
          data: {
            cuentaBancariaId,
            tipo: "egreso",
            monto,
            concepto: descripcionExtra ? `${datos.descripcion} — ${descripcionExtra}` : datos.descripcion,
            referenciaTipo: "gasto",
            referenciaId: nuevoGasto.id,
            usuarioId,
          },
        });
        await tx.cuentaBancaria.update({
          where: { id: cuentaBancariaId },
          data: { saldoActual: { decrement: monto } },
        });
      }

      await tx.auditoria.create({
        data: {
          usuarioId,
          empresaId,
          tablaAfectada: "gastos",
          registroId: nuevoGasto.id,
          accion: "crear",
          valorNuevo: { descripcion: nuevoGasto.descripcion, montoTotal: nuevoGasto.montoTotal.toString() },
        },
      });

      return nuevoGasto;
    }

    if (datos.naturaleza === "deuda" && datos.montoInteres > 0) {
      const montoCapital = datos.montoTotal - datos.montoInteres;
      const registros = [];
      if (montoCapital > 0) {
        registros.push(await crearGastoConCxp("deuda", montoCapital, "capital"));
      }
      registros.push(await crearGastoConCxp("gasto_financiero", datos.montoInteres, "interés"));
      return registros;
    }

    return [await crearGastoConCxp(datos.naturaleza, datos.montoTotal)];
  });

  return NextResponse.json({ ids: gastosCreados.map((g) => g.id.toString()) }, { status: 201 });
}
