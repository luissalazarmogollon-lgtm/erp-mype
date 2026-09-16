import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getUsuarioActual, requiereSuperadmin } from "@/lib/auth";
import { calcularReporteGastosPorNaturaleza, rangoPorDefecto } from "@/lib/reporteGastosPorNaturaleza";

export const dynamic = "force-dynamic";

const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/reportes/gastos-por-naturaleza/exportar?desde=...&hasta=...
//
// El mismo reporte que la pantalla, pero como Excel para enviarlo a la
// alta gerencia: una hoja "Resumen" con el total por empresa, y una hoja
// por empresa con el detalle de naturaleza → categoría específica.
export async function GET(request: Request) {
  const usuarioActual = await getUsuarioActual();
  try {
    requiereSuperadmin(usuarioActual);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const desdeParam = searchParams.get("desde");
  const hastaParam = searchParams.get("hasta");
  const porDefecto = rangoPorDefecto();
  const desde = desdeParam && fechaRegex.test(desdeParam) ? desdeParam : porDefecto.desde;
  const hasta = hastaParam && fechaRegex.test(hastaParam) ? hastaParam : porDefecto.hasta;

  const reporte = await calcularReporteGastosPorNaturaleza(desde, hasta);

  const libro = XLSX.utils.book_new();

  const filasResumen: (string | number)[][] = [
    ["Reporte de gastos por naturaleza y categoría"],
    [`Período: ${desde} a ${hasta}`],
    [""],
    ["Empresa", "Total gastado", "Afecta resultados", "No afecta resultados (inversión / deuda / retiros)"],
    ...reporte.empresas.map((e) => [e.nombreComercial, e.total, e.totalImpactaResultados, e.totalNoImpactaResultados]),
    [""],
    ["TOTAL GENERAL", reporte.totalGeneral, reporte.totalImpactaResultados, reporte.totalNoImpactaResultados],
  ];
  const hojaResumen = XLSX.utils.aoa_to_sheet(filasResumen);
  hojaResumen["!cols"] = [{ wch: 32 }, { wch: 16 }, { wch: 18 }, { wch: 42 }];
  XLSX.utils.book_append_sheet(libro, hojaResumen, "Resumen");

  // Los nombres de hoja de Excel tienen un límite de 31 caracteres y no
  // admiten ciertos símbolos ( \ / * ? : [ ] ) — se limpian y, si dos
  // empresas quedan con el mismo nombre recortado, se desambiguan.
  const nombresUsados = new Set<string>();
  for (const empresa of reporte.empresas) {
    let nombreHoja = empresa.nombreComercial.replace(/[\\/*?:[\]]/g, "").trim().slice(0, 28) || `Empresa ${empresa.empresaId}`;
    if (nombresUsados.has(nombreHoja)) {
      nombreHoja = `${nombreHoja} ${empresa.empresaId}`.slice(0, 31);
    }
    nombresUsados.add(nombreHoja);

    const filas: (string | number)[][] = [
      [empresa.nombreComercial],
      [`Período: ${desde} a ${hasta}`],
      [""],
      ["Naturaleza", "Categoría específica", "Monto", "% del total de la empresa"],
    ];
    for (const naturaleza of empresa.naturalezas) {
      for (const categoria of naturaleza.categorias) {
        filas.push([
          naturaleza.label,
          categoria.categoria,
          categoria.total,
          empresa.total > 0 ? `${((categoria.total / empresa.total) * 100).toFixed(1)}%` : "0%",
        ]);
      }
      filas.push([
        `Subtotal — ${naturaleza.label}`,
        "",
        naturaleza.total,
        empresa.total > 0 ? `${((naturaleza.total / empresa.total) * 100).toFixed(1)}%` : "0%",
      ]);
      filas.push([""]);
    }
    filas.push(["TOTAL", "", empresa.total, "100%"]);

    const hoja = XLSX.utils.aoa_to_sheet(filas);
    hoja["!cols"] = [{ wch: 30 }, { wch: 34 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(libro, hoja, nombreHoja);
  }

  const buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="gastos-por-naturaleza_${desde}_a_${hasta}.xlsx"`,
    },
  });
}
