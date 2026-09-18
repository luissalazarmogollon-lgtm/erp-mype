import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { calcularCuentasPorCobrarConsolidado, type CuentaCxCResumen } from "@/lib/reporteCuentasPorCobrar";

export const dynamic = "force-dynamic";

const MARGEN = 50;

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
// consolidadas por cliente — para que la gerencia de esa empresa vea
// claramente cuánto le debe cada cliente en total, con el detalle de sus
// facturas pendientes debajo.
//
// El reporte anterior se armaba dejando que pdfkit partiera clientes y
// facturas a la mitad cuando la página se llenaba, lo que dejaba el PDF
// desordenado (una factura podía quedar cortada entre una página y la
// siguiente, mezclada visualmente con el título). Esta versión reserva el
// espacio exacto de cada bloque ANTES de dibujarlo (`reservarEspacio`) y
// salta de página a propósito cuando no cabe entero, así ningún cliente
// ni ninguna factura queda partido — y agrega numeración de página real
// (con `bufferPages`) en vez de un pie de página que solo aparecía una
// vez.
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
    // bufferPages: sin esto, al volver al final a dibujar el pie de
    // página con "Página X de Y" solo se puede escribir en la ÚLTIMA
    // página — con bufferPages se puede volver a CUALQUIER página ya
    // generada y agregarle el pie, una vez que se sabe cuántas hay en total.
    const doc = new PDFDocument({ size: "A4", margin: MARGEN, bufferPages: true });
    doc.on("data", (chunk) => chunks.push(chunk));

    const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      try {
        const anchoUtil = doc.page.width - MARGEN * 2;
        const limiteInferior = () => doc.page.height - doc.page.margins.bottom;

        // Reserva `altura` puntos verticales antes de imprimir un bloque:
        // si no caben en lo que queda de la página actual, salta a una
        // página nueva ANTES de empezar a escribirlo. Así un cliente o una
        // factura nunca queda cortado a la mitad entre dos páginas.
        function reservarEspacio(altura: number) {
          if (doc.y + altura > limiteInferior()) doc.addPage();
        }

        // --- Encabezado (una sola vez, en la primera página) ---
        doc.fontSize(9).fillColor("#888").text("REPORTE DE CUENTAS POR COBRAR", { width: anchoUtil, align: "right" });
        doc.fontSize(9).fillColor("#888").text(`Generado el ${new Date().toLocaleDateString("es-PE")}`, {
          width: anchoUtil,
          align: "right",
        });
        doc.moveDown(0.6);

        doc.fontSize(17).fillColor("#000").text(empresa.nombreComercial, { width: anchoUtil });
        if (empresa.ruc) doc.fontSize(9.5).fillColor("#666").text(`RUC ${empresa.ruc}`);
        doc.moveDown(0.8);

        // Barra con el total: es el número que la gerencia busca primero,
        // así que va grande y destacado, no mezclado entre párrafos.
        const yBarra = doc.y;
        const altoBarra = 48;
        doc.rect(MARGEN, yBarra, anchoUtil, altoBarra).fill("#fdecea");
        doc
          .fillColor("#c0392b")
          .fontSize(20)
          .text(`S/ ${totalPorCobrar.toFixed(2)}`, MARGEN + 16, yBarra + 9);
        doc
          .fillColor("#c0392b")
          .fontSize(9.5)
          .text(
            `Total pendiente de cobro  ·  ${clientes.length} cliente${clientes.length !== 1 ? "s" : ""} con saldo`,
            MARGEN + 16,
            yBarra + 31
          );
        doc.x = MARGEN;
        doc.y = yBarra + altoBarra + 20;

        if (clientes.length === 0) {
          doc.fontSize(10).fillColor("#555").text("No hay cuentas por cobrar pendientes en esta empresa.");
        } else {
          clientes.forEach((cliente, index) => {
            const pctCliente = totalPorCobrar > 0 ? (cliente.totalCliente / totalPorCobrar) * 100 : 0;
            const nombreCliente = `${index + 1}.  ${cliente.cliente}${cliente.clienteRuc ? `  —  RUC ${cliente.clienteRuc}` : ""}`;
            const totalClienteTexto = `S/ ${cliente.totalCliente.toFixed(2)}`;
            const anchoNombre = anchoUtil - 120;

            doc.fontSize(11.5);
            const altoNombre = doc.heightOfString(nombreCliente, { width: anchoNombre });
            const altoEncabezadoCliente = altoNombre + 16 + 10;

            // Reserva el encabezado del cliente + su primera factura juntos
            // — un cliente nunca debe empezar al fondo de la página con
            // sus facturas quedando solas en la siguiente.
            const primeraCuenta = cliente.cuentas[0];
            const alturaPrimeraFactura = primeraCuenta ? alturaFactura(doc, primeraCuenta, anchoUtil - 18) : 0;
            reservarEspacio(altoEncabezadoCliente + alturaPrimeraFactura);

            if (index > 0) {
              doc
                .moveTo(MARGEN, doc.y)
                .lineTo(MARGEN + anchoUtil, doc.y)
                .strokeColor("#e5e5e5")
                .lineWidth(1)
                .stroke();
              doc.moveDown(0.6);
            }

            const yFila = doc.y;
            doc.fontSize(11.5).fillColor("#000").text(nombreCliente, MARGEN, yFila, { width: anchoNombre });
            doc
              .fontSize(13)
              .fillColor("#c0392b")
              .text(totalClienteTexto, MARGEN, yFila, { width: anchoUtil, align: "right" });
            doc.y = yFila + Math.max(altoNombre, 16);
            doc.x = MARGEN;

            doc
              .fontSize(9.5)
              .fillColor("#888")
              .text(
                `${cliente.cuentas.length} factura${cliente.cuentas.length !== 1 ? "s" : ""} pendiente${
                  cliente.cuentas.length !== 1 ? "s" : ""
                }  ·  ${pctCliente.toFixed(1)}% del total`,
                MARGEN,
                doc.y + 2,
                { width: anchoUtil }
              );
            doc.moveDown(0.7);

            cliente.cuentas.forEach((cuenta) => {
              const anchoDetalle = anchoUtil - 18;
              reservarEspacio(alturaFactura(doc, cuenta, anchoDetalle));

              const vencida = estaVencida(cuenta.fechaVencimiento);
              const lineaFecha = [
                cuenta.numeroFactura ? `Factura ${cuenta.numeroFactura}` : "Sin N° de factura",
                `emitida ${fechaCorta(cuenta.fechaEmision)}`,
                cuenta.fechaVencimiento ? `vence ${fechaCorta(cuenta.fechaVencimiento)}` : null,
              ]
                .filter(Boolean)
                .join("  ·  ");
              const lineaSaldo = `Saldo S/ ${cuenta.saldoPendiente.toFixed(2)} de S/ ${cuenta.montoTotal.toFixed(2)}${
                cuenta.descripcion ? `  —  ${cuenta.descripcion}` : ""
              }`;

              doc
                .fontSize(9.5)
                .fillColor(vencida ? "#c0392b" : "#666")
                .text(lineaFecha + (vencida ? "   ·   VENCIDA" : ""), MARGEN + 18, doc.y, { width: anchoDetalle });
              doc.fontSize(9.5).fillColor("#111").text(lineaSaldo, MARGEN + 18, doc.y + 1, { width: anchoDetalle });
              doc.moveDown(0.55);
            });

            doc.moveDown(0.3);
          });
        }

        // --- Pie de página en TODAS las páginas ya generadas ---
        const totalPaginas = doc.bufferedPageRange().count;
        for (let i = 0; i < totalPaginas; i++) {
          doc.switchToPage(i);
          // El pie va DENTRO del margen inferior de la página (a propósito,
          // para no robarle espacio al contenido) — pero pdfkit trata ese
          // margen como zona prohibida y, si se le escribe ahí sin avisar,
          // entiende que el texto "no cabe" y agrega una página en blanco
          // extra por cada .text() (así se generaron 9 páginas de una de 3
          // en las pruebas). Desactivar el margen inferior de ESTA página
          // antes de dibujar el pie evita ese efecto.
          doc.page.margins.bottom = 0;
          const yPie = doc.page.height - 38;
          doc
            .fontSize(8)
            .fillColor("#999")
            .text("Incluye solo cuentas pendientes o vencidas — las ya cobradas no aparecen aquí.", MARGEN, yPie, {
              width: anchoUtil - 90,
            });
          doc.fontSize(8).fillColor("#999").text(`Página ${i + 1} de ${totalPaginas}`, MARGEN, yPie, {
            width: anchoUtil,
            align: "right",
          });
        }

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

// Altura real (en puntos) que va a ocupar el bloque de una factura —
// calculada con el texto real (una descripción larga puede envolver a 2
// líneas), para que `reservarEspacio` decida bien si hace falta saltar de
// página. Debe llamarse con el mismo fontSize/ancho que se usa al
// imprimir, o el cálculo no coincide con lo dibujado.
function alturaFactura(doc: PDFKit.PDFDocument, cuenta: CuentaCxCResumen, anchoDetalle: number): number {
  const vencida = estaVencida(cuenta.fechaVencimiento);
  const lineaFecha = [
    cuenta.numeroFactura ? `Factura ${cuenta.numeroFactura}` : "Sin N° de factura",
    `emitida ${fechaCorta(cuenta.fechaEmision)}`,
    cuenta.fechaVencimiento ? `vence ${fechaCorta(cuenta.fechaVencimiento)}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");
  const lineaSaldo = `Saldo S/ ${cuenta.saldoPendiente.toFixed(2)} de S/ ${cuenta.montoTotal.toFixed(2)}${
    cuenta.descripcion ? `  —  ${cuenta.descripcion}` : ""
  }`;
  doc.fontSize(9.5);
  const altoFecha = doc.heightOfString(lineaFecha + (vencida ? "   ·   VENCIDA" : ""), { width: anchoDetalle });
  const altoSaldo = doc.heightOfString(lineaSaldo, { width: anchoDetalle });
  return altoFecha + altoSaldo + 1 + 0.55 * 9.5 * 1.2; // + el moveDown(0.55) que sigue
}
