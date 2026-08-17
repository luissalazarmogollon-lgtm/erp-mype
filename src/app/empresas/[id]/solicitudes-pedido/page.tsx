"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Solicitud = {
  id: string;
  area: string | null;
  motivo: string | null;
  estado: string;
  fecha: string;
  cantidadItems: number;
};
type Insumo = { id: string; nombre: string; stockActual: string; unidadMedida: string | null };
type AreaOpcion = { id: string; nombre: string };

const ESTADO_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  enviada: { label: "En aprobación", color: "var(--stamp)", bg: "var(--stamp-bg)" },
  aprobada: { label: "Aprobada", color: "var(--teal)", bg: "var(--teal-bg)" },
  rechazada: { label: "Rechazada", color: "var(--alert)", bg: "var(--alert-bg)" },
  borrador: { label: "Borrador", color: "var(--ink-soft)", bg: "var(--paper-card)" },
};

export default function SolicitudesPedidoPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [vista, setVista] = useState<"mias" | "aprobacion" | "despacho">("mias");
  const [puedeAprobar, setPuedeAprobar] = useState(false);
  const [puedeDespachar, setPuedeDespachar] = useState(false);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [areas, setAreas] = useState<AreaOpcion[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [areaId, setAreaId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [items, setItems] = useState<{ insumoId: string; cantidad: number }[]>([]);
  const [insumoActual, setInsumoActual] = useState("");
  const [cantidadActual, setCantidadActual] = useState(1);

  async function cargarAcceso() {
    const res = await fetch(`/api/empresas/${empresaId}/mi-acceso`).then((r) => r.json());
    setPuedeAprobar(res.accesoTotal || res.permisos?.includes("aprobar_solicitudes_pedido"));
    setPuedeDespachar(res.accesoTotal || res.permisos?.includes("despachar_solicitudes_pedido"));
  }

  async function cargarSolicitudes(v: "mias" | "aprobacion" | "despacho") {
    const query = v !== "mias" ? `?vista=${v}` : "";
    const res = await fetch(`/api/empresas/${empresaId}/solicitudes-pedido${query}`).then((r) => r.json());
    setSolicitudes(Array.isArray(res) ? res : []);
  }

  async function cargarCatalogos() {
    const res = await fetch(`/api/empresas/${empresaId}/catalogos`).then((r) => r.json());
    setInsumos(res.insumos ?? []);
    setAreas(res.areas ?? []);
  }

  useEffect(() => {
    cargarAcceso();
    cargarCatalogos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  useEffect(() => {
    cargarSolicitudes(vista);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, vista]);

  function agregarItem() {
    setError(null);
    if (!insumoActual) {
      setError("Elige un insumo.");
      return;
    }
    if (cantidadActual <= 0) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }
    if (items.some((i) => i.insumoId === insumoActual)) {
      setError("Ese insumo ya está en la lista.");
      return;
    }
    setItems([...items, { insumoId: insumoActual, cantidad: cantidadActual }]);
    setInsumoActual("");
    setCantidadActual(1);
  }

  function quitarItem(insumoId: string) {
    setItems(items.filter((i) => i.insumoId !== insumoId));
  }

  async function handleEnviar() {
    setError(null);
    if (items.length === 0) {
      setError("Agrega al menos un ítem antes de enviar.");
      return;
    }
    setGuardando(true);
    const res = await fetch(`/api/empresas/${empresaId}/solicitudes-pedido`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ areaId: areaId || undefined, motivo: motivo || undefined, items }),
    });
    setGuardando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo enviar la solicitud.");
      return;
    }

    setAreaId("");
    setMotivo("");
    setItems([]);
    setMostrarForm(false);
    cargarSolicitudes(vista);
  }

  function nombreInsumo(id: string) {
    return insumos.find((i) => i.id === id)?.nombre ?? id;
  }

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          ← Volver a la empresa
        </Link>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 20 }}>Solicitudes de Pedido</h1>

      {(puedeAprobar || puedeDespachar) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className={vista === "mias" ? "btn-primary" : "btn-ghost"}
              onClick={() => setVista("mias")}
              style={{ fontSize: 13 }}
            >
              Mis solicitudes
            </button>
            {puedeAprobar && (
              <button
                className={vista === "aprobacion" ? "btn-primary" : "btn-ghost"}
                onClick={() => setVista("aprobacion")}
                style={{ fontSize: 13 }}
              >
                Bandeja de aprobación
              </button>
            )}
            {puedeDespachar && (
              <button
                className={vista === "despacho" ? "btn-primary" : "btn-ghost"}
                onClick={() => setVista("despacho")}
                style={{ fontSize: 13 }}
              >
                Bandeja de despacho
              </button>
            )}
          </div>
          {puedeAprobar && (
            <Link href={`/empresas/${empresaId}/solicitudes-pedido/areas`} className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              Gestionar áreas →
            </Link>
          )}
        </div>
      )}

      {vista === "mias" && (
        <div style={{ marginBottom: 20 }}>
          {!mostrarForm ? (
            <button className="btn-primary" onClick={() => setMostrarForm(true)}>
              + Nueva solicitud
            </button>
          ) : (
            <div className="card">
              <p style={{ fontWeight: 500, marginBottom: 14 }}>Nueva solicitud de pedido</p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {areas.length > 0 && (
                  <div className="field">
                    <label>Área (opcional)</label>
                    <select value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                      <option value="">Sin especificar</option>
                      {areas.map((a) => (
                        <option key={a.id} value={a.id}>{a.nombre}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="field">
                  <label>Motivo (opcional)</label>
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: reposición semanal" />
                </div>
              </div>

              <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", margin: "10px 0", textTransform: "uppercase" }}>
                Agregar ítems
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
                <div className="field">
                  <label>Insumo</label>
                  <select value={insumoActual} onChange={(e) => setInsumoActual(e.target.value)}>
                    <option value="">Selecciona...</option>
                    {insumos.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.nombre} (stock: {Number(i.stockActual).toFixed(2)} {i.unidadMedida ?? ""})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Cantidad</label>
                  <input
                    type="number"
                    step="0.01"
                    value={cantidadActual}
                    onChange={(e) => setCantidadActual(Number(e.target.value))}
                  />
                </div>
              </div>
              <button type="button" className="btn-ghost" onClick={agregarItem} style={{ fontSize: 12, padding: "6px 12px" }}>
                + Agregar a la lista
              </button>

              {items.length > 0 && (
                <div style={{ marginTop: 14, marginBottom: 4 }}>
                  {items.map((item) => (
                    <div
                      key={item.insumoId}
                      style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)" }}
                    >
                      <span style={{ fontSize: 13 }}>{nombreInsumo(item.insumoId)}</span>
                      <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span className="mono" style={{ fontSize: 13 }}>{item.cantidad}</span>
                        <button
                          onClick={() => quitarItem(item.insumoId)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-soft)" }}
                        >
                          ×
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {error && <p className="field error">{error}</p>}
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button className="btn-primary" disabled={guardando} onClick={handleEnviar}>
                  {guardando ? "Enviando..." : "Enviar a aprobación"}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setMostrarForm(false);
                    setItems([]);
                    setError(null);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {solicitudes.map((s) => {
          const estado = ESTADO_LABEL[s.estado] ?? ESTADO_LABEL.borrador;
          return (
            <Link
              key={s.id}
              href={`/empresas/${empresaId}/solicitudes-pedido/${s.id}`}
              className="card"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textDecoration: "none", color: "inherit" }}
            >
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>
                  {s.area ?? "Sin área"} {s.motivo ? `· ${s.motivo}` : ""}
                </p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {s.cantidadItems} ítem{s.cantidadItems !== 1 ? "s" : ""} ·{" "}
                  {new Date(s.fecha).toLocaleDateString("es-PE", { timeZone: "UTC" })}
                </p>
              </div>
              <span
                className="mono"
                style={{
                  fontSize: 10.5,
                  textTransform: "uppercase",
                  color: estado.color,
                  background: estado.bg,
                  padding: "4px 10px",
                  borderRadius: "var(--radius)",
                }}
              >
                {estado.label}
              </span>
            </Link>
          );
        })}
        {solicitudes.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
            {vista === "aprobacion" && "No hay solicitudes esperando aprobación."}
            {vista === "despacho" && "No hay ítems esperando despacho."}
            {vista === "mias" && "Todavía no has creado ninguna solicitud."}
          </p>
        )}
      </div>
    </main>
  );
}
