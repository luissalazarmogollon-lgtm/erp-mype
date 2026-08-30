import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Esta ruta consulta la base de datos en cada petición.
export const dynamic = "force-dynamic";

// GET /api/tipos-negocio — lista los 3 tipos de negocio (Productos,
// Servicios, Productos y Servicios) para el selector del wizard de alta
// de empresa y para el control de reclasificación en el detalle de empresa.
// Público dentro de la app autenticada, igual que /api/rubros.
export async function GET() {
  const tiposNegocio = await prisma.tipoNegocio.findMany({ orderBy: { id: "asc" } });
  return NextResponse.json(tiposNegocio);
}
