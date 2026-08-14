import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { TIPOS_COMPROBANTE } from "@/lib/tiposComprobante";

export const dynamic = "force-dynamic";

const TIPOS_COMPROBANTE_VALIDOS = TIPOS_COMPROBANTE.map((t) => t.value) as [string, ...string[]];

const registrarGastoSchema = z.object({
  descripcion: z.string().min(2, "Describe brevemente el gasto"),
  monto: z.number().positive(),
  fecha: z.string(), // YYYY-MM-DD
  tipoComprobante: z.enum(TIPOS_COMPROBANTE_VALIDOS).default("sin_comprobante"),
  numeroComprobante: z.string().optional(),
});

// GET /api/empresas/[id]/caja-chica/[cajaChicaId]/gastos
export async function GET(
  request: Request,
  { params }: { params: { id: string; cajaChicaId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "caja_chica");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const cajaChicaId = BigInt(params.cajaChicaId);
  const gastos = await prisma.gastoCajaChica.findMany({
    where: { cajaChicaId },
    orderBy: { fecha: "desc" },
  });

  return NextResponse.json(
    gastos.map((g) => ({
      id: g.id.toString(),
      descripcion: g.descripcion,
      monto: g.monto.toString(),
      fecha: g.fecha,
      tipoComprobante: g.tipoComprobante,
      numeroComprobante: g.numeroComprobante,
      estado: g.estado,
      naturaleza: g.naturaleza,
      categoriaEspecifica: g.categoriaEspecifica,
    }))
  );
}

// POST /api/empresas/[id]/caja-chica/[cajaChicaId]/gastos
// Registra un gasto chico (por quien maneja la caja). Descuenta el fondo
// disponible de la caja, pero NO crea un Gasto todavía — queda "pendiente"
// hasta que el administrador lo clasifique y lo traslade a Gastos y Costos.
export async function POST(
  request: Request,
  { params }: { params: { id: string; cajaChicaId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "caja_chica");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = registrarGastoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const datos = parsed.data;

  const cajaChicaId = BigInt(params.cajaChicaId);
  const caja = await prisma.cajaChica.findFirst({ where: { id: cajaChicaId, empresaId } });
  if (!caja) return NextResponse.json({ error: "Caja chica no encontrada" }, { status: 404 });

  if (datos.monto > Number(caja.montoFondo)) {
    return NextResponse.json(
      { error: `El gasto (${datos.monto}) supera el fondo disponible en caja chica (${caja.montoFondo})` },
      { status: 400 }
    );
  }

  const gasto = await prisma.$transaction(async (tx) => {
    const nuevoGasto = await tx.gastoCajaChica.create({
      data: {
        cajaChicaId,
        descripcion: datos.descripcion,
        monto: datos.monto,
        fecha: new Date(datos.fecha),
        tipoComprobante: datos.tipoComprobante,
        numeroComprobante: datos.numeroComprobante || null,
        usuarioId: usuarioActual.id,
      },
    });

    await tx.cajaChica.update({
      where: { id: cajaChicaId },
      data: { montoFondo: { decrement: datos.monto } },
    });

    return nuevoGasto;
  });

  return NextResponse.json({ id: gasto.id.toString() }, { status: 201 });
}
