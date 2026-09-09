import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const legInputSchema = z.object({
  cuentaBancariaId: z.string().min(1, "Selecciona a qué cuenta entró"),
  monto: z.number().positive("El monto depositado debe ser mayor a 0"),
});

const conciliarSchema = z.object({
  efectivo: legInputSchema.optional(),
  yape: legInputSchema.optional(),
  plin: legInputSchema.optional(),
  tarjeta: legInputSchema.optional(),
});

const LEGS = [
  { key: "efectivo" as const, campo: "efectivoCuentaId" as const, monto: "montoEfectivo" as const, label: "Efectivo" },
  { key: "yape" as const, campo: "yapeCuentaId" as const, monto: "montoYape" as const, label: "Yape" },
  { key: "plin" as const, campo: "plinCuentaId" as const, monto: "montoPlin" as const, label: "Plin" },
  { key: "tarjeta" as const, campo: "tarjetaCuentaId" as const, monto: "montoTarjeta" as const, label: "Tarjeta" },
];

// POST /api/empresas/[id]/ventas-diarias/[registroId]/conciliar
//
// Registra un depósito real en el banco contra un método de pago del día
// (efectivo, Yape, Plin o Tarjeta). A diferencia de antes, el monto
// depositado NO tiene que ser igual al monto registrado en la venta del
// día: quien lleva el efectivo al banco a veces deposita menos (queda
// "saldo por depositar", ver GET en ../route.ts, que lo calcula sumando
// todas las filas de ConciliacionVentaDiaria de cada leg) o más (el
// excedente simplemente queda registrado como parte del depósito, sin
// bloquear nada). Por eso se puede llamar varias veces para el mismo
// método hasta cubrir el monto vendido — cada llamada es un depósito
// nuevo, no un reemplazo del anterior.
//
// Es una acción sensible (mueve saldos reales de cuentas bancarias), así
// que requiere el permiso granular "conciliar_ventas_diarias" en esta
// empresa — el superadmin siempre lo tiene (accesoTotal automático), y
// además el superadmin puede asignarle este permiso puntual a cualquier
// persona que lo apoye, sin tener que darle acceso total ni el resto de
// permisos de Flujo de Caja.
export async function POST(
  request: Request,
  { params }: { params: { id: string; registroId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "conciliar_ventas_diarias");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = conciliarSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const registroId = BigInt(params.registroId);
  const registro = await prisma.registroVentaDiaria.findFirst({ where: { id: registroId, empresaId } });
  if (!registro) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });

  const usuarioId = usuarioActual.id;
  const procesados: { label: string; monto: string }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const leg of LEGS) {
      const entrada = datos[leg.key];
      if (!entrada) continue;

      const montoRegistrado = Number(registro[leg.monto]);
      if (montoRegistrado <= 0) continue; // nada que conciliar en este método

      const cuentaId = BigInt(entrada.cuentaBancariaId);
      const montoDeposito = entrada.monto;

      await tx.movimientoBancario.create({
        data: {
          cuentaBancariaId: cuentaId,
          tipo: "ingreso",
          monto: montoDeposito,
          concepto: `Venta del día (${leg.label}) — depósito — ${registro.fecha.toISOString().slice(0, 10)}`,
          referenciaTipo: "venta_diaria",
          referenciaId: registro.id,
          usuarioId,
        },
      });
      await tx.cuentaBancaria.update({
        where: { id: cuentaId },
        data: { saldoActual: { increment: montoDeposito } },
      });
      await tx.conciliacionVentaDiaria.create({
        data: {
          registroVentaDiariaId: registroId,
          leg: leg.key,
          monto: montoDeposito,
          cuentaBancariaId: cuentaId,
          usuarioId,
        },
      });

      // Guarda la última cuenta usada para este método — referencia rápida
      // en el historial y, sobre todo, mantiene el candado que impide
      // borrar el registro una vez que ya se movió dinero real (ver
      // DELETE en ../[registroId]/route.ts). Se usa un switch explícito
      // (en vez de una clave computada) para que Prisma tipe correctamente
      // cada campo de la actualización.
      if (leg.campo === "efectivoCuentaId") {
        await tx.registroVentaDiaria.update({ where: { id: registroId }, data: { efectivoCuentaId: cuentaId } });
      } else if (leg.campo === "yapeCuentaId") {
        await tx.registroVentaDiaria.update({ where: { id: registroId }, data: { yapeCuentaId: cuentaId } });
      } else if (leg.campo === "plinCuentaId") {
        await tx.registroVentaDiaria.update({ where: { id: registroId }, data: { plinCuentaId: cuentaId } });
      } else {
        await tx.registroVentaDiaria.update({ where: { id: registroId }, data: { tarjetaCuentaId: cuentaId } });
      }

      procesados.push({ label: leg.label, monto: montoDeposito.toFixed(2) });
    }
  });

  if (procesados.length === 0) {
    return NextResponse.json(
      { error: "No se indicó ningún depósito válido (monto y cuenta bancaria) para registrar." },
      { status: 400 }
    );
  }

  return NextResponse.json({ procesados });
}
