import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { calcularResumenLeg } from "@/lib/conciliacionVentaDiaria";

export const dynamic = "force-dynamic";

const registroSchema = z.object({
  localId: z.string().optional(),
  fecha: z.string(), // YYYY-MM-DD
  montoEfectivo: z.number().min(0).default(0),
  montoYape: z.number().min(0).default(0),
  montoPlin: z.number().min(0).default(0),
  montoTarjeta: z.number().min(0).default(0),
  observacion: z.string().optional(),
});

// GET /api/empresas/[id]/ventas-diarias — historial (más recientes primero).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "ventas_diarias");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const registros = await prisma.registroVentaDiaria.findMany({
    where: { empresaId },
    include: {
      local: true,
      efectivoCuenta: true,
      yapeCuenta: true,
      plinCuenta: true,
      tarjetaCuenta: true,
      conciliaciones: { include: { cuentaBancaria: true }, orderBy: { fecha: "asc" } },
    },
    orderBy: { fecha: "desc" },
    take: 90,
  });

  // Resumen para el historial (últimos 90): cuánto se depositó y cuánto
  // falta por depositar de cada método de pago.
  function resumenLegDisplay(
    montoRegistrado: number,
    cuentaLegacyId: bigint | null,
    conciliacionesLeg: { monto: unknown; cuentaBancaria: { bancoNombre: string }; fecha: Date }[]
  ) {
    const { depositado, pendiente, excedente } = calcularResumenLeg(montoRegistrado, cuentaLegacyId, conciliacionesLeg);
    return {
      depositado: depositado.toFixed(2),
      pendiente: pendiente.toFixed(2),
      excedente: excedente > 0.004 ? excedente.toFixed(2) : null,
      depositos: conciliacionesLeg.map((c) => ({
        cuenta: c.cuentaBancaria.bancoNombre,
        monto: Number(c.monto).toFixed(2),
        fecha: c.fecha,
      })),
    };
  }

  // Saldo total pendiente por depositar — a diferencia del historial de
  // arriba (limitado a los últimos 90 registros, para no cargar de más),
  // este total suma TODOS los registros de la empresa, porque un saldo
  // pendiente de hace varios meses sigue siendo dinero que falta llevar
  // al banco y no debe perderse de vista solo porque salió de la lista
  // reciente.
  const registrosParaTotal = await prisma.registroVentaDiaria.findMany({
    where: { empresaId },
    select: {
      montoEfectivo: true,
      montoYape: true,
      montoPlin: true,
      montoTarjeta: true,
      efectivoCuentaId: true,
      yapeCuentaId: true,
      plinCuentaId: true,
      tarjetaCuentaId: true,
      conciliaciones: { select: { leg: true, monto: true } },
    },
  });
  const totalPendiente = registrosParaTotal.reduce((acc, r) => {
    const porLeg = (key: string) => r.conciliaciones.filter((c) => c.leg === key);
    return (
      acc +
      calcularResumenLeg(Number(r.montoEfectivo), r.efectivoCuentaId, porLeg("efectivo")).pendiente +
      calcularResumenLeg(Number(r.montoYape), r.yapeCuentaId, porLeg("yape")).pendiente +
      calcularResumenLeg(Number(r.montoPlin), r.plinCuentaId, porLeg("plin")).pendiente +
      calcularResumenLeg(Number(r.montoTarjeta), r.tarjetaCuentaId, porLeg("tarjeta")).pendiente
    );
  }, 0);

  return NextResponse.json({
    totalPendiente: totalPendiente.toFixed(2),
    registros: registros.map((r) => {
      const porLeg = (key: string) => r.conciliaciones.filter((c) => c.leg === key);
      return {
        id: r.id.toString(),
        local: r.local?.nombre ?? null,
        fecha: r.fecha,
        montoEfectivo: r.montoEfectivo.toString(),
        montoYape: r.montoYape.toString(),
        montoPlin: r.montoPlin.toString(),
        montoTarjeta: r.montoTarjeta.toString(),
        total: (
          Number(r.montoEfectivo) + Number(r.montoYape) + Number(r.montoPlin) + Number(r.montoTarjeta)
        ).toFixed(2),
        observacion: r.observacion,
        conciliacion: {
          efectivo: resumenLegDisplay(Number(r.montoEfectivo), r.efectivoCuentaId, porLeg("efectivo")),
          yape: resumenLegDisplay(Number(r.montoYape), r.yapeCuentaId, porLeg("yape")),
          plin: resumenLegDisplay(Number(r.montoPlin), r.plinCuentaId, porLeg("plin")),
          tarjeta: resumenLegDisplay(Number(r.montoTarjeta), r.tarjetaCuentaId, porLeg("tarjeta")),
        },
      };
    }),
  });
}

// POST /api/empresas/[id]/ventas-diarias — crea o actualiza (upsert) el
// resumen del día. Un registro por empresa+fecha+local: si ya existe para
// esa combinación, se sobreescribe (permite corregir un día sin duplicar).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "ventas_diarias");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = registroSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const localId = datos.localId ? BigInt(datos.localId) : null;
  const fecha = new Date(datos.fecha);

  const datosComunes = {
    montoEfectivo: datos.montoEfectivo,
    montoYape: datos.montoYape,
    montoPlin: datos.montoPlin,
    montoTarjeta: datos.montoTarjeta,
    observacion: datos.observacion || null,
  };

  // Prisma no permite usar `null` dentro de una llave compuesta para
  // upsert (empresaId_fecha_localId), porque en Postgres varios NULL no
  // se consideran "iguales" entre sí para efectos de unicidad. Por eso,
  // cuando no hay local (registro "consolidado"), buscamos manualmente
  // si ya existe un registro para esa fecha y decidimos crear/actualizar.
  let registro;
  if (localId === null) {
    const existente = await prisma.registroVentaDiaria.findFirst({
      where: { empresaId, fecha, localId: null },
    });
    registro = existente
      ? await prisma.registroVentaDiaria.update({ where: { id: existente.id }, data: datosComunes })
      : await prisma.registroVentaDiaria.create({
          data: { empresaId, localId: null, fecha, ...datosComunes, usuarioId: usuarioActual.id },
        });
  } else {
    registro = await prisma.registroVentaDiaria.upsert({
      where: { empresaId_fecha_localId: { empresaId, fecha, localId } },
      update: datosComunes,
      create: { empresaId, localId, fecha, ...datosComunes, usuarioId: usuarioActual.id },
    });
  }

  await prisma.auditoria.create({
    data: {
      usuarioId: usuarioActual.id,
      empresaId,
      tablaAfectada: "registros_venta_diaria",
      registroId: registro.id,
      accion: "crear",
      valorNuevo: { fecha: datos.fecha, total: (datos.montoEfectivo + datos.montoYape + datos.montoPlin + datos.montoTarjeta).toString() },
    },
  });

  return NextResponse.json({ id: registro.id.toString() }, { status: 201 });
}
