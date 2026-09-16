import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { calcularCuentasPorCobrarConsolidado, type CuentaCxCResumen } from "@/lib/reporteCuentasPorCobrar";

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

type ClienteAgrupado = {
  clienteId: string;
  cliente: string;
  clienteRuc: string | null;
  totalCliente: number;
  cuentas: CuentaCxCResumen[];
};

// Agrupa la lista plana de cuentas (ordenada por fecha) en un resumen por
// cliente: así la gerencia ve de un vistazo "quién me debe cuánto" y no
// tiene que sumar factura por factura para saber la exposición total de
// cada cliente.
function agruparPorCliente(cuentas: CuentaCxCResumen[]): ClienteAgrupado[] {
  const porCliente = new Map<string, ClienteAgrupado>();
  for (const cuenta of cuentas) {
    if (!porCliente.has(cuenta.clienteId)) {
      porCliente.set(cuenta.clienteId, {
        clienteId: cuenta.clienteId,
        cliente: cuenta.cliente,
        clienteRuc: cuenta.clienteRuc,
        totalCliente: 0,
        cuentas: [],
      });
    }
    const grupo = porCliente.get(cuenta.clienteId)!;
    grupo.totalCliente += cuenta.saldoPendiente;
    grupo.cuentas.push(cuenta);
  }
  // El cliente que más debe primero.
  return Array.from(porCliente.values()).sort((a, b) => b.totalCliente - a.totalCliente);
}

// GET /api/cuentas-por-cobrar/[empresaId]/pdf
//
// PDF de UNA sola empresa con sus Cuentas por Cobrar pendientes,
// consolidadas por cliente (no en orden cronológico plano como el PDF
// consolidado de todas las empresas) — para que la gerencia de esa empresa
// vea claramente cuánto le debe cada cliente en total, con el detalle de
// sus facturas pendientes debajo.
//
// Usa el mismo permiso que la pantalla de Créditos de esa empresa
// ("creditos"): no hace falta ser superadmin, cualquiera con acceso a
// Créditos en ESA empresa puede bajarlo.
export async function GET(request: Request, { params }: { params: { empresaId: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.empresaId);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "creditos");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  try {
    const [empresa, reporte] = await Promise.all([
      prisma.empresa.findUnique({ where: { id: empresaId } }),
      calcularCuentasPorCobrarConsolidado(empresaId),
    ]);
    if (!empresa) return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });

    const empresaData = reporte.empresas[0];
    const totalPorCobrar = empresaData?.totalPorCobrar ?? 0;
    const clientes = agruparPorCliente(empresaData?.cuentas ?? []);

    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.on("data", (chunk) => chunks.push(chunk));

    const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      try {
        // --- Encabezado ---
        doc.fontSize(18).text("Cuentas por Cobrar", { align: "right" });
        doc.fontSize(10).fillColor("#555").text(`Generado el ${new Date().toLocaleDateString("es-PE")}`, { align: "right" });
        doc.moveDown(1.5);

        doc.fillColor("#000").fontSize(14).text(empresa.nombreComercial);
        if (empresa.ruc) doc.fontSize(9).fillColor("#555").text(`RUC: ${empresa.ruc}`);
        doc.moveDown(0.6);
        doc.fontSize(16).fillColor("#c0392b").text(`Total pendiente: S/ ${totalPorCobrar.toFixed(2)}`);
        doc.moveDown(1.2);

        if (clientes.length === 0) {
          doc.fontSize(10).fillColor("#555").text("No hay cuentas por cobrar pendientes en esta empresa.");
        } else {
          doc
            .fontSize(11)
            .fillColor("#000")
            .text(`Detalle por cliente (${clientes.length} cliente${clientes.length !== 1 ? "s" : ""} con saldo pendiente)`, {
              underline: true,
            });
          doc.moveDown(0.5);

          for (const cliente of clientes) {
            doc.moveDown(0.4);
            const pctCliente = totalPorCobrar > 0 ? (cliente.totalCliente / totalPorCobrar) * 100 : 0;
            doc
              .fontSize(11.5)
              .fillColor("#000")
              .text(`${cliente.cliente}${cliente.clienteRuc ? ` — RUC ${cliente.clienteRuc}` : ""}`);
            doc
              .fontSize(10.5)
              .fillColor("#c0392b")
              .text(
                `Debe: S/ ${cliente.totalCliente.toFixed(2)}  (${pctCliente.toFixed(1)}% del total)  —  ${
                  cliente.cuentas.length
                } factura${cliente.cuentas.length !== 1 ? "s" : ""} pendiente${cliente.cuentas.length !== 1 ? "s" : ""}`
              );

            for (const cuenta of cliente.cuentas) {
              const vencida = estaVencida(cuenta.fechaVencimiento);
              const partesFecha = [
                cuenta.numeroFactura ? `Factura ${cuenta.numeroFactura}` : "Sin N° de factura",
                `Emitida ${fechaCorta(cuenta.fechaEmision)}`,
                cuenta.fechaVencimiento ? `Vence ${fechaCorta(cuenta.fechaVencimiento)}${vencida ? " (VENCIDA)" : ""}` : null,
              ].filter(Boolean);
              doc
                .fontSize(9.5)
                .fillColor(vencida ? "#c0392b" : "#555")
                .text(partesFecha.join(" · "), { indent: 14 });
              doc
                .fontSize(9.5)
                .fillColor("#000")
                .text(
                  `Saldo: S/ ${cuenta.saldoPendiente.toFixed(2)} de S/ ${cuenta.montoTotal.toFixed(2)}${
                    cuenta.descripcion ? ` — ${cuenta.descripcion}` : ""
                  }`,
                  { indent: 14 }
                );
            }
          }
        }

        doc.moveDown(2);
        doc.fontSize(8).fillColor("#888").text(
          "Documento generado automáticamente por el sistema. Incluye solo cuentas pendientes o vencidas — las ya cobradas no aparecen aquí.",
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
        "Content-Disposition": `attachment; filename="cuentas-por-cobrar-${nombreArchivo}_${hoyISO()}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generando PDF de Cuentas por Cobrar por empresa:", error);
    return NextResponse.json({ error: `No se pudo generar el PDF: ${(error as Error).message}` }, { status: 500 });
  }
}
