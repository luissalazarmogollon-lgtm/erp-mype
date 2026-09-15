import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const cuotaSchema = z.object({
  fecha: z.string(), // YYYY-MM-DD
  montoCapital: z.number().min(0),
  montoInteres: z.number().min(0),
  cuentaBancariaId: z.string().min(1, "Indica de qué cuenta sale el pago"),
});

// POST /api/empresas/[id]/prestamos/[prestamoId]/cuota
//
// Registra el pago de una cuota de un préstamo. Reutiliza exactamente el
// mismo tratamiento contable que ya existía para "Pago de deuda" en
// Gastos y Costos (naturaleza "deuda" para el capital, que NO afecta el
// Estado de Resultados — es reducir un pasivo, no un gasto; naturaleza
// "gasto_financiero" para el interés, que SÍ afecta el Estado de
// Resultados), pero además:
//   - vincula cada Gasto generado con este préstamo (prestamoId), para
//     poder mostrar el historial de cuotas y calcular lo pagado;
//   - descuenta el saldoPendiente del préstamo por la parte de capital,
//     y no deja pagar más capital del que queda pendiente;
//   - hereda el Local del préstamo (si tiene uno asignado), para que ese
//     costo también cuente en el Estado de Resultados filtrado por ese
//     local/proyecto.
// Una cuota se paga siempre al contado (se descuenta de una cuenta
// bancaria en el momento) — no hay concepto de "cuota a crédito".
export async function POST(
  request: Request,
  { params }: { params: { id: string; prestamoId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "prestamos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = cuotaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  if (datos.montoCapital <= 0 && datos.montoInteres <= 0) {
    return NextResponse.json({ error: "Indica el monto de capital y/o de interés de la cuota." }, { status: 400 });
  }

  const prestamoId = BigInt(params.prestamoId);
  const prestamo = await prisma.prestamo.findFirst({ where: { id: prestamoId, empresaId } });
  if (!prestamo) return NextResponse.json({ error: "Préstamo no encontrado" }, { status: 404 });

  const saldoActual = Number(prestamo.saldoPendiente);
  if (datos.montoCapital > saldoActual + 0.004) {
    return NextResponse.json(
      {
        error: `El capital de esta cuota (S/ ${datos.montoCapital.toFixed(2)}) supera el saldo pendiente del préstamo (S/ ${saldoActual.toFixed(2)}).`,
      },
      { status: 400 }
    );
  }

  const cuentaBancariaId = BigInt(datos.cuentaBancariaId);
  const usuarioId = usuarioActual.id;
  const fecha = new Date(datos.fecha);
  const gastosCreados: { id: bigint; naturaleza: string; monto: number }[] = [];

  await prisma.$transaction(async (tx) => {
    async function registrarParte(naturaleza: "deuda" | "gasto_financiero", categoriaEspecifica: string, monto: number, etiqueta: string) {
      const nuevoGasto = await tx.gasto.create({
        data: {
          empresaId,
          localId: prestamo.localId,
          naturaleza,
          categoriaEspecifica,
          proveedorNombre: prestamo.entidadFinanciera,
          descripcion: `Cuota préstamo ${prestamo.entidadFinanciera}${prestamo.numeroCredito ? ` N° ${prestamo.numeroCredito}` : ""} — ${etiqueta}`,
          tipoComprobante: "sin_comprobante",
          montoTotal: monto,
          fecha,
          condicion: "contado",
          medioPago: "Transferencia",
          cuentaBancariaId,
          prestamoId: prestamo.id,
          usuarioId,
        },
      });

      await tx.movimientoBancario.create({
        data: {
          cuentaBancariaId,
          tipo: "egreso",
          monto,
          concepto: nuevoGasto.descripcion,
          referenciaTipo: "gasto",
          referenciaId: nuevoGasto.id,
          usuarioId,
        },
      });
      await tx.cuentaBancaria.update({
        where: { id: cuentaBancariaId },
        data: { saldoActual: { decrement: monto } },
      });

      gastosCreados.push({ id: nuevoGasto.id, naturaleza, monto });
    }

    if (datos.montoCapital > 0) {
      await registrarParte("deuda", "Préstamo bancario", datos.montoCapital, "capital");
    }
    if (datos.montoInteres > 0) {
      await registrarParte("gasto_financiero", "Intereses de préstamo", datos.montoInteres, "interés");
    }

    const nuevoSaldo = Math.max(saldoActual - datos.montoCapital, 0);
    await tx.prestamo.update({
      where: { id: prestamoId },
      data: {
        saldoPendiente: nuevoSaldo,
        estado: nuevoSaldo <= 0.004 ? "pagado" : "activo",
      },
    });

    await tx.auditoria.create({
      data: {
        usuarioId,
        empresaId,
        tablaAfectada: "prestamos",
        registroId: prestamoId,
        accion: "editar",
        valorNuevo: {
          accion: "registrar_cuota",
          montoCapital: datos.montoCapital.toString(),
          montoInteres: datos.montoInteres.toString(),
          saldoPendienteNuevo: nuevoSaldo.toString(),
        },
      },
    });
  });

  return NextResponse.json({ ids: gastosCreados.map((g) => g.id.toString()) }, { status: 201 });
}
