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
  unidad_medida?: string;
  stock_minimo?: number | string;
  stock_inicial?: number | string;
  costo_unitario_inicial?: number | string;
};

// POST /api/empresas/[id]/productos/importar — recibe el Excel de la
// plantilla de Productos (campo "archivo" en el form-data, plantilla
// separada de la de Insumos) y crea o actualiza los productos en bloque.
//
// Producto ya no se construye con una receta/ficha técnica (rediseño del
// módulo: ahora es mercadería comprada ya terminada para revender, con su
// propio stock y costo) — la plantilla se simplificó a una sola hoja, con
// las mismas columnas de stock/costo/unidad que ya tiene la de Insumos.
//
// Mismo criterio de "sobrescribir lo existente" que Insumos: si una fila
// coincide con un producto YA EXISTENTE de esta empresa (mismo código, o
// si no trae código, mismo nombre sin distinguir mayúsculas), se
// ACTUALIZA ese producto — se sobrescriben nombre, código, categoría,
// tipo, precio de venta, unidad de medida y stock mínimo — dejando
// intactos stockActual y costoPromedioActual (esos vienen de "Ajustar
// stock" o de ventas ya registradas, no de la plantilla). Las columnas
// stock_inicial/costo_unitario_inicial se ignoran por completo al
// actualizar un producto existente; solo aplican al crear uno nuevo,
// igual que en Insumos.
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

  const hoja = libro.Sheets["Productos"] ?? libro.Sheets[libro.SheetNames[0]];
  if (!hoja) {
    return NextResponse.json({ error: "No se encontró la hoja 'Productos' en el archivo" }, { status: 400 });
  }
  const filas: FilaProducto[] = XLSX.utils.sheet_to_json(hoja, { defval: "" });

  const [categoriasExistentes, unidadesExistentes, productosExistentes] = await Promise.all([
    prisma.categoriaProducto.findMany({ where: { empresaId } }),
    prisma.unidadMedida.findMany({ where: { empresaId } }),
    prisma.producto.findMany({ where: { empresaId } }),
  ]);
  const categoriaPorNombre = new Map(categoriasExistentes.map((c) => [c.nombre.toLowerCase(), c]));
  const unidadPorNombre = new Map(unidadesExistentes.map((u) => [u.nombre.toLowerCase(), u]));
  // Igual patrón que en insumos/importar/route.ts: primero por código (la
  // clave única real), y si la fila no trae código, por nombre. Se
  // actualizan a medida que se crean/editan productos dentro del loop,
  // para que dos filas de la MISMA plantilla no generen un duplicado
  // entre sí.
  const productoPorCodigo = new Map(
    productosExistentes.filter((p) => p.codigo).map((p) => [p.codigo!.toLowerCase(), p])
  );
  const productoPorNombre = new Map(productosExistentes.map((p) => [p.nombre.toLowerCase(), p]));

  const errores: { fila: number; motivo: string }[] = [];
  let creados = 0;
  let actualizados = 0;

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const numeroFila = i + 2; // +2: fila 1 es encabezado, arrays son 0-index

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

    const existente =
      (codigoLimpio ? productoPorCodigo.get(codigoLimpio.toLowerCase()) : undefined) ??
      productoPorNombre.get(nombre.toLowerCase());

    const stockInicial = Number(fila.stock_inicial) || 0;
    const costoInicial = Number(fila.costo_unitario_inicial) || 0;
    // La validación de "stock inicial sin costo" solo aplica al CREAR un
    // producto nuevo — al sobrescribir uno existente, stock_inicial y
    // costo_unitario_inicial se ignoran por completo (el stock/costo real
    // ya viene de "Ajustar stock" o de ventas ya ocurridas).
    if (!existente && stockInicial > 0 && costoInicial <= 0) {
      errores.push({ fila: numeroFila, motivo: `"${nombre}": tiene stock inicial pero no tiene costo unitario inicial` });
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

        // Unidad de medida: usa la existente o crea una nueva (se comparte
        // el mismo catálogo de unidades que Insumos).
        let unidadMedidaId: bigint | null = null;
        const unidadNombre = String(fila.unidad_medida ?? "").trim();
        if (unidadNombre) {
          const unidadExistente = unidadPorNombre.get(unidadNombre.toLowerCase());
          if (unidadExistente) {
            unidadMedidaId = unidadExistente.id;
          } else {
            const nueva = await tx.unidadMedida.create({
              data: { empresaId, nombre: unidadNombre, abreviatura: unidadNombre.slice(0, 10) },
            });
            unidadPorNombre.set(unidadNombre.toLowerCase(), nueva);
            unidadMedidaId = nueva.id;
          }
        }

        if (existente) {
          // --- Sobrescribe el producto existente en su totalidad (ficha) ---
          // Deliberadamente NO se tocan stockActual ni costoPromedioActual.
          const actualizado = await tx.producto.update({
            where: { id: existente.id },
            data: {
              nombre,
              codigo: codigoLimpio,
              categoriaId,
              tipo,
              precioVenta,
              unidadMedidaId,
              stockMinimo: Number(fila.stock_minimo) || 0,
            },
          });
          productoPorNombre.set(actualizado.nombre.toLowerCase(), actualizado);
          if (actualizado.codigo) productoPorCodigo.set(actualizado.codigo.toLowerCase(), actualizado);
          return { accion: "actualizar" as const };
        }

        const nuevoProducto = await tx.producto.create({
          data: {
            empresaId,
            nombre,
            codigo: codigoLimpio,
            categoriaId,
            tipo,
            precioVenta,
            unidadMedidaId,
            stockMinimo: Number(fila.stock_minimo) || 0,
            stockActual: stockInicial,
            costoPromedioActual: stockInicial > 0 ? costoInicial : 0,
          },
        });
        productoPorNombre.set(nuevoProducto.nombre.toLowerCase(), nuevoProducto);
        if (nuevoProducto.codigo) productoPorCodigo.set(nuevoProducto.codigo.toLowerCase(), nuevoProducto);

        // Respaldo en Lote (igual que el ajuste manual) si trae stock inicial.
        if (stockInicial > 0) {
          const lote = await tx.loteCompra.create({
            data: {
              empresaId,
              productoId: nuevoProducto.id,
              origen: "ajuste_manual",
              cantidadInicial: stockInicial,
              cantidadDisponible: stockInicial,
              costoUnitario: costoInicial,
              referenciaTipo: "importacion_masiva",
            },
          });
          await tx.movimientoInventario.create({
            data: {
              empresaId,
              productoId: nuevoProducto.id,
              tipo: "ajuste_manual",
              cantidad: stockInicial,
              costoUnitario: costoInicial,
              loteId: lote.id,
              usuarioId: usuarioActual.id,
              referenciaTipo: "importacion_masiva",
            },
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
