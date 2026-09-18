import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoAlguno } from "@/lib/auth";

export const dynamic = "force-dynamic";

const crearCxcSchema = z.object({
  clienteId: z.string(),
  numeroFactura: z.string().optional(),
  montoTotal: z.number().positive(),
  descripcion: z.string().optional(),
  // "credito" (por defecto, compatibilidad con lo existente) deja la
  // factura pendiente en Cuentas por Cobrar, como siempre. "contado"
  // registra el cobro completo en el mismo paso — la factura nace ya
  // pagada, y si se indica cuentaBancariaId, ese ingreso se refleja de
  // inmediato en Flujo de Caja — sin tener que crear la CxC y luego
  // registrar el cobro por separado.
  condicion: z.enum(["contado", "credito"]).default("credito"),
  medioPago: z.string().optional(),
  cuentaBancariaId: z.string().optional(),
  fechaVencimiento: z.string().optional(),
});

// GET /api/empresas/[id]/cuentas-por-cobrar — listado con saldo pendiente.
//
// Acepta "creditos" (Créditos a clientes, empresas de Productos/Mixta) o
// "ventas_diarias" (mismo permiso que da acceso al módulo de Facturación
// en empresas de Servicios — ver /empresas/[id]/ventas-diarias): ambos
// escriben sobre esta misma tabla, solo cambia la pantalla desde la que
// se entra.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoAlguno(usuarioActual.id, empresaId, ["creditos", "ventas_diarias"]);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const cxcs = await prisma.cuentaPorCobrar.findMany({
    where: { empresaId },
    include: { cliente: true, cobros: true },
    orderBy: { fechaEmision: "desc" },
  });

  return NextResponse.json(
    cxcs.map((c) => ({
      id: c.id.toString(),
      // clienteId aparte del nombre: el frontend agrupa las facturas por
      // cliente (pantalla de Créditos) y agrupar por id es confiable ante
      // clientes con el mismo nombre — agrupar por texto no lo era.
      clienteId: c.clienteId.toString(),
      cliente: c.cliente.nombre,
      clienteRuc: c.cliente.docIdentidad,
      numeroFactura: c.numeroFactura,
      descripcion: c.descripcion,
      montoTotal: c.montoTotal.toString(),
      saldoPendiente: c.saldoPendiente.toString(),
      fechaEmision: c.fechaEmision,
      fechaVencimiento: c.fechaVencimiento,
      estado: c.estado,
      cobros: c.cobros.map((p) => ({
        monto: p.monto.toString(),
        fecha: p.fecha,
        medioPago: p.medioPago,
      })),
      // Eliminar esta cuenta por cobrar es una acción reservada al
      // superadmin, y aun para él se bloquea si ya tiene cobros (ver DELETE).
      tieneCobros: c.cobros.length > 0,
    }))
  );
}

// POST /api/empresas/[id]/cuentas-por-cobrar — registra una nueva factura
// a un cliente. Al registrarla se indica si es al contado o al crédito:
//
// - "credito" ("fiado"): se acumula como antes — un mismo cliente puede
//   tener varias filas abiertas si se le da crédito varias veces. Queda
//   pendiente en Cuentas por Cobrar hasta que se le registre un cobro.
// - "contado": se paga en el momento — en el mismo paso se crea la CxC Y
//   su cobro completo, así que nace con saldoPendiente=0 y estado=pagada.
//   Si se indica cuentaBancariaId, ese ingreso genera su movimiento
//   bancario y aparece de inmediato en Flujo de Caja, igual que un cobro
//   manual — sin tener que hacerlo en dos pasos separados.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoAlguno(usuarioActual.id, empresaId, ["creditos", "ventas_diarias"]);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearCxcSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  if (datos.condicion === "contado" && !datos.medioPago) {
    return NextResponse.json({ error: "Indica el medio de pago para una factura al contado" }, { status: 400 });
  }

  const cuentaBancariaId = datos.condicion === "contado" && datos.cuentaBancariaId ? BigInt(datos.cuentaBancariaId) : null;
  const usuarioId = usuarioActual.id;

  const cxc = await prisma.$transaction(async (tx) => {
    const nuevaCxc = await tx.cuentaPorCobrar.create({
      data: {
        empresaId,
        clienteId: BigInt(datos.clienteId),
        numeroFactura: datos.numeroFactura || null,
        montoTotal: datos.montoTotal,
        saldoPendiente: datos.condicion === "contado" ? 0 : datos.montoTotal,
        estado: datos.condicion === "contado" ? "pagada" : "pendiente",
        descripcion: datos.descripcion || null,
        fechaVencimiento: datos.condicion === "credito" && datos.fechaVencimiento ? new Date(datos.fechaVencimiento) : null,
        usuarioId,
      },
      include: { cliente: true },
    });

    if (datos.condicion === "contado") {
      await tx.cobroCxc.create({
        data: {
          cxcId: nuevaCxc.id,
          monto: datos.montoTotal,
          medioPago: datos.medioPago || null,
          cuentaBancariaId,
          usuarioId,
        },
      });

      if (cuentaBancariaId) {
        await tx.movimientoBancario.create({
          data: {
            cuentaBancariaId,
            tipo: "ingreso",
            monto: datos.montoTotal,
            concepto: `Factura al contado — ${nuevaCxc.cliente.nombre}`,
            referenciaTipo: "cobro_cxc",
            referenciaId: nuevaCxc.id,
            usuarioId,
          },
        });
        await tx.cuentaBancaria.update({
          where: { id: cuentaBancariaId },
          data: { saldoActual: { increment: datos.montoTotal } },
        });
      }
    }

    return nuevaCxc;
  });

  await prisma.auditoria.create({
    data: {
      usuarioId,
      empresaId,
      tablaAfectada: "cuentas_por_cobrar",
      registroId: cxc.id,
      accion: "crear",
      valorNuevo: {
        montoTotal: cxc.montoTotal.toString(),
        numeroFactura: datos.numeroFactura ?? null,
        condicion: datos.condicion,
      },
    },
  });

  return NextResponse.json({ id: cxc.id.toString() }, { status: 201 });
}
