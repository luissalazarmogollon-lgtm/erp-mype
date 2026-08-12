import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/rubros — usado por el wizard de alta de empresa (HU-01) para
// poblar el selector de rubro. Público dentro de la app autenticada,
// no requiere ser superadmin: cualquiera que esté armando el formulario
// necesita ver las opciones.
export async function GET() {
  const rubros = await prisma.rubro.findMany({
    where: { estado: "activo" },
    include: { tipoNegocioSugerido: true },
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json(rubros);
}
