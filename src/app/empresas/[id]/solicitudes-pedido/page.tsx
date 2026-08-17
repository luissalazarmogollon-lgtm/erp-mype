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
  const [seleccionados, setSeleccionados] = useState<Record<string, number>>({});
  const [busqueda, setBusqueda] = useState("");

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

  function toggleInsumo(insumoId: string, checked: boolean) {
    setError(null);
    setSeleccionados((prev) => {
      const copia = { ...prev };
      if (checked) copia[insumoId] = copia[insumoId] || 1;
      else delete copia[insumoId];
      return copia;
    });
  }

  function actualizarCantidad(insumoId: string, cantidad: number) {
    setSeleccionados((prev) => ({ ...prev, [insumoId]: cantidad }));
  }

  async function handleEnviar() {
    setError(null);
    const items = Object.entries(seleccionados)
      .filter(([, cantidad]) => cantidad > 0)
      .map(([insumoId, cantidad]) => ({ insumoId, cantidad }));
    if (items.length === 0) {
      setError("Marca al menos un insumo antes de enviar.");
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
    setSeleccionados({});
    setBusqueda("");
    setMostrarForm(false);
    cargarSolicitudes(vista);
  }

  const insumosFiltrados = insumos.filter((i) => i.nombre.toLowerCase().includes(busqueda.toLowerCase()));
  const totalSeleccionados = Object.keys(seleccionados).length;

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
                Marca los insumos que necesitas ({totalSeleccionados} seleccionado{totalSeleccionados !== 1 ? "s" : ""})
              </p>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar insumo..."
                style={{ marginBottom: 8 }}
              />
              <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--line)", borderRadius: "var(--radius)" }}>
                {insumosFiltrados.map((i, idx) => {
                  const marcado = i.id in seleccionados;
                  return (
                    <div
                      key={i.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                        borderBottom: idx < insumosFiltrados.length - 1 ? "1px solid var(--line)" : "none",
                        background: marcado ? "var(--paper-card)" : "transparent",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={(e) => toggleInsumo(i.id, e.target.checked)}
                      />
                      <span style={{ fontSize: 13, flex: 1 }}>
                        {i.nombre}
                        <span className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                          {" "}(stock: {Number(i.stockActual).toFixed(2)} {i.unidadMedida ?? ""})
                        </span>
                      </span>
                      {marcado && (
                        <input
                          type="number"
                          step="0.01"
                          value={seleccionados[i.id]}
                          onChange={(e) => actualizarCantidad(i.id, Number(e.target.value))}
                          style={{ width: 80, padding: "4px 6px", fontSize: 13 }}
                        />
                      )}
                    </div>
                  );
                })}
                {insumosFiltrados.length === 0 && (
                  <p style={{ padding: 12, fontSize: 13, color: "var(--ink-soft)" }}>No se encontraron insumos.</p>
                )}
              </div>

              {error && <p className="field error">{error}</p>}
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                <button className="btn-primary" disabled={guardando} onClick={handleEnviar}>
                  {guardando ? "Enviando..." : "Enviar a aprobación"}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setMostrarForm(false);
                    setSeleccionados({});
                    setBusqueda("");
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
