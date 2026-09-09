import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

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

  // Para cada método de pago calcula cuánto se ha depositado en total
  // (sumando cada depósito parcial registrado en ConciliacionVentaDiaria)
  // y cuánto falta por depositar. Si el registro es de ANTES de que
  // existieran los depósitos parciales (no tiene filas ahí) pero ya
  // tenía la cuenta antigua asignada (*CuentaId, del sistema de "todo o
  // nada" anterior), se asume depositado al 100% — así no reaparece como
  // pendiente algo que ya se había conciliado.
  function resumenLeg(
    montoRegistrado: number,
    cuentaLegacyId: bigint | null,
    conciliacionesLeg: { monto: unknown; cuentaBancaria: { bancoNombre: string }; fecha: Date }[]
  ) {
    let depositado = conciliacionesLeg.reduce((acc, c) => acc + Number(c.monto), 0);
    if (conciliacionesLeg.length === 0 && cuentaLegacyId !== null) {
      depositado = montoRegistrado;
    }
    const pendiente = Math.max(montoRegistrado - depositado, 0);
    const excedente = Math.max(depositado - montoRegistrado, 0);
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

  return NextResponse.json(
    registros.map((r) => {
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
          efectivo: resumenLeg(Number(r.montoEfectivo), r.efectivoCuentaId, porLeg("efectivo")),
          yape: resumenLeg(Number(r.montoYape), r.yapeCuentaId, porLeg("yape")),
          plin: resumenLeg(Number(r.montoPlin), r.plinCuentaId, porLeg("plin")),
          tarjeta: resumenLeg(Number(r.montoTarjeta), r.tarjetaCuentaId, porLeg("tarjeta")),
        },
      };
    })
  );
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
