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
// plantilla (campo "archivo" en el form-data) y crea los insumos en
// bloque. Cada fila se procesa de forma independiente: si una fila falla
// (ej. falta el costo cuando hay stock inicial), las demás igual se
// procesan — el resultado indica cuántas se crearon y el detalle de las
// que fallaron, con su número de fila.
//
// Si stock_inicial > 0, crea el mismo respaldo de Lote que el ajuste
// manual normal (ver ajuste/route.ts) — así el insumo queda listo para
// Despacho (PEPS) igual que si se hubiera cargado uno por uno.
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

  const [categoriasExistentes, unidadesExistentes, proveedoresExistentes] = await Promise.all([
    prisma.categoriaInsumo.findMany({ where: { empresaId } }),
    prisma.unidadMedida.findMany({ where: { empresaId } }),
    prisma.proveedor.findMany({ where: { empresaId } }),
  ]);
  const categoriaPorNombre = new Map(categoriasExistentes.map((c) => [c.nombre.toLowerCase(), c]));
  const unidadPorNombre = new Map(unidadesExistentes.map((u) => [u.nombre.toLowerCase(), u]));
  const proveedorPorNombre = new Map(proveedoresExistentes.map((p) => [p.nombre.toLowerCase(), p]));

  const errores: { fila: number; motivo: string }[] = [];
  let creados = 0;

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const numeroFila = i + 2; // +2: fila 1 es encabezado, arrays son 0-index

    const nombre = String(fila.nombre ?? "").trim();
    if (!nombre) {
      errores.push({ fila: numeroFila, motivo: "Falta el nombre" });
      continue;
    }
    const stockInicial = Number(fila.stock_inicial) || 0;
    const costoInicial = Number(fila.costo_unitario_inicial) || 0;
    if (stockInicial > 0 && costoInicial <= 0) {
      errores.push({ fila: numeroFila, motivo: `"${nombre}": tiene stock inicial pero no tiene costo unitario inicial` });
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
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

        const insumo = await tx.insumo.create({
          data: {
            empresaId,
            nombre,
            codigo: String(fila.codigo ?? "").trim() || null,
            categoriaId,
            unidadMedidaId,
            stockMinimo: Number(fila.stock_minimo) || 0,
            stockActual: stockInicial,
            costoPromedioActual: stockInicial > 0 ? costoInicial : 0,
            proveedorPreferidoId,
          },
        });

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
      });
      creados++;
    } catch (error) {
      const mensaje = (error as Error).message.includes("Unique constraint")
        ? `"${nombre}": ya existe un insumo con ese código`
        : `"${nombre}": ${(error as Error).message}`;
      errores.push({ fila: numeroFila, motivo: mensaje });
    }
  }

  if (creados > 0) {
    await prisma.auditoria.create({
      data: {
        usuarioId: usuarioActual.id,
        empresaId,
        tablaAfectada: "insumos",
        registroId: empresaId,
        accion: "crear",
        valorNuevo: { accion: "importacion_masiva", creados, errores: errores.length },
      },
    });
  }

  return NextResponse.json({ creados, totalFilas: filas.length, errores });
}
