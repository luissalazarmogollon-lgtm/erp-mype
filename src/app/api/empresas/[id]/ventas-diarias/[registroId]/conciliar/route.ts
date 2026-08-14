import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const conciliarSchema = z.object({
  efectivoCuentaId: z.string().optional(),
  yapeCuentaId: z.string().optional(),
  plinCuentaId: z.string().optional(),
  tarjetaCuentaId: z.string().optional(),
});

const LEGS = [
  { campo: "efectivoCuentaId" as const, monto: "montoEfectivo" as const, label: "Efectivo" },
  { campo: "yapeCuentaId" as const, monto: "montoYape" as const, label: "Yape" },
  { campo: "plinCuentaId" as const, monto: "montoPlin" as const, label: "Plin" },
  { campo: "tarjetaCuentaId" as const, monto: "montoTarjeta" as const, label: "Tarjeta" },
];

// POST /api/empresas/[id]/ventas-diarias/[registroId]/conciliar
//
// Indica a qué cuenta bancaria entró cada método de pago del día. Por cada
// método con monto > 0 que todavía no estaba conciliado (su *CuentaId es
// null) y que viene con una cuenta en el body, genera el movimiento
// bancario de ingreso y suma el saldo de esa cuenta. Es idempotente: si un
// método ya estaba conciliado, no se vuelve a procesar (evita duplicar el
// ingreso si se envía el formulario dos veces).
//
// Reservado a superadmin: es una acción sensible (mueve saldos reales de
// cuentas bancarias), así que requiere autorización del dueño de la
// plataforma, sin importar qué permisos tenga el usuario en esta empresa.
export async function POST(
  request: Request,
  { params }: { params: { id: string; registroId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  if (!usuarioActual.esSuperadminPlataforma) {
    return NextResponse.json(
      { error: "Solo el superadmin puede actualizar el flujo de caja desde una venta diaria" },
      { status: 403 }
    );
  }

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "flujo_caja");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = conciliarSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const datos = parsed.data;

  const registroId = BigInt(params.registroId);
  const registro = await prisma.registroVentaDiaria.findFirst({ where: { id: registroId, empresaId } });
  if (!registro) return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });

  const usuarioId = usuarioActual.id;
  const procesados: string[] = [];
  const yaConciliados: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const leg of LEGS) {
      const cuentaIdStr = datos[leg.campo];
      const montoLeg = Number(registro[leg.monto]);
      const yaConciliado = registro[leg.campo] !== null;

      if (montoLeg <= 0) continue;
      if (yaConciliado) {
        yaConciliados.push(leg.label);
        continue;
      }
      if (!cuentaIdStr) continue;

      const cuentaId = BigInt(cuentaIdStr);

      await tx.movimientoBancario.create({
        data: {
          cuentaBancariaId: cuentaId,
          tipo: "ingreso",
          monto: montoLeg,
          concepto: `Venta del día (${leg.label}) — ${registro.fecha.toISOString().slice(0, 10)}`,
          referenciaTipo: "venta_diaria",
          referenciaId: registro.id,
          usuarioId,
        },
      });
      await tx.cuentaBancaria.update({
        where: { id: cuentaId },
        data: { saldoActual: { increment: montoLeg } },
      });

      // Se usa un switch explícito (en vez de una clave computada) para
      // que Prisma tipe correctamente cada campo de la actualización.
      if (leg.campo === "efectivoCuentaId") {
        await tx.registroVentaDiaria.update({ where: { id: registroId }, data: { efectivoCuentaId: cuentaId } });
      } else if (leg.campo === "yapeCuentaId") {
        await tx.registroVentaDiaria.update({ where: { id: registroId }, data: { yapeCuentaId: cuentaId } });
      } else if (leg.campo === "plinCuentaId") {
        await tx.registroVentaDiaria.update({ where: { id: registroId }, data: { plinCuentaId: cuentaId } });
      } else {
        await tx.registroVentaDiaria.update({ where: { id: registroId }, data: { tarjetaCuentaId: cuentaId } });
      }

      procesados.push(leg.label);
    }
  });

  return NextResponse.json({ procesados, yaConciliados });
}
