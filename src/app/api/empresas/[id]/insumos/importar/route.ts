import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

type FilaPlantilla = {
  nombre?: string;
  codigo?: string;
  categoria?: string;
  unidad_medida?: string;
  stock_minimo?: number | string;
  stock_inicial?: number | string;
  costo_unitario_inicial?: number | string;
  proveedor_preferido?: string;
};

// POST /api/empresas/[id]/insumos/importar — recibe el Excel de la
// plantilla (campo "archivo" en el form-data) y crea o actualiza los
// insumos en bloque. Cada fila se procesa de forma independiente: si una
// fila falla (ej. falta el costo cuando hay stock inicial), las demás
// igual se procesan — el resultado indica cuántas se crearon, cuántas se
// actualizaron, y el detalle de las que fallaron, con su número de fila.
//
// RN nueva: "sobrescribir lo existente en su totalidad" — si la fila
// coincide con un insumo YA EXISTENTE de esta empresa (mismo código, o si
// no trae código, mismo nombre sin distinguir mayúsculas/tildes de caja),
// se ACTUALIZA ese insumo en vez de intentar crear uno nuevo (antes, una
// fila con un código repetido simplemente fallaba con "ya existe un
// insumo con ese código", y una fila con un nombre repetido pero sin
// código creaba un duplicado silencioso). Se sobrescriben todos sus datos
// de ficha — nombre, código, categoría, unidad de medida, stock mínimo y
// proveedor preferido — con lo que traiga la plantilla. Se deja
// intacto el stock actual y el costo promedio del insumo existente: esos
// números vienen de las compras/despachos/ajustes ya ocurridos y la
// plantilla no debe pisarlos por accidente, así que las columnas
// stock_inicial/costo_unitario_inicial se ignoran por completo cuando la
// fila actualiza un insumo existente (solo aplican al crear uno nuevo).
//
// Si stock_inicial > 0 en una fila que SÍ crea un insumo nuevo, se crea el
// mismo respaldo de Lote que el ajuste manual normal (ver ajuste/route.ts)
// — así el insumo queda listo para Despacho (PEPS) igual que si se
// hubiera cargado uno por uno.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "insumos");
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

  const hoja = libro.Sheets["Insumos"] ?? libro.Sheets[libro.SheetNames[0]];
  if (!hoja) return NextResponse.json({ error: "No se encontró la hoja 'Insumos' en el archivo" }, { status: 400 });

  const filas: FilaPlantilla[] = XLSX.utils.sheet_to_json(hoja, { defval: "" });

  const [categoriasExistentes, unidadesExistentes, proveedoresExistentes, insumosExistentes] = await Promise.all([
    prisma.categoriaInsumo.findMany({ where: { empresaId } }),
    prisma.unidadMedida.findMany({ where: { empresaId } }),
    prisma.proveedor.findMany({ where: { empresaId } }),
    prisma.insumo.findMany({ where: { empresaId } }),
  ]);
  const categoriaPorNombre = new Map(categoriasExistentes.map((c) => [c.nombre.toLowerCase(), c]));
  const unidadPorNombre = new Map(unidadesExistentes.map((u) => [u.nombre.toLowerCase(), u]));
  const proveedorPorNombre = new Map(proveedoresExistentes.map((p) => [p.nombre.toLowerCase(), p]));
  // Para detectar si una fila corresponde a un insumo YA EXISTENTE (RN
  // "sobrescribir lo existente"): primero por código (la clave única real
  // en la base de datos), y si la fila no trae código, por nombre. Se
  // actualizan a medida que se crean/editan insumos dentro del loop, para
  // que dos filas de la MISMA plantilla con el mismo nombre/código no
  // generen un duplicado entre sí.
  const insumoPorCodigo = new Map(
    insumosExistentes.filter((i) => i.codigo).map((i) => [i.codigo!.toLowerCase(), i])
  );
  const insumoPorNombre = new Map(insumosExistentes.map((i) => [i.nombre.toLowerCase(), i]));

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
    // Coincide con un insumo ya existente -> se sobrescribe (RN nueva), en
    // vez de intentar crear uno nuevo. Prioridad: código (clave única real)
    // y, si la fila no trae código, nombre.
    const existente =
      (codigoLimpio ? insumoPorCodigo.get(codigoLimpio.toLowerCase()) : undefined) ??
      insumoPorNombre.get(nombre.toLowerCase());

    const stockInicial = Number(fila.stock_inicial) || 0;
    const costoInicial = Number(fila.costo_unitario_inicial) || 0;
    // La validación de "stock inicial sin costo" solo aplica al CREAR un
    // insumo nuevo — al sobrescribir uno existente, stock_inicial y
    // costo_unitario_inicial se ignoran por completo (ver nota de diseño
    // arriba: el stock/costo real ya viene de las operaciones ocurridas).
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
          const existente = categoriaPorNombre.get(categoriaNombre.toLowerCase());
          if (existente) {
            categoriaId = existente.id;
          } else {
            const nueva = await tx.categoriaInsumo.create({ data: { empresaId, nombre: categoriaNombre } });
            categoriaPorNombre.set(categoriaNombre.toLowerCase(), nueva);
            categoriaId = nueva.id;
          }
        }

        // Unidad de medida: usa la existente o crea una nueva (abreviatura = mismo nombre si no existía).
        let unidadMedidaId: bigint | null = null;
        const unidadNombre = String(fila.unidad_medida ?? "").trim();
        if (unidadNombre) {
          const existente = unidadPorNombre.get(unidadNombre.toLowerCase());
          if (existente) {
            unidadMedidaId = existente.id;
          } else {
            const nueva = await tx.unidadMedida.create({
              data: { empresaId, nombre: unidadNombre, abreviatura: unidadNombre.slice(0, 10) },
            });
            unidadPorNombre.set(unidadNombre.toLowerCase(), nueva);
            unidadMedidaId = nueva.id;
          }
        }

        // Proveedor preferido: usa el existente o crea uno nuevo (solo nombre).
        let proveedorPreferidoId: bigint | null = null;
        const proveedorNombre = String(fila.proveedor_preferido ?? "").trim();
        if (proveedorNombre) {
          const existente = proveedorPorNombre.get(proveedorNombre.toLowerCase());
          if (existente) {
            proveedorPreferidoId = existente.id;
          } else {
            const nuevo = await tx.proveedor.create({ data: { empresaId, nombre: proveedorNombre } });
            proveedorPorNombre.set(proveedorNombre.toLowerCase(), nuevo);
            proveedorPreferidoId = nuevo.id;
          }
        }

        if (existente) {
          // --- Sobrescribe el insumo existente en su totalidad (ficha) ---
          // Deliberadamente NO se tocan stockActual ni costoPromedioActual
          // — esos números vienen de compras/despachos/ajustes ya
          // ocurridos, no de la plantilla (ver nota de diseño arriba).
          const actualizado = await tx.insumo.update({
            where: { id: existente.id },
            data: {
              nombre,
              codigo: codigoLimpio,
              categoriaId,
              unidadMedidaId,
              stockMinimo: Number(fila.stock_minimo) || 0,
              proveedorPreferidoId,
            },
          });
          insumoPorNombre.set(actualizado.nombre.toLowerCase(), actualizado);
          if (actualizado.codigo) insumoPorCodigo.set(actualizado.codigo.toLowerCase(), actualizado);
          return { accion: "actualizar" as const };
        }

        const insumo = await tx.insumo.create({
          data: {
            empresaId,
            nombre,
            codigo: codigoLimpio,
            categoriaId,
            unidadMedidaId,
            stockMinimo: Number(fila.stock_minimo) || 0,
            stockActual: stockInicial,
            costoPromedioActual: stockInicial > 0 ? costoInicial : 0,
            proveedorPreferidoId,
          },
        });
        insumoPorNombre.set(insumo.nombre.toLowerCase(), insumo);
        if (insumo.codigo) insumoPorCodigo.set(insumo.codigo.toLowerCase(), insumo);

        // Respaldo en Lote (igual que el ajuste manual) si trae stock inicial.
        if (stockInicial > 0) {
          const lote = await tx.loteCompra.create({
            data: {
              empresaId,
              insumoId: insumo.id,
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
              insumoId: insumo.id,
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
        ? `"${nombre}": ya existe otro insumo con ese código`
        : `"${nombre}": ${(error as Error).message}`;
      errores.push({ fila: numeroFila, motivo: mensaje });
    }
  }

  if (creados > 0 || actualizados > 0) {
    await prisma.auditoria.create({
      data: {
        usuarioId: usuarioActual.id,
        empresaId,
        tablaAfectada: "insumos",
        registroId: empresaId,
        accion: "crear",
        valorNuevo: { accion: "importacion_masiva", creados, actualizados, errores: errores.length },
      },
    });
  }

  return NextResponse.json({ creados, actualizados, totalFilas: filas.length, errores });
}
