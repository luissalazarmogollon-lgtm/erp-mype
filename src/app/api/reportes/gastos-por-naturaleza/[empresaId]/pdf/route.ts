import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { calcularReporteGastosPorNaturaleza, rangoPorDefecto } from "@/lib/reporteGastosPorNaturaleza";

export const dynamic = "force-dynamic";

const fechaRegex = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/reportes/gastos-por-naturaleza/[empresaId]/pdf?desde=...&hasta=...
//
// PDF de UNA sola empresa con su desglose de gastos por naturaleza y
// categoría específica — pensado para descargarlo y enviarlo directo a los
// dueños de esa empresa (no expone nada de las demás empresas).
//
// Usa el mismo permiso que Estado de Resultados: cualquiera con acceso a
// ese módulo en esta empresa (no solo el superadmin) puede bajarlo, porque
// es información de esa empresa puntual, no un consolidado entre varias.
export async function GET(request: Request, { params }: { params: { empresaId: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.empresaId);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "estado_resultados");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const desdeParam = searchParams.get("desde");
  const hastaParam = searchParams.get("hasta");
  const porDefecto = rangoPorDefecto();
  const desde = desdeParam && fechaRegex.test(desdeParam) ? desdeParam : porDefecto.desde;
  const hasta = hastaParam && fechaRegex.test(hastaParam) ? hastaParam : porDefecto.hasta;

  // Todo lo de acá para abajo va en un try/catch propio: a diferencia del
  // resto de rutas de la API (que devuelven JSON y de por sí muestran el
  // error), esta arma un PDF a mano con pdfkit — si algo dentro de eso
  // truena sin este try/catch, Next.js lo muestra como una página blanca
  // de error 500 sin ningún detalle. Con esto, cualquier falla futura se
  // ve como un mensaje de error legible en vez de una pantalla en blanco.
  try {
    const [empresa, reporte] = await Promise.all([
      prisma.empresa.findUnique({ where: { id: empresaId } }),
      calcularReporteGastosPorNaturaleza(desde, hasta, empresaId),
    ]);
    if (!empresa) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

    // Si la empresa no tuvo ningún gasto en el rango, no aparece en
    // reporte.empresas (solo incluye empresas con datos) — se usan valores
    // en cero para que el PDF salga igual, mostrando "sin gastos" en vez de
    // fallar.
    const empresaConDatos = reporte.empresas[0];
    const totalEmpresa = empresaConDatos?.total ?? 0;
    const totalImpactaResultados = empresaConDatos?.totalImpactaResultados ?? 0;
    const totalNoImpactaResultados = empresaConDatos?.totalNoImpactaResultados ?? 0;
    const naturalezas = empresaConDatos?.naturalezas ?? [];

    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.on("data", (chunk) => chunks.push(chunk));

    const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      try {
        // --- Encabezado ---
        doc.fontSize(18).text("Reporte de Gastos por Naturaleza", { align: "right" });
        doc.fontSize(10).fillColor("#555").text(`Período: ${desde} al ${hasta}`, { align: "right" });
        doc.text(`Generado el ${new Date().toLocaleDateString("es-PE")}`, { align: "right" });
        doc.moveDown(1.5);

        doc.fillColor("#000").fontSize(14).text(empresa.nombreComercial);
        if (empresa.ruc) doc.fontSize(9).fillColor("#555").text(`RUC: ${empresa.ruc}`);
        doc.moveDown(1.2);

        // --- Resumen ---
        doc.fillColor("#000").fontSize(11).text("Resumen del período", { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10.5).fillColor("#000").text(`Total gastado: S/ ${totalEmpresa.toFixed(2)}`);
        doc.fillColor("#147a4c").text(`Afecta resultados: S/ ${totalImpactaResultados.toFixed(2)}`);
        doc
          .fillColor("#b8790a")
          .text(`Inversión / pago de deuda / retiro de socios: S/ ${totalNoImpactaResultados.toFixed(2)}`);
        doc.moveDown(1.2);

        if (naturalezas.length === 0) {
          doc.fillColor("#555").fontSize(10).text("No hay gastos registrados en este período.");
        } else {
          doc.fillColor("#000").fontSize(11).text("Detalle por naturaleza y categoría", { underline: true });
          doc.moveDown(0.4);

          for (const naturaleza of naturalezas) {
            const pctNaturaleza = totalEmpresa > 0 ? (naturaleza.total / totalEmpresa) * 100 : 0;
            doc.moveDown(0.3);
            doc
              .fontSize(10.5)
              .fillColor("#000")
              .text(`${naturaleza.label}  —  S/ ${naturaleza.total.toFixed(2)}  (${pctNaturaleza.toFixed(1)}%)`);
            for (const categoria of naturaleza.categorias) {
              const pctCategoria = naturaleza.total > 0 ? (categoria.total / naturaleza.total) * 100 : 0;
              doc
                .fontSize(9.5)
                .fillColor("#555")
                .text(`${categoria.categoria}: S/ ${categoria.total.toFixed(2)} (${pctCategoria.toFixed(1)}%)`, {
                  indent: 14,
                });
            }
          }
        }

        doc.moveDown(2);
        doc.fontSize(8).fillColor("#888").text(
          "Documento generado automáticamente por el sistema. Los montos de inversión, pago de deuda o retiro de " +
            "socios mueven caja pero no se consideran gasto contable en el Estado de Resultados.",
          50,
          doc.page.height - 80,
          { width: 495 }
        );

        doc.end();
      } catch (errorAlArmar) {
        reject(errorAlArmar);
      }
    });

    const nombreArchivo = empresa.nombreComercial.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="gastos-${nombreArchivo}_${desde}_a_${hasta}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generando PDF de gastos por naturaleza:", error);
    return NextResponse.json(
      { error: `No se pudo generar el PDF: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
