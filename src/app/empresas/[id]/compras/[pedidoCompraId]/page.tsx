"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type DetalleItem = {
  id: string;
  insumoId: string;
  insumoNombre: string;
  unidadMedida: string | null;
  cantidad: string;
  costoUnitarioEstimado: string | null;
  cantidadRecibida: string | null;
  costoUnitarioReal: string | null;
  recibido: boolean;
};
type PedidoDetalle = {
  id: string;
  estado: string;
  fecha: string;
  // Solo "compras" (el comprador) puede fijar/corregir el costo real y
  // eliminar el pedido; quien tenga "recepcionar_compras_almacen" también
  // puede registrar la recepción (cantidades — el costo queda fijo en lo
  // que el comprador ya puso al crear la OC).
  puedeEditarCosto: boolean;
  puedeRecepcionar: boolean;
  puedeEliminar: boolean;
  puedeForzarDespachado: boolean;
  proveedor: { id: string; nombre: string; ruc: string | null; contacto: string | null; telefono: string | null };
  detalle: DetalleItem[];
};

export default function PedidoCompraDetallePage({ params }: { params: { id: string; pedidoCompraId: string } }) {
  const empresaId = params.id;
  const pedidoCompraId = params.pedidoCompraId;
  const router = useRouter();

  const [data, setData] = useState<PedidoDetalle | null>(null);
  const [recepcion, setRecepcion] = useState<Record<string, { cantidad: number; costo: number }>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  async function cargar() {
    const res = await fetch(`/api/empresas/${empresaId}/pedidos-compra/${pedidoCompraId}`);
    if (!res.ok) return;
    const json: PedidoDetalle = await res.json();
    setData(json);
    const iniciales: Record<string, { cantidad: number; costo: number }> = {};
    json.detalle.forEach((d) => {
      if (!d.recibido) {
        iniciales[d.id] = {
          cantidad: Number(d.cantidad),
          costo: Number(d.costoUnitarioEstimado ?? 0),
        };
      }
    });
    setRecepcion(iniciales);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, pedidoCompraId]);

  async function handleRecepcionar() {
    setError(null);
    // Si no puede editar el costo (solo tiene "recepcionar_compras_almacen"),
    // no se manda costoUnitarioReal — el servidor usa el que el comprador
    // ya dejó fijado al crear la orden de compra (defensa en profundidad;
    // aunque se mandara, el servidor lo ignora para esta persona).
    const items = Object.entries(recepcion).map(([detalleId, v]) => ({
      detalleId,
      cantidadRecibida: v.cantidad,
      ...(data?.puedeEditarCosto ? { costoUnitarioReal: v.costo } : {}),
    }));
    if (items.length === 0) {
      setError("No hay ítems pendientes de recepción.");
      return;
    }
    setGuardando(true);
    const res = await fetch(`/api/empresas/${empresaId}/pedidos-compra/${pedidoCompraId}/recepcion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    setGuardando(false);

    if (!res.ok) {
      const json = await res.json();
      setError(json.error?.toString() ?? "No se pudo registrar la recepción.");
      return;
    }
    cargar();
  }

  async function handleEliminar() {
    const advertencia = data?.puedeForzarDespachado
      ? "¿Eliminar este pedido de compra? Se revertirá el stock, el Kardex y la compra de mercadería que haya generado en Cuentas por Pagar (siempre que no tenga pagos ya registrados). Si algún ítem ya fue despachado a un área, también se revertirá ese despacho y el Costo de Venta que generó. No se puede deshacer."
      : "¿Eliminar este pedido de compra? Se revertirá el stock, el Kardex y la compra de mercadería que haya generado en Cuentas por Pagar (siempre que no tenga pagos ya registrados, y que la mercadería no haya sido despachada a un área todavía). No se puede deshacer.";
    if (!confirm(advertencia)) {
      return;
    }
    setErrorEliminar(null);
    setEliminando(true);
    const res = await fetch(`/api/empresas/${empresaId}/pedidos-compra/${pedidoCompraId}`, { method: "DELETE" });
    setEliminando(false);

    if (!res.ok) {
      const json = await res.json();
      setErrorEliminar(json.error?.toString() ?? "No se pudo eliminar el pedido de compra.");
      return;
    }
    router.push(`/empresas/${empresaId}/compras`);
  }

  if (!data) return null;

  const pendientes = data.detalle.filter((d) => !d.recibido);

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}/compras`} style={{ color: "inherit" }}>
          ← Compras
        </Link>
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 4 }}>{data.proveedor.nombre}</h1>
          <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            OC N° {data.id} · {new Date(data.fecha).toLocaleDateString("es-PE")} · {data.estado}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href={`/api/empresas/${empresaId}/pedidos-compra/${pedidoCompraId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost"
            style={{ textDecoration: "none", fontSize: 13 }}
          >
            Descargar PDF
          </a>
          {data.puedeEliminar && (
            <button
              className="btn-ghost"
              style={{ fontSize: 13, color: "var(--alert)" }}
              disabled={eliminando}
              onClick={handleEliminar}
            >
              {eliminando ? "Eliminando..." : "Eliminar pedido"}
            </button>
          )}
        </div>
      </div>
      {errorEliminar && <p className="field error" style={{ marginTop: 10 }}>{errorEliminar}</p>}

      <div className="card" style={{ padding: 0, overflow: "hidden", margin: "20px 0" }}>
        {data.detalle.map((item, i) => (
          <div key={item.id} style={{ padding: 14, borderBottom: i < data.detalle.length - 1 ? "1px solid var(--line)" : "none" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{item.insumoNombre}</p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  Pedido: {Number(item.cantidad).toFixed(2)} {item.unidadMedida ?? ""} · Costo ref.: S/{" "}
                  {Number(item.costoUnitarioEstimado ?? 0).toFixed(4)}
                </p>
              </div>
              {item.recibido && (
                <span className="mono" style={{ fontSize: 11, color: "var(--teal)" }}>
                  Recibido: {Number(item.cantidadRecibida).toFixed(2)} a S/ {Number(item.costoUnitarioReal).toFixed(4)}
                </span>
              )}
            </div>

            {!item.recibido && recepcion[item.id] && (
              <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                <div className="field" style={{ margin: 0, width: 140 }}>
                  <label>Cantidad recibida</label>
                  <input
                    type="number"
                    step="0.01"
                    value={recepcion[item.id].cantidad}
                    onChange={(e) =>
                      setRecepcion({ ...recepcion, [item.id]: { ...recepcion[item.id], cantidad: Number(e.target.value) } })
                    }
                  />
                </div>
                {data.puedeEditarCosto ? (
                  <div className="field" style={{ margin: 0, width: 140 }}>
                    <label>Costo unitario real (S/)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={recepcion[item.id].costo}
                      onChange={(e) =>
                        setRecepcion({ ...recepcion, [item.id]: { ...recepcion[item.id], costo: Number(e.target.value) } })
                      }
                    />
                  </div>
                ) : (
                  <div className="field" style={{ margin: 0, width: 140 }}>
                    <label>Costo unitario (S/)</label>
                    <p className="mono" style={{ fontSize: 13, padding: "8px 0", color: "var(--ink-soft)" }}>
                      {Number(item.costoUnitarioEstimado ?? 0).toFixed(4)} · lo define Compras
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {pendientes.length > 0 && data.puedeRecepcionar && (
        <div className="card">
          <p style={{ fontWeight: 500, marginBottom: 10 }}>Registrar recepción</p>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 10 }}>
            Ajusta la cantidad recibida si difiere de lo pedido{data.puedeEditarCosto ? " (y el costo real, si corresponde)" : ""}.
            Se creará un lote nuevo por cada ítem, se actualizará el inventario (Kardex), y si el costo varía mucho
            respecto al lote anterior se generará una alerta. Además, se generará automáticamente una Cuenta por
            Pagar al proveedor por el valor recibido — como compra de mercadería para almacén (activo, todavía no es
            Costo de Venta) — para que Finanzas la clasifique, le asigne comprobante y la pague desde Cuentas por
            Pagar cuando corresponda.
            {!data.puedeEditarCosto && " El costo unitario ya lo dejó fijado Compras al generar esta orden."}
          </p>
          {error && <p className="field error">{error}</p>}
          <button className="btn-primary" disabled={guardando} onClick={handleRecepcionar}>
            {guardando ? "Registrando..." : "Confirmar recepción"}
          </button>
        </div>
      )}
    </main>
  );
}
