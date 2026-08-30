import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { NATURALEZAS_EGRESO } from "@/lib/naturalezaEgreso";

export const dynamic = "force-dynamic";

const NATURALEZAS_VALIDAS = NATURALEZAS_EGRESO.map((n) => n.value) as [string, ...string[]];

const trasladarSchema = z.object({
  naturaleza: z.enum(NATURALEZAS_VALIDAS),
  categoriaEspecifica: z.string().optional(),
  proveedorNombre: z.string().optional(),
});

// POST /api/empresas/[id]/caja-chica/gastos/[gastoCajaChicaId]/trasladar
//
// El administrador (rol con permiso "gastos") clasifica el gasto chico y
// lo traslada a Gastos y Costos — recién en este momento se crea el Gasto
// real y empieza a afectar el Estado de Resultados. El dinero ya había
// salido de caja cuando se fondeó/repuso la caja chica, así que este
// traslado NO genera un nuevo movimiento bancario (evita contar el
// egreso dos veces) — el Gasto se registra "al contado" sin cuenta
// bancaria asociada, con medioPago "Caja Chica".
export async function POST(
  request: Request,
  { params }: { params: { id: string; gastoCajaChicaId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  let acceso: Awaited<ReturnType<typeof verificarAccesoEmpresa>>;
  try {
    acceso = await verificarAccesoEmpresa(usuarioActual.id, empresaId, "gastos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  // Solo el superadmin o un Asesor pueden clasificar y trasladar — ni
  // siquiera un Asistente, aunque tenga el permiso "gastos" asignado.
  if (acceso.tipoActor !== "superadmin" && acceso.tipoActor !== "asesor") {
    return NextResponse.json(
      { error: "Solo el superadmin o un Asesor pueden clasificar y trasladar gastos de caja chica" },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = trasladarSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  const datos = parsed.data;

  const gastoCajaChicaId = BigInt(params.gastoCajaChicaId);
  const gastoCC = await prisma.gastoCajaChica.findFirst({
    where: { id: gastoCajaChicaId, cajaChica: { empresaId } },
  });
  if (!gastoCC) return NextResponse.json({ error: "Gasto de caja chica no encontrado" }, { status: 404 });
  if (gastoCC.estado === "trasladado") {
    return NextResponse.json({ error: "Este gasto ya fue trasladado a Gastos y Costos" }, { status: 400 });
  }

  const usuarioId = usuarioActual.id;

  const resultado = await prisma.$transaction(async (tx) => {
    const nuevoGasto = await tx.gasto.create({
      data: {
        empresaId,
        naturaleza: datos.naturaleza,
        categoriaEspecifica: datos.categoriaEspecifica || null,
        proveedorNombre: datos.proveedorNombre || null,
        descripcion: `[Caja chica] ${gastoCC.descripcion}`,
        tipoComprobante: gastoCC.tipoComprobante,
        numeroComprobante: gastoCC.numeroComprobante,
        montoTotal: gastoCC.monto,
        fecha: gastoCC.fecha,
        condicion: "contado",
        medioPago: "Caja Chica",
        usuarioId,
      },
    });

    await tx.gastoCajaChica.update({
      where: { id: gastoCajaChicaId },
      data: {
        estado: "trasladado",
        naturaleza: datos.naturaleza,
        categoriaEspecifica: datos.categoriaEspecifica || null,
        gastoId: nuevoGasto.id,
      },
    });

    await tx.auditoria.create({
      data: {
        usuarioId,
        empresaId,
        tablaAfectada: "gastos",
        registroId: nuevoGasto.id,
        accion: "crear",
        valorNuevo: { origen: "caja_chica", descripcion: nuevoGasto.descripcion, montoTotal: nuevoGasto.montoTotal.toString() },
      },
    });

    return nuevoGasto;
  });

  return NextResponse.json({ gastoId: resultado.id.toString() }, { status: 201 });
}
