import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

type FilaPlantilla = {
  nombre_comercial?: string;
  razon_social?: string;
  ruc?: string;
  representante_legal?: string;
  persona_contacto?: string;
  direccion?: string;
  telefono_1?: string | number;
  telefono_2?: string | number;
  email?: string;
  rubro?: string;
  pagina_web?: string;
  instagram?: string;
  tiktok?: string;
  logo_url?: string;
};

// POST /api/empresas/[id]/clientes/importar — recibe el Excel de la
// plantilla (campo "archivo" en el form-data) y crea/actualiza clientes en
// bloque. Cada fila se procesa de forma independiente: si una fila falla,
// las demás igual se procesan. Si ya existe un cliente con el mismo
// nombre_comercial (sin importar mayúsculas), esta fila ACTUALIZA su
// ficha en vez de crear un duplicado — así el mismo archivo sirve tanto
// para la carga inicial como para mantener los datos al día.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const formData = await request.formData();
  const archivo = formData.get("archivo");
  if (!archivo || !(archivo instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo" }, { status: 400 });
  }

  const bytes = await archivo.arrayBuffer();
  let libro: XLSX.WorkBook;
  try {
    libro = XLSX.read(bytes, { type: "array" });
  } catch {
    return NextResponse.json({ error: "El archivo no es un Excel válido" }, { status: 400 });
  }

  const hoja = libro.Sheets["Clientes"] ?? libro.Sheets[libro.SheetNames[0]];
  if (!hoja) return NextResponse.json({ error: "No se encontró la hoja 'Clientes' en el archivo" }, { status: 400 });

  const filas: FilaPlantilla[] = XLSX.utils.sheet_to_json(hoja, { defval: "" });

  const existentes = await prisma.cliente.findMany({ where: { empresaId } });
  const existentePorNombre = new Map(existentes.map((c) => [c.nombre.trim().toLowerCase(), c]));

  const errores: { fila: number; motivo: string }[] = [];
  let creados = 0;
  let actualizados = 0;

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const numeroFila = i + 2; // +2: fila 1 es encabezado, arrays son 0-index

    const nombre = String(fila.nombre_comercial ?? "").trim();
    if (!nombre) {
      errores.push({ fila: numeroFila, motivo: "Falta el nombre_comercial" });
      continue;
    }

    const datos = {
      nombre,
      docIdentidad: String(fila.ruc ?? "").trim() || null,
      razonSocial: String(fila.razon_social ?? "").trim() || null,
      representanteLegal: String(fila.representante_legal ?? "").trim() || null,
      personaContacto: String(fila.persona_contacto ?? "").trim() || null,
      direccion: String(fila.direccion ?? "").trim() || null,
      telefono: String(fila.telefono_1 ?? "").trim() || null,
      telefono2: String(fila.telefono_2 ?? "").trim() || null,
      email: String(fila.email ?? "").trim() || null,
      rubro: String(fila.rubro ?? "").trim() || null,
      paginaWeb: String(fila.pagina_web ?? "").trim() || null,
      instagram: String(fila.instagram ?? "").trim() || null,
      tiktok: String(fila.tiktok ?? "").trim() || null,
      logoUrl: String(fila.logo_url ?? "").trim() || null,
    };

    try {
      const existente = existentePorNombre.get(nombre.toLowerCase());
      if (existente) {
        await prisma.cliente.update({ where: { id: existente.id }, data: datos });
        actualizados++;
      } else {
        const nuevo = await prisma.cliente.create({ data: { empresaId, creditoHabilitado: true, ...datos } });
        existentePorNombre.set(nombre.toLowerCase(), nuevo);
        creados++;
      }
    } catch (error) {
      errores.push({ fila: numeroFila, motivo: `"${nombre}": ${(error as Error).message}` });
    }
  }

  if (creados + actualizados > 0) {
    await prisma.auditoria.create({
      data: {
        usuarioId: usuarioActual.id,
        empresaId,
        tablaAfectada: "clientes",
        registroId: empresaId,
        accion: "crear",
        valorNuevo: { accion: "importacion_masiva", creados, actualizados, errores: errores.length },
      },
    });
  }

  return NextResponse.json({ creados, actualizados, totalFilas: filas.length, errores });
}
