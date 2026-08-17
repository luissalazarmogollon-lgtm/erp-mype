import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/pedidos-compra/[pedidoCompraId]/pdf — genera el PDF
// de la Orden de Compra al vuelo (no se guarda en storage; se regenera cada
// vez que se pide, así siempre refleja el estado más reciente).
export async function GET(
  request: Request,
  { params }: { params: { id: string; pedidoCompraId: string } }
) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId, "compras");
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const pedido = await prisma.pedidoCompra.findFirst({
    where: { id: BigInt(params.pedidoCompraId), empresaId },
    include: {
      proveedor: true,
      empresa: true,
      detalle: { include: { insumo: { include: { unidadMedida: true } } } },
    },
  });
  if (!pedido) return NextResponse.json({ error: "Pedido de compra no encontrado" }, { status: 404 });

  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.on("data", (chunk) => chunks.push(chunk));

  const pdfBuffer: Buffer = await new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    // --- Encabezado ---
    doc.fontSize(18).text("Orden de Compra", { align: "right" });
    doc.fontSize(10).fillColor("#555").text(`N° ${pedido.id}`, { align: "right" });
    doc.text(new Date(pedido.fecha).toLocaleDateString("es-PE"), { align: "right" });
    doc.moveDown(1.5);

    doc.fillColor("#000").fontSize(13).text(pedido.empresa.nombreComercial);
    if (pedido.empresa.ruc) doc.fontSize(9).fillColor("#555").text(`RUC: ${pedido.empresa.ruc}`);
    doc.moveDown(1);

    // --- Proveedor ---
    doc.fillColor("#000").fontSize(11).text("Proveedor", { underline: true });
    doc.fontSize(10).text(pedido.proveedor.nombre);
    if (pedido.proveedor.ruc) doc.text(`RUC: ${pedido.proveedor.ruc}`);
    if (pedido.proveedor.contacto) doc.text(`Contacto: ${pedido.proveedor.contacto}`);
    if (pedido.proveedor.telefono) doc.text(`Teléfono: ${pedido.proveedor.telefono}`);
    doc.moveDown(1.5);

    // --- Tabla de ítems ---
    const colX = { insumo: 50, cantidad: 300, unidad: 370, costo: 430, subtotal: 500 };
    const y0 = doc.y;
    doc.fontSize(9).fillColor("#555");
    doc.text("Insumo", colX.insumo, y0);
    doc.text("Cantidad", colX.cantidad, y0);
    doc.text("Unidad", colX.unidad, y0);
    doc.text("Costo ref.", colX.costo, y0);
    doc.text("Subtotal", colX.subtotal, y0);
    doc.moveTo(50, y0 + 14).lineTo(545, y0 + 14).strokeColor("#ccc").stroke();

    let y = y0 + 22;
    let total = 0;
    doc.fillColor("#000").fontSize(9.5);
    for (const item of pedido.detalle) {
      const cantidad = Number(item.cantidad);
      const costo = Number(item.costoUnitarioEstimado ?? 0);
      const subtotal = cantidad * costo;
      total += subtotal;

      doc.text(item.insumo.nombre, colX.insumo, y, { width: 240 });
      doc.text(cantidad.toFixed(2), colX.cantidad, y);
      doc.text(item.insumo.unidadMedida?.abreviatura ?? "-", colX.unidad, y);
      doc.text(`S/ ${costo.toFixed(4)}`, colX.costo, y);
      doc.text(`S/ ${subtotal.toFixed(2)}`, colX.subtotal, y);
      y += 20;
    }

    doc.moveTo(50, y + 4).lineTo(545, y + 4).strokeColor("#ccc").stroke();
    doc.fontSize(10.5).text(`Total estimado: S/ ${total.toFixed(2)}`, colX.costo, y + 14);

    doc.moveDown(4);
    doc.fontSize(8).fillColor("#888").text(
      "Costos referenciales, sujetos a confirmación con el proveedor. Documento generado automáticamente.",
      50,
      doc.page.height - 80,
      { width: 495 }
    );

    doc.end();
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="orden-compra-${pedido.id}.pdf"`,
    },
  });
}
