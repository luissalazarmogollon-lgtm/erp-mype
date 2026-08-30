import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Campo por campo (en vez de z.object con .optional() suelto) para que
// una cadena vacía enviada desde un <input> se guarde como NULL y no como
// "" — igual que el resto de formularios opcionales de la app.
const crearClienteSchema = z.object({
  nombre: z.string().min(2, "El nombre comercial es obligatorio"),
  docIdentidad: z.string().optional(),
  telefono: z.string().optional(),
  razonSocial: z.string().optional(),
  representanteLegal: z.string().optional(),
  personaContacto: z.string().optional(),
  direccion: z.string().optional(),
  telefono2: z.string().optional(),
  email: z.string().optional(),
  rubro: z.string().optional(),
  paginaWeb: z.string().optional(),
  instagram: z.string().optional(),
  tiktok: z.string().optional(),
  logoUrl: z.string().optional(),
  estado: z.enum(["activo", "inactivo"]).optional(),
});

function datosOpcionales(datos: z.infer<typeof crearClienteSchema>) {
  return {
    docIdentidad: datos.docIdentidad || null,
    telefono: datos.telefono || null,
    razonSocial: datos.razonSocial || null,
    representanteLegal: datos.representanteLegal || null,
    personaContacto: datos.personaContacto || null,
    direccion: datos.direccion || null,
    telefono2: datos.telefono2 || null,
    email: datos.email || null,
    rubro: datos.rubro || null,
    paginaWeb: datos.paginaWeb || null,
    instagram: datos.instagram || null,
    tiktok: datos.tiktok || null,
    logoUrl: datos.logoUrl || null,
    ...(datos.estado ? { estado: datos.estado } : {}),
  };
}

// GET /api/empresas/[id]/clientes — lista de clientes de esta empresa.
// Por defecto solo trae los activos (así los selectores de Ventas POS y
// Créditos/Facturación no ofrecen un cliente desactivado); el módulo
// Clientes pide ?todos=1 para ver también los inactivos.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const incluirInactivos = searchParams.get("todos") === "1";

  const clientes = await prisma.cliente.findMany({
    where: { empresaId, ...(incluirInactivos ? {} : { estado: "activo" }) },
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json(
    clientes.map((c) => ({
      id: c.id.toString(),
      nombre: c.nombre,
      docIdentidad: c.docIdentidad,
      telefono: c.telefono,
      razonSocial: c.razonSocial,
      representanteLegal: c.representanteLegal,
      personaContacto: c.personaContacto,
      direccion: c.direccion,
      telefono2: c.telefono2,
      email: c.email,
      rubro: c.rubro,
      paginaWeb: c.paginaWeb,
      instagram: c.instagram,
      tiktok: c.tiktok,
      logoUrl: c.logoUrl,
      estado: c.estado,
    }))
  );
}

// POST /api/empresas/[id]/clientes — crea un cliente. El "+ Nuevo cliente"
// rápido de Ventas POS y Créditos/Facturación solo manda nombre (y a
// veces RUC/teléfono); el módulo Clientes manda la ficha completa.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearClienteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });

  const cliente = await prisma.cliente.create({
    data: {
      empresaId,
      nombre: parsed.data.nombre,
      creditoHabilitado: true,
      ...datosOpcionales(parsed.data),
    },
  });

  await prisma.auditoria.create({
    data: {
      usuarioId: usuarioActual.id,
      empresaId,
      tablaAfectada: "clientes",
      registroId: cliente.id,
      accion: "crear",
      valorNuevo: { nombre: cliente.nombre, docIdentidad: cliente.docIdentidad },
    },
  });

  return NextResponse.json({ id: cliente.id.toString(), nombre: cliente.nombre }, { status: 201 });
}
