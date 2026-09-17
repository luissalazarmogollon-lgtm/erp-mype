import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/productos/plantilla — genera un Excel para
// cargar Productos en bloque, separado de la plantilla de Insumos (RN
// nueva: el usuario pidió tener ambas plantillas por separado en vez de
// una sola). Trae DOS hojas de datos:
//   - "Productos": un producto por fila (nombre, código, categoría, tipo,
//     precio de venta, si requiere receta).
//   - "Receta": la ficha técnica (RN-020) — una fila por cada insumo que
//     lleva un producto, enlazada al producto de la hoja anterior por
//     nombre o código.
// Más una hoja "Ayuda" con las categorías de producto y los insumos que
// YA EXISTEN en esta empresa, para que el usuario copie los nombres tal
// cual (a diferencia de categoría/proveedor en la plantilla de Insumos,
// el insumo de una receta NO se crea automáticamente si no existe — ver
// nota de diseño en /importar).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "productos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const [categorias, insumos] = await Promise.all([
    prisma.categoriaProducto.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } }),
    prisma.insumo.findMany({ where: { empresaId }, orderBy: { nombre: "asc" } }),
  ]);

  const encabezadosProductos = ["nombre", "codigo", "categoria", "tipo", "precio_venta", "requiere_receta"];
  const filaEjemploProducto = ["Lomo Saltado", "PROD-001", "Platos de fondo", "producto", 28.5, "si"];

  const hojaProductos = XLSX.utils.aoa_to_sheet([encabezadosProductos, filaEjemploProducto]);
  hojaProductos["!cols"] = encabezadosProductos.map(() => ({ wch: 20 }));

  const encabezadosReceta = ["producto_nombre", "producto_codigo", "insumo", "cantidad_requerida", "merma_estandar_pct"];
  const filaEjemploReceta = ["Lomo Saltado", "PROD-001", insumos[0]?.nombre ?? "Carne de res", 0.2, 5];

  const hojaReceta = XLSX.utils.aoa_to_sheet([encabezadosReceta, filaEjemploReceta]);
  hojaReceta["!cols"] = encabezadosReceta.map(() => ({ wch: 20 }));

  const hojaAyuda = XLSX.utils.aoa_to_sheet([
    ["Cómo llenar esta plantilla"],
    [""],
    ["Hoja \"Productos\" — un producto por fila"],
    ["nombre", "Obligatorio."],
    ["codigo", "Opcional, tu código interno. Si un producto tiene receta, ponle código: es lo que lo enlaza con sus filas en la hoja \"Receta\" sin ambigüedad."],
    ["categoria", "Opcional. Si escribes un nombre que no existe, se crea automáticamente."],
    ["tipo", "Obligatorio: escribe exactamente \"producto\" o \"servicio\"."],
    ["precio_venta", "Obligatorio, número (el precio al que se vende)."],
    ["requiere_receta", "Opcional: escribe \"si\" o \"no\". Si pones \"si\", agrega sus insumos en la hoja \"Receta\"."],
    [""],
    ["Hoja \"Receta\" — un insumo por fila (solo para productos con receta)"],
    ["producto_nombre / producto_codigo", "Deben coincidir EXACTO con el nombre o código que pusiste en la hoja \"Productos\" para ese producto. Si el producto tiene código, mejor usa producto_codigo — es más seguro."],
    ["insumo", "Obligatorio. Debe ser el nombre EXACTO de un insumo que ya exista en esta empresa (a diferencia de categoría, un insumo que no exista NO se crea solo — revisa la lista de abajo)."],
    ["cantidad_requerida", "Obligatorio, número (cuánto de ese insumo lleva una unidad del producto)."],
    ["merma_estandar_pct", "Opcional, número de 0 a 100 (% de merma esperada al preparar). Si lo dejas vacío, se usa 0."],
    [""],
    ["Categorías de producto que ya existen en esta empresa:"],
    ...categorias.map((c) => [c.nombre]),
    [""],
    ["Insumos que ya existen en esta empresa (copia el nombre exacto):"],
    ...insumos.map((i) => [i.nombre]),
  ]);
  hojaAyuda["!cols"] = [{ wch: 34 }, { wch: 70 }];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaProductos, "Productos");
  XLSX.utils.book_append_sheet(libro, hojaReceta, "Receta");
  XLSX.utils.book_append_sheet(libro, hojaAyuda, "Ayuda");

  const buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-productos.xlsx"',
    },
  });
}
