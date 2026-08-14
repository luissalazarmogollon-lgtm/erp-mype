import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

const reponerSchema = z.object({
  monto: z.number().positive(),
  cuentaBancariaId: z.string().optional(),
});

// POST /api/empresas/[id]/caja-chica/[cajaChicaId]/reponer
export async function POST(
  request: Request,
  { params }: { params: { id: string; cajaChicaId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "flujo_caja");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = reponerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const datos = parsed.data;

  const cajaChicaId = BigInt(params.cajaChicaId);
  const caja = await prisma.cajaChica.findFirst({ where: { id: cajaChicaId, empresaId } });
  if (!caja) return NextResponse.json({ error: "Caja chica no encontrada" }, { status: 404 });

  const cuentaBancariaId = datos.cuentaBancariaId ? BigInt(datos.cuentaBancariaId) : caja.cuentaBancariaId;
  const usuarioId = usuarioActual.id;

  await prisma.$transaction(async (tx) => {
    await tx.cajaChica.update({
      where: { id: cajaChicaId },
      data: { montoFondo: { increment: datos.monto } },
    });
    await tx.movimientoCajaChica.create({
      data: { cajaChicaId, tipo: "reposicion", monto: datos.monto, usuarioId },
    });

    if (cuentaBancariaId) {
      await tx.movimientoBancario.create({
        data: {
          cuentaBancariaId,
          tipo: "egreso",
          monto: datos.monto,
          concepto: `Reposición caja chica — ${caja.nombre}`,
          referenciaTipo: "caja_chica",
          referenciaId: cajaChicaId,
          usuarioId,
        },
      });
      await tx.cuentaBancaria.update({
        where: { id: cuentaBancariaId },
        data: { saldoActual: { decrement: datos.monto } },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
