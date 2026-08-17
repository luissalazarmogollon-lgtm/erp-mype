"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ItemPendiente = {
  detalleId: string;
  insumoId: string;
  insumoNombre: string;
  unidadMedida: string | null;
  cantidad: string;
  costoReferencia: string;
  area: string | null;
  solicitudId: string;
};
type GrupoPendiente = { proveedorId: string | null; proveedorNombre: string; items: ItemPendiente[] };
type PedidoCompra = { id: string; proveedor: string; estado: string; fecha: string; cantidadItems: number };

const ESTADO_OC_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  emitida: { label: "Emitida", color: "var(--stamp)", bg: "var(--stamp-bg)" },
  recibida_parcial: { label: "Recibida parcial", color: "var(--stamp)", bg: "var(--stamp-bg)" },
  recibida: { label: "Recibida", color: "var(--teal)", bg: "var(--teal-bg)" },
  cerrada: { label: "Cerrada", color: "var(--ink-soft)", bg: "var(--paper-card)" },
};

export default function ComprasPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [grupos, setGrupos] = useState<GrupoPendiente[]>([]);
  const [pedidos, setPedidos] = useState<PedidoCompra[]>([]);
  const [seleccion, setSeleccion] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState<string | null>(null);

  async function cargar() {
    const [resPendientes, resPedidos] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/compras/pendientes`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/pedidos-compra`).then((r) => r.json()),
    ]);
    setGrupos(Array.isArray(resPendientes) ? resPendientes : []);
    setPedidos(Array.isArray(resPedidos) ? resPedidos : []);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  function toggle(detalleId: string) {
    setSeleccion({ ...seleccion, [detalleId]: !seleccion[detalleId] });
  }

  async function crearOC(grupo: GrupoPendiente) {
    setError(null);
    if (!grupo.proveedorId) {
      setError("Este grupo no tiene proveedor asignado. Asígnalo en Insumos antes de consolidar.");
      return;
    }
    const detalleIds = grupo.items.filter((i) => seleccion[i.detalleId]).map((i) => i.detalleId);
    if (detalleIds.length === 0) {
      setError("Selecciona al menos un ítem de este proveedor.");
      return;
    }
    setCreando(grupo.proveedorId);
    const res = await fetch(`/api/empresas/${empresaId}/pedidos-compra`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proveedorId: grupo.proveedorId, detalleIds }),
    });
    setCreando(null);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo crear la orden de compra.");
      return;
    }
    setSeleccion({});
    cargar();
  }

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          ← Volver a la empresa
        </Link>
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <h1 style={{ fontSize: 24 }}>Compras</h1>
        <div style={{ display: "flex", gap: 14 }}>
          <Link href={`/empresas/${empresaId}/proveedores`} className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Proveedores →
          </Link>
          <Link href={`/empresas/${empresaId}/alertas-costo`} className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Alertas de costo →
          </Link>
        </div>
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Pendientes de consolidar por proveedor</h2>
      {error && <p className="field error" style={{ marginBottom: 10 }}>{error}</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 32 }}>
        {grupos.map((grupo) => (
          <div key={grupo.proveedorId ?? "sin_proveedor"} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <p style={{ fontWeight: 500, fontSize: 14 }}>
                {grupo.proveedorNombre}
                {!grupo.proveedorId && <span style={{ color: "var(--alert)", fontSize: 11 }}> — asigna proveedor en Insumos</span>}
              </p>
              {grupo.proveedorId && (
                <button
                  className="btn-primary"
                  style={{ fontSize: 12, padding: "6px 12px" }}
                  disabled={creando === grupo.proveedorId}
                  onClick={() => crearOC(grupo)}
                >
                  {creando === grupo.proveedorId ? "Creando..." : "Crear OC con seleccionados"}
                </button>
              )}
            </div>
            {grupo.items.map((item, i) => (
              <label
                key={item.detalleId}
                className="checkbox-row"
                style={{
                  padding: "8px 0", borderTop: i > 0 ? "1px solid var(--line)" : "none",
                  opacity: grupo.proveedorId ? 1 : 0.6,
                }}
              >
                <input
                  type="checkbox"
                  disabled={!grupo.proveedorId}
                  checked={!!seleccion[item.detalleId]}
                  onChange={() => toggle(item.detalleId)}
                />
                <span style={{ fontSize: 13, flex: 1 }}>
                  {item.insumoNombre} — {Number(item.cantidad).toFixed(2)} {item.unidadMedida ?? ""}
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}> · {item.area ?? "Sin área"}</span>
                </span>
              </label>
            ))}
          </div>
        ))}
        {grupos.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>No hay ítems pendientes de compra en este momento.</p>
        )}
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Órdenes de compra</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {pedidos.map((p) => {
          const estado = ESTADO_OC_LABEL[p.estado] ?? ESTADO_OC_LABEL.emitida;
          return (
            <Link
              key={p.id}
              href={`/empresas/${empresaId}/compras/${p.id}`}
              className="card"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none", color: "inherit" }}
            >
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{p.proveedor}</p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {p.cantidadItems} ítem{p.cantidadItems !== 1 ? "s" : ""} · {new Date(p.fecha).toLocaleDateString("es-PE")}
                </p>
              </div>
              <span
                className="mono"
                style={{ fontSize: 10.5, textTransform: "uppercase", color: estado.color, background: estado.bg, padding: "4px 10px", borderRadius: "var(--radius)" }}
              >
                {estado.label}
              </span>
            </Link>
          );
        })}
        {pedidos.length === 0 && <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no se ha emitido ninguna orden de compra.</p>}
      </div>
    </main>
  );
}
