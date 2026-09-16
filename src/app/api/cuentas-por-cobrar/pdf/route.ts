import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { getUsuarioActual, requiereSuperadmin } from "@/lib/auth";
import { calcularCuentasPorCobrarConsolidado } from "@/lib/reporteCuentasPorCobrar";

export const dynamic = "force-dynamic";

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function estaVencida(fechaVencimiento: Date | null) {
  if (!fechaVencimiento) return false;
  return fechaVencimiento.toISOString().slice(0, 10) < hoyISO();
}
function fechaCorta(fecha: Date) {
  return fecha.toLocaleDateString("es-PE", { timeZone: "UTC" });
}

// GET /api/cuentas-por-cobrar/pdf
//
// PDF consolidado (TODAS las empresas) de Cuentas por Cobrar pendientes,
// agrupado por empresa — para descargarlo y enviarlo directo a la alta
// gerencia. Reservado al superadmin, igual que la pantalla y el JSON de
// ./route.ts (cruza información de todas las empresas a la vez).
export async function GET() {
  const usuarioActual = await getUsuarioActual();
  try {
    requiereSuperadmin(usuarioActual);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  try {
    const reporte = await calcularCuentasPorCobrarConsolidado();

    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.on("data", (chunk) => chunks.push(chunk));

    const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      try {
        // --- Portada / resumen ---
        doc.fontSize(18).text("Cuentas por Cobrar — Consolidado", { align: "right" });
        doc.fontSize(10).fillColor("#555").text(`Generado el ${new Date().toLocaleDateString("es-PE")}`, { align: "right" });
        doc.moveDown(1.5);

        doc.fillColor("#000").fontSize(11).text("Total por cobrar (todas las empresas)", { underline: true });
        doc.moveDown(0.2);
        doc.fontSize(20).fillColor("#c0392b").text(`S/ ${reporte.totalPorCobrar.toFixed(2)}`);
        doc.moveDown(1.2);

        if (reporte.empresas.length === 0) {
          doc.fontSize(10).fillColor("#555").text("No hay cuentas por cobrar pendientes en ninguna empresa.");
        } else {
          doc.fillColor("#000").fontSize(11).text("Resumen por empresa", { underline: true });
          doc.moveDown(0.4);
          for (const empresa of reporte.empresas) {
            doc
              .fontSize(10)
              .fillColor("#000")
              .text(
                `${empresa.nombreComercial}: S/ ${empresa.totalPorCobrar.toFixed(2)} — ${empresa.cuentas.length} cuenta${
                  empresa.cuentas.length !== 1 ? "s" : ""
                } pendiente${empresa.cuentas.length !== 1 ? "s" : ""}`
              );
          }

          // --- Detalle por empresa (una empresa nueva por página) ---
          for (const empresa of reporte.empresas) {
            doc.addPage();

            doc.fontSize(15).fillColor("#000").text(empresa.nombreComercial);
            if (empresa.ruc) doc.fontSize(9).fillColor("#555").text(`RUC: ${empresa.ruc}`);
            doc.moveDown(0.3);
            doc
              .fontSize(12)
              .fillColor("#c0392b")
              .text(`Total pendiente: S/ ${empresa.totalPorCobrar.toFixed(2)}`);
            doc.moveDown(1);

            doc.fontSize(11).fillColor("#000").text("Detalle de cuentas pendientes", { underline: true });
            doc.moveDown(0.4);

            for (const cuenta of empresa.cuentas) {
              const vencida = estaVencida(cuenta.fechaVencimiento);
              doc.moveDown(0.3);
              doc
                .fontSize(10)
                .fillColor("#000")
                .text(`${cuenta.cliente}${cuenta.clienteRuc ? ` — RUC ${cuenta.clienteRuc}` : ""}`);
              const partesFecha = [
                cuenta.numeroFactura ? `Factura ${cuenta.numeroFactura}` : null,
                `Emitida ${fechaCorta(cuenta.fechaEmision)}`,
                cuenta.fechaVencimiento ? `Vence ${fechaCorta(cuenta.fechaVencimiento)}${vencida ? " (VENCIDA)" : ""}` : null,
              ].filter(Boolean);
              doc
                .fontSize(9)
                .fillColor(vencida ? "#c0392b" : "#555")
                .text(partesFecha.join(" · "), { indent: 10 });
              doc
                .fontSize(9.5)
                .fillColor("#000")
                .text(
                  `Saldo pendiente: S/ ${cuenta.saldoPendiente.toFixed(2)}  (de un total de S/ ${cuenta.montoTotal.toFixed(2)})`,
                  { indent: 10 }
                );
            }
          }
        }

        doc.end();
      } catch (errorAlArmar) {
        reject(errorAlArmar);
      }
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="cuentas-por-cobrar-consolidado_${hoyISO()}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generando PDF de Cuentas por Cobrar:", error);
    return NextResponse.json({ error: `No se pudo generar el PDF: ${(error as Error).message}` }, { status: 500 });
  }
}
