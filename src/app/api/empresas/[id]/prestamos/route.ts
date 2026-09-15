import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const prestamoSchema = z.object({
  entidadFinanciera: z.string().min(2, "Indica la entidad financiera o persona que otorga el préstamo"),
  numeroCredito: z.string().optional(),
  montoOriginal: z.number().positive(),
  tasaInteres: z.number().min(0).optional(),
  fecha: z.string(), // YYYY-MM-DD
  cuentaBancariaId: z.string().optional(),
  localId: z.string().optional(),
  observacion: z.string().optional(),
});

// GET /api/empresas/[id]/prestamos
//
// Lista los préstamos de la empresa con su saldo pendiente (se mantiene
// "vivo": cada cuota de capital registrada lo va descontando — ver POST en
// ./[prestamoId]/cuota) y el resumen de lo ya pagado, calculado desde las
// cuotas (Gasto) vinculadas por prestamoId.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "prestamos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const prestamos = await prisma.prestamo.findMany({
    where: { empresaId },
    include: {
      cuentaBancaria: true,
      local: true,
      cuotas: { orderBy: { fecha: "desc" } },
    },
    orderBy: { fecha: "desc" },
  });

  return NextResponse.json(
    prestamos.map((p) => {
      const totalCapitalPagado = p.cuotas
        .filter((c) => c.naturaleza === "deuda")
        .reduce((acc, c) => acc + Number(c.montoTotal), 0);
      const totalInteresPagado = p.cuotas
        .filter((c) => c.naturaleza === "gasto_financiero")
        .reduce((acc, c) => acc + Number(c.montoTotal), 0);
      // Una cuota (fecha) puede haber generado un Gasto de capital y otro
      // de interés por separado — se cuentan las fechas distintas, no las
      // filas, para no mostrar "2 cuotas" cuando en realidad fue una sola.
      const cantidadCuotas = new Set(p.cuotas.map((c) => c.fecha.toISOString().slice(0, 10) + "|" + c.id.toString())).size;

      return {
        id: p.id.toString(),
        entidadFinanciera: p.entidadFinanciera,
        numeroCredito: p.numeroCredito,
        montoOriginal: p.montoOriginal.toString(),
        saldoPendiente: p.saldoPendiente.toString(),
        tasaInteres: p.tasaInteres ? p.tasaInteres.toString() : null,
        fecha: p.fecha,
        cuentaBancariaId: p.cuentaBancariaId ? p.cuentaBancariaId.toString() : null,
        cuentaBancaria: p.cuentaBancaria?.bancoNombre ?? null,
        localId: p.localId ? p.localId.toString() : null,
        local: p.local?.nombre ?? null,
        estado: p.estado,
        observacion: p.observacion,
        totalCapitalPagado: totalCapitalPagado.toFixed(2),
        totalInteresPagado: totalInteresPagado.toFixed(2),
        cantidadCuotas,
        puedeEliminar: p.cuotas.length === 0,
        cuotas: p.cuotas.map((c) => ({
          id: c.id.toString(),
          fecha: c.fecha,
          naturaleza: c.naturaleza,
          montoTotal: c.montoTotal.toString(),
          descripcion: c.descripcion,
        })),
      };
    })
  );
}

// POST /api/empresas/[id]/prestamos
//
// Registra un préstamo recibido: crea el pasivo (saldoPendiente arranca
// igual al monto original) y, si se indica cuenta bancaria, el ingreso
// real a esa cuenta (el desembolso) — reemplaza el uso de "Ajustar saldo"
// para esto, que no dejaba ningún rastro de que ese dinero era deuda.
//
// El desembolso de un préstamo NO pasa por el Estado de Resultados (no es
// venta ni gasto — ver GET en ./route.ts y estado-resultados/route.ts, que
// nunca leen movimientos bancarios como ingreso operativo): es un pasivo
// que se va reduciendo con cada cuota de capital (ver ./[prestamoId]/cuota).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "prestamos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = prestamoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const cuentaBancariaId = datos.cuentaBancariaId ? BigInt(datos.cuentaBancariaId) : null;
  const localId = datos.localId ? BigInt(datos.localId) : null;
  const usuarioId = usuarioActual.id;

  const prestamo = await prisma.$transaction(async (tx) => {
    const nuevoPrestamo = await tx.prestamo.create({
      data: {
        empresaId,
        entidadFinanciera: datos.entidadFinanciera,
        numeroCredito: datos.numeroCredito || null,
        montoOriginal: datos.montoOriginal,
        saldoPendiente: datos.montoOriginal,
        tasaInteres: datos.tasaInteres ?? null,
        fecha: new Date(datos.fecha),
        cuentaBancariaId,
        localId,
        observacion: datos.observacion || null,
        usuarioId,
      },
    });

    if (cuentaBancariaId) {
      await tx.movimientoBancario.create({
        data: {
          cuentaBancariaId,
          tipo: "ingreso",
          monto: datos.montoOriginal,
          concepto: `Préstamo recibido — ${datos.entidadFinanciera}${datos.numeroCredito ? ` N° ${datos.numeroCredito}` : ""}`,
          referenciaTipo: "prestamo",
          referenciaId: nuevoPrestamo.id,
          usuarioId,
        },
      });
      await tx.cuentaBancaria.update({
        where: { id: cuentaBancariaId },
        data: { saldoActual: { increment: datos.montoOriginal } },
      });
    }

    await tx.auditoria.create({
      data: {
        usuarioId,
        empresaId,
        tablaAfectada: "prestamos",
        registroId: nuevoPrestamo.id,
        accion: "crear",
        valorNuevo: {
          entidadFinanciera: datos.entidadFinanciera,
          montoOriginal: datos.montoOriginal.toString(),
        },
      },
    });

    return nuevoPrestamo;
  });

  return NextResponse.json({ id: prestamo.id.toString() }, { status: 201 });
}
