import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

type FilaProducto = {
  nombre?: string;
  codigo?: string;
  categoria?: string;
  tipo?: string;
  precio_venta?: number | string;
  requiere_receta?: string | boolean;
};

type FilaReceta = {
  producto_nombre?: string;
  producto_codigo?: string;
  insumo?: string;
  cantidad_requerida?: number | string;
  merma_estandar_pct?: number | string;
};

function esAfirmativo(valor: unknown): boolean {
  const texto = String(valor ?? "").trim().toLowerCase();
  return ["si", "sí", "true", "1", "x", "yes"].includes(texto);
}

// POST /api/empresas/[id]/productos/importar — recibe el Excel de la
// plantilla de Productos (campo "archivo" en el form-data, plantilla
// separada de la de Insumos — ver /plantilla) y crea o actualiza los
// productos en bloque, junto con su ficha técnica (receta).
//
// Mismo criterio de "sobrescribir lo existente" que ya tiene la
// importación de Insumos: si una fila de la hoja "Productos" coincide con
// un producto YA EXISTENTE de esta empresa (mismo código, o si no trae
// código, mismo nombre sin distinguir mayúsculas), se ACTUALIZA ese
// producto — se sobrescriben nombre, código, categoría, tipo, precio de
// venta y si requiere receta — en vez de fallar o crear un duplicado.
//
// La receta (hoja "Receta") tiene una regla propia, por ser una lista de
// líneas (uno a muchos) y no un solo valor por producto:
//   - Si el producto NO aparece mencionado en ninguna fila de la hoja
//     "Receta" (o la hoja no existe en el archivo), su ficha técnica NO SE
//     TOCA — así una plantilla que solo trae precios/categorías nuevos no
//     borra por accidente la receta de nadie.
//   - Si el producto SÍ aparece en la hoja "Receta", su ficha técnica se
//     REEMPLAZA por completo con las líneas válidas de esa hoja (se borran
//     las líneas anteriores y se crean las nuevas) — esto es lo que
//     "sobrescribir en su totalidad" significa para una receta.
// A diferencia de categoría/proveedor en Insumos, el insumo de una línea
// de receta NUNCA se crea automáticamente si el nombre no coincide con
// uno existente — un insumo trae stock y costo reales, no se puede
// inventar desde una plantilla; la fila queda como error.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "productos");
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

  const hojaProductos = libro.Sheets["Productos"] ?? libro.Sheets[libro.SheetNames[0]];
  if (!hojaProductos) {
    return NextResponse.json({ error: "No se encontró la hoja 'Productos' en el archivo" }, { status: 400 });
  }
  const filas: FilaProducto[] = XLSX.utils.sheet_to_json(hojaProductos, { defval: "" });

  const hojaReceta = libro.Sheets["Receta"];
  const filasReceta: FilaReceta[] = hojaReceta ? XLSX.utils.sheet_to_json(hojaReceta, { defval: "" }) : [];

  const [categoriasExistentes, insumosExistentes, productosExistentes] = await Promise.all([
    prisma.categoriaProducto.findMany({ where: { empresaId } }),
    prisma.insumo.findMany({ where: { empresaId } }),
    prisma.producto.findMany({ where: { empresaId } }),
  ]);
  const categoriaPorNombre = new Map(categoriasExistentes.map((c) => [c.nombre.toLowerCase(), c]));
  const insumoPorNombre = new Map(insumosExistentes.map((i) => [i.nombre.toLowerCase(), i]));
  // Igual patrón que en insumos/importar/route.ts: primero por código (la
  // clave única real), y si la fila no trae código, por nombre.
  const productoPorCodigo = new Map(
    productosExistentes.filter((p) => p.codigo).map((p) => [p.codigo!.toLowerCase(), p])
  );
  const productoPorNombre = new Map(productosExistentes.map((p) => [p.nombre.toLowerCase(), p]));

  const errores: { fila: number; motivo: string }[] = [];

  // --- Pasada 1: valida y agrupa las líneas de la hoja "Receta" por el
  // producto al que pertenecen (por código si lo trae, si no por nombre).
  // Cada línea se valida de forma independiente; una línea inválida se
  // reporta como error y se descarta, sin bloquear las demás líneas del
  // mismo producto ni el resto del archivo.
  const recetaPorClave = new Map<string, { insumoId: bigint; cantidadRequerida: number; mermaEstandarPct: number }[]>();
  for (let i = 0; i < filasReceta.length; i++) {
    const fila = filasReceta[i];
    const numeroFila = i + 2;
    const productoCodigo = String(fila.producto_codigo ?? "").trim();
    const productoNombre = String(fila.producto_nombre ?? "").trim();
    if (!productoCodigo && !productoNombre) {
      errores.push({ fila: numeroFila, motivo: "(hoja Receta) falta producto_nombre o producto_codigo" });
      continue;
    }
    const clave = productoCodigo ? `codigo:${productoCodigo.toLowerCase()}` : `nombre:${productoNombre.toLowerCase()}`;

    const insumoNombre = String(fila.insumo ?? "").trim();
    if (!insumoNombre) {
      errores.push({ fila: numeroFila, motivo: `(hoja Receta) falta el insumo de "${productoNombre || productoCodigo}"` });
      continue;
    }
    const insumo = insumoPorNombre.get(insumoNombre.toLowerCase());
    if (!insumo) {
      errores.push({
        fila: numeroFila,
        motivo: `(hoja Receta) el insumo "${insumoNombre}" no existe en esta empresa — revísalo en la hoja Ayuda`,
      });
      continue;
    }
    const cantidadRequerida = Number(fila.cantidad_requerida);
    if (!(cantidadRequerida > 0)) {
      errores.push({ fila: numeroFila, motivo: `(hoja Receta) "${insumoNombre}": la cantidad requerida debe ser mayor a 0` });
      continue;
    }
    const mermaEstandarPct = Number(fila.merma_estandar_pct) || 0;

    if (!recetaPorClave.has(clave)) recetaPorClave.set(clave, []);
    recetaPorClave.get(clave)!.push({ insumoId: insumo.id, cantidadRequerida, mermaEstandarPct });
  }

  let creados = 0;
  let actualizados = 0;

  // --- Pasada 2: procesa la hoja "Productos", una fila a la vez. ---
  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const numeroFila = i + 2;

    const nombre = String(fila.nombre ?? "").trim();
    if (!nombre) {
      errores.push({ fila: numeroFila, motivo: "Falta el nombre" });
      continue;
    }
    const codigoLimpio = String(fila.codigo ?? "").trim() || null;
    const tipo = String(fila.tipo ?? "").trim().toLowerCase() || "producto";
    if (tipo !== "producto" && tipo !== "servicio") {
      errores.push({ fila: numeroFila, motivo: `"${nombre}": el tipo debe ser "producto" o "servicio", no "${fila.tipo}"` });
      continue;
    }
    const precioVenta = Number(fila.precio_venta);
    if (!(precioVenta >= 0)) {
      errores.push({ fila: numeroFila, motivo: `"${nombre}": falta el precio de venta` });
      continue;
    }
    const requiereReceta = esAfirmativo(fila.requiere_receta);

    const existente =
      (codigoLimpio ? productoPorCodigo.get(codigoLimpio.toLowerCase()) : undefined) ??
      productoPorNombre.get(nombre.toLowerCase());

    // Las líneas de receta de ESTE producto, si la hoja "Receta" lo
    // menciona (por su código, o si no tiene, por su nombre en esta fila).
    const claveReceta = codigoLimpio ? `codigo:${codigoLimpio.toLowerCase()}` : `nombre:${nombre.toLowerCase()}`;
    const lineasReceta = recetaPorClave.get(claveReceta);
    const tieneRecetaEnArchivo = lineasReceta !== undefined && lineasReceta.length > 0;

    if (!existente && requiereReceta && !tieneRecetaEnArchivo) {
      errores.push({
        fila: numeroFila,
        motivo: `"${nombre}": requiere receta pero no tiene ninguna línea válida en la hoja "Receta"`,
      });
      continue;
    }

    try {
      const resultado = await prisma.$transaction(async (tx) => {
        // Categoría: usa la existente o crea una nueva.
        let categoriaId: bigint | null = null;
        const categoriaNombre = String(fila.categoria ?? "").trim();
        if (categoriaNombre) {
          const categoriaExistente = categoriaPorNombre.get(categoriaNombre.toLowerCase());
          if (categoriaExistente) {
            categoriaId = categoriaExistente.id;
          } else {
            const nueva = await tx.categoriaProducto.create({ data: { empresaId, nombre: categoriaNombre } });
            categoriaPorNombre.set(categoriaNombre.toLowerCase(), nueva);
            categoriaId = nueva.id;
          }
        }

        if (existente) {
          // --- Sobrescribe el producto existente en su totalidad (ficha) ---
          const actualizado = await tx.producto.update({
            where: { id: existente.id },
            data: { nombre, codigo: codigoLimpio, categoriaId, tipo, precioVenta, requiereReceta },
          });
          productoPorNombre.set(actualizado.nombre.toLowerCase(), actualizado);
          if (actualizado.codigo) productoPorCodigo.set(actualizado.codigo.toLowerCase(), actualizado);

          // La receta solo se reemplaza si este producto SÍ aparece en la
          // hoja "Receta" del archivo — si no aparece, se deja tal como
          // estaba (ver nota de diseño arriba).
          if (tieneRecetaEnArchivo) {
            await tx.fichaTecnica.deleteMany({ where: { productoId: existente.id } });
            await tx.fichaTecnica.createMany({
              data: lineasReceta!.map((linea) => ({
                productoId: existente.id,
                insumoId: linea.insumoId,
                cantidadRequerida: linea.cantidadRequerida,
                mermaEstandarPct: linea.mermaEstandarPct,
              })),
            });
          }
          return { accion: "actualizar" as const };
        }

        const nuevoProducto = await tx.producto.create({
          data: { empresaId, nombre, codigo: codigoLimpio, categoriaId, tipo, precioVenta, requiereReceta },
        });
        productoPorNombre.set(nuevoProducto.nombre.toLowerCase(), nuevoProducto);
        if (nuevoProducto.codigo) productoPorCodigo.set(nuevoProducto.codigo.toLowerCase(), nuevoProducto);

        if (requiereReceta && tieneRecetaEnArchivo) {
          await tx.fichaTecnica.createMany({
            data: lineasReceta!.map((linea) => ({
              productoId: nuevoProducto.id,
              insumoId: linea.insumoId,
              cantidadRequerida: linea.cantidadRequerida,
              mermaEstandarPct: linea.mermaEstandarPct,
            })),
          });
        }
        return { accion: "crear" as const };
      });
      if (resultado.accion === "actualizar") actualizados++;
      else creados++;
    } catch (error) {
      const mensaje = (error as Error).message.includes("Unique constraint")
        ? `"${nombre}": ya existe otro producto con ese código`
        : `"${nombre}": ${(error as Error).message}`;
      errores.push({ fila: numeroFila, motivo: mensaje });
    }
  }

  if (creados > 0 || actualizados > 0) {
    await prisma.auditoria.create({
      data: {
        usuarioId: usuarioActual.id,
        empresaId,
        tablaAfectada: "productos",
        registroId: empresaId,
        accion: "crear",
        valorNuevo: { accion: "importacion_masiva", creados, actualizados, errores: errores.length },
      },
    });
  }

  return NextResponse.json({ creados, actualizados, totalFilas: filas.length, errores });
}
