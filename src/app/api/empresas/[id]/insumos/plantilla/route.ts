import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/insumos/plantilla — genera un Excel para llenar
// insumos en bloque. Incluye una hoja de referencia con las categorías,
// unidades de medida y proveedores YA EXISTENTES en esta empresa, para que
// el usuario escriba los nombres tal cual están (si escribe uno que no
// existe, /importar lo crea automáticamente).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "insumos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const [categorias, unidades, proveedores] = await Promise.all([
    prisma.categoriaInsumo.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } }),
    prisma.unidadMedida.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } }),
    prisma.proveedor.findMany({ where: { empresaId, estado: "activo" }, orderBy: { nombre: "asc" } }),
  ]);

  const encabezados = [
    "nombre",
    "codigo",
    "categoria",
    "unidad_medida",
    "stock_minimo",
    "stock_inicial",
    "costo_unitario_inicial",
    "proveedor_preferido",
  ];
  const filaEjemplo = ["Harina de trigo", "HAR-001", "Abarrotes", "kg", 5, 20, 4.5, "Molino San Jorge"];

  const hojaInsumos = XLSX.utils.aoa_to_sheet([
    encabezados,
    filaEjemplo,
  ]);
  hojaInsumos["!cols"] = encabezados.map(() => ({ wch: 20 }));

  const hojaAyuda = XLSX.utils.aoa_to_sheet([
    ["Cómo llenar esta plantilla"],
    [""],
    ["nombre", "Obligatorio."],
    ["codigo", "Opcional, tu código interno."],
    ["categoria", "Opcional. Si escribes un nombre que no existe, se crea automáticamente."],
    ["unidad_medida", "Opcional. Escribe el NOMBRE completo (ej. 'kilogramo'), no la abreviatura. Si no existe, se crea con la misma palabra como abreviatura."],
    ["stock_minimo", "Opcional, número. Para la alerta de stock bajo."],
    ["stock_inicial", "Opcional, número. Si pones más de 0, se crea un lote de apertura con ese costo."],
    ["costo_unitario_inicial", "Obligatorio SI pones stock_inicial > 0. Costo por unidad."],
    ["proveedor_preferido", "Opcional. Si escribes un nombre que no existe, se crea automáticamente (sin RUC ni contacto — puedes completarlo después en Proveedores)."],
    [""],
    ["Categorías que ya existen en esta empresa:"],
    ...categorias.map((c) => [c.nombre]),
    [""],
    ["Unidades de medida que ya existen:"],
    ...unidades.map((u) => [`${u.nombre} (${u.abreviatura})`]),
    [""],
    ["Proveedores que ya existen:"],
    ...proveedores.map((p) => [p.nombre]),
  ]);
  hojaAyuda["!cols"] = [{ wch: 30 }, { wch: 70 }];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaInsumos, "Insumos");
  XLSX.utils.book_append_sheet(libro, hojaAyuda, "Ayuda");

  const buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-insumos.xlsx"',
    },
  });
}
