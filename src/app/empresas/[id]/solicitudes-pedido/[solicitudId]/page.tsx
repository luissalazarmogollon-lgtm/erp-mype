"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type DetalleItem = {
  id: string;
  insumoId: string;
  insumoNombre: string;
  unidadMedida: string | null;
  cantidadSolicitada: string;
  cantidadAprobada: string | null;
  estadoItem: string;
  observacion: string | null;
  stockDisponible: number;
};
type SolicitudDetalle = {
  id: string;
  areaId: string | null;
  area: string | null;
  motivo: string | null;
  estado: string;
  fecha: string;
  esDueno: boolean;
  puedeAprobar: boolean;
  puedeDecidir: boolean;
  comentarioAprobador: string | null;
  detalle: DetalleItem[];
};
type InsumoCatalogo = { id: string; nombre: string; stockActual: string; unidadMedida: string | null };
type AreaOpcion = { id: string; nombre: string };
type Origen = "" | "almacen" | "compra";

const ESTADO_ITEM_LABEL: Record<string, string> = {
  pendiente: "Pendiente de decisión",
  eliminado: "Eliminado (no se compró/despachó)",
  por_despachar: "Con stock — por despachar",
  pendiente_compra: "Sin stock — pasará a compra",
  despachado: "Despachado",
};

export default function SolicitudDetallePage({ params }: { params: { id: string; solicitudId: string } }) {
  const empresaId = params.id;
  const solicitudId = params.solicitudId;
  const router = useRouter();

  const [data, setData] = useState<SolicitudDetalle | null>(null);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [eliminados, setEliminados] = useState<Record<string, boolean>>({});
  const [origenes, setOrigenes] = useState<Record<string, Origen>>({});
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [puedeDespachar, setPuedeDespachar] = useState(false);
  const [seleccionDespacho, setSeleccionDespacho] = useState<Record<string, boolean>>({});
  const [despachando, setDespachando] = useState(false);
  const [errorDespacho, setErrorDespacho] = useState<string | null>(null);

  // --- Editar solicitud (solo el dueño, mientras está "enviada") ---
  const [insumosCatalogo, setInsumosCatalogo] = useState<InsumoCatalogo[]>([]);
  const [areasCatalogo, setAreasCatalogo] = useState<AreaOpcion[]>([]);
  const [editando, setEditando] = useState(false);
  const [editAreaId, setEditAreaId] = useState("");
  const [editMotivo, setEditMotivo] = useState("");
  const [editSeleccionados, setEditSeleccionados] = useState<Record<string, number>>({});
  const [editBusqueda, setEditBusqueda] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  async function cargarAcceso() {
    const res = await fetch(`/api/empresas/${empresaId}/mi-acceso`).then((r) => r.json());
    setPuedeDespachar(res.accesoTotal || res.permisos?.includes("despachar_solicitudes_pedido"));
  }

  async function cargarCatalogos() {
    const res = await fetch(`/api/empresas/${empresaId}/catalogos`).then((r) => r.json());
    setInsumosCatalogo(res.insumos ?? []);
    setAreasCatalogo(res.areas ?? []);
  }

  async function cargar() {
    const res = await fetch(`/api/empresas/${empresaId}/solicitudes-pedido/${solicitudId}`);
    if (!res.ok) {
      setError("No se pudo cargar la solicitud.");
      return;
    }
    const json: SolicitudDetalle = await res.json();
    setData(json);
    const iniciales: Record<string, number> = {};
    const seleccion: Record<string, boolean> = {};
    json.detalle.forEach((d) => {
      iniciales[d.id] = Number(d.cantidadAprobada ?? d.cantidadSolicitada);
      if (d.estadoItem === "por_despachar") seleccion[d.id] = true;
    });
    setCantidades(iniciales);
    setSeleccionDespacho(seleccion);
  }

  useEffect(() => {
    cargar();
    cargarAcceso();
    cargarCatalogos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, solicitudId]);

  function iniciarEdicion() {
    if (!data) return;
    setEditAreaId(data.areaId ?? "");
    setEditMotivo(data.motivo ?? "");
    const iniciales: Record<string, number> = {};
    data.detalle
      .filter((d) => d.estadoItem !== "eliminado")
      .forEach((d) => {
        iniciales[d.insumoId] = Number(d.cantidadSolicitada);
      });
    setEditSeleccionados(iniciales);
    setEditBusqueda("");
    setErrorEdicion(null);
    setEditando(true);
  }

  function toggleEditInsumo(insumoId: string, checked: boolean) {
    setErrorEdicion(null);
    setEditSeleccionados((prev) => {
      const copia = { ...prev };
      if (checked) copia[insumoId] = copia[insumoId] || 1;
      else delete copia[insumoId];
      return copia;
    });
  }

  async function guardarEdicion() {
    setErrorEdicion(null);
    const items = Object.entries(editSeleccionados)
      .filter(([, cantidad]) => cantidad > 0)
      .map(([insumoId, cantidad]) => ({ insumoId, cantidad }));
    if (items.length === 0) {
      setErrorEdicion("Marca al menos un insumo antes de guardar.");
      return;
    }
    setGuardandoEdicion(true);
    const res = await fetch(`/api/empresas/${empresaId}/solicitudes-pedido/${solicitudId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ areaId: editAreaId || null, motivo: editMotivo || null, items }),
    });
    setGuardandoEdicion(false);

    if (!res.ok) {
      const json = await res.json();
      setErrorEdicion(json.error?.toString() ?? "No se pudo guardar la edición.");
      return;
    }
    setEditando(false);
    cargar();
  }

  async function handleDespachar() {
    setErrorDespacho(null);
    const detalleIds = Object.entries(seleccionDespacho)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (detalleIds.length === 0) {
      setErrorDespacho("Selecciona al menos un ítem para despachar.");
      return;
    }
    setDespachando(true);
    const res = await fetch(`/api/empresas/${empresaId}/solicitudes-pedido/${solicitudId}/despachar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detalleIds }),
    });
    setDespachando(false);

    if (!res.ok) {
      const json = await res.json();
      setErrorDespacho(json.error?.toString() ?? "No se pudo despachar.");
      return;
    }
    cargar();
  }

  async function decidir(decision: "aprobar" | "rechazar") {
    setError(null);
    setEnviando(true);

    const items = data!.detalle.map((d) => ({
      detalleId: d.id,
      eliminado: !!eliminados[d.id],
      cantidadAprobada: cantidades[d.id],
      origen: origenes[d.id] || undefined,
    }));

    const res = await fetch(`/api/empresas/${empresaId}/solicitudes-pedido/${solicitudId}/decidir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, comentario: comentario || undefined, items }),
    });

    setEnviando(false);
    if (!res.ok) {
      const json = await res.json();
      setError(json.error?.toString() ?? "No se pudo registrar la decisión.");
      return;
    }
    router.push(`/empresas/${empresaId}/solicitudes-pedido`);
  }

  async function handleEliminar() {
    if (!data) return;
    const advertencia =
      data.estado === "enviada"
        ? "¿Eliminar esta solicitud? No se puede deshacer."
        : "¿Eliminar esta solicitud ya decidida? Se revertirá el stock, el Kardex y cualquier Costo de Venta o compra de mercadería que haya generado (siempre que no tenga pagos ya registrados). No se puede deshacer.";
    if (!confirm(advertencia)) return;

    setErrorEliminar(null);
    setEliminando(true);
    const res = await fetch(`/api/empresas/${empresaId}/solicitudes-pedido/${solicitudId}`, {
      method: "DELETE",
    });
    setEliminando(false);

    if (!res.ok) {
      const json = await res.json();
      setErrorEliminar(json.error?.toString() ?? "No se pudo eliminar la solicitud.");
      return;
    }
    router.push(`/empresas/${empresaId}/solicitudes-pedido`);
  }

  if (error && !data) {
    return (
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
        <p>{error}</p>
      </main>
    );
  }
  if (!data) return null;

  const enDecision = data.estado === "enviada" && data.puedeDecidir;
  const puedeEditar = data.esDueno && data.estado === "enviada";
  // Igual regla que el backend: el encargado de almacén (o acceso total)
  // puede eliminar en cualquier estado; el dueño, solo mientras nadie la
  // haya decidido todavía (nada que revertir).
  const puedeEliminar = data.puedeDecidir || (data.esDueno && data.estado === "enviada");
  const insumosFiltrados = insumosCatalogo.filter((i) =>
    i.nombre.toLowerCase().includes(editBusqueda.toLowerCase())
  );
  const totalEditSeleccionados = Object.keys(editSeleccionados).length;

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}/solicitudes-pedido`} style={{ color: "inherit" }}>
          ← Solicitudes de Pedido
        </Link>
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 4 }}>{data.area ?? "Sin área"}</h1>
          {data.motivo && <p style={{ color: "var(--ink-soft)", marginBottom: 20 }}>{data.motivo}</p>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {puedeEditar && !editando && (
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={iniciarEdicion}>
              Editar solicitud
            </button>
          )}
          {puedeEliminar && !editando && (
            <button
              className="btn-ghost"
              style={{ fontSize: 12, color: "var(--alert)" }}
              disabled={eliminando}
              onClick={handleEliminar}
            >
              {eliminando ? "Eliminando..." : "Eliminar solicitud"}
            </button>
          )}
        </div>
      </div>
      {errorEliminar && <p className="field error" style={{ marginBottom: 12 }}>{errorEliminar}</p>}

      {data.estado !== "enviada" && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p className="mono" style={{ fontSize: 11, textTransform: "uppercase", color: "var(--ink-soft)" }}>
            Estado: {data.estado}
          </p>
          {data.comentarioAprobador && <p style={{ fontSize: 13, marginTop: 6 }}>{data.comentarioAprobador}</p>}
        </div>
      )}

      {editando && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p style={{ fontWeight: 500, marginBottom: 14 }}>Editar solicitud de pedido</p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>Área que solicita{areasCatalogo.length === 0 ? " (opcional)" : ""}</label>
              <select value={editAreaId} onChange={(e) => setEditAreaId(e.target.value)}>
                <option value="">Sin especificar</option>
                {areasCatalogo.map((a) => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Motivo (opcional)</label>
              <input value={editMotivo} onChange={(e) => setEditMotivo(e.target.value)} placeholder="Ej: reposición semanal" />
            </div>
          </div>

          <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", margin: "10px 0", textTransform: "uppercase" }}>
            Marca los insumos que necesitas ({totalEditSeleccionados} seleccionado{totalEditSeleccionados !== 1 ? "s" : ""})
          </p>
          <input
            value={editBusqueda}
            onChange={(e) => setEditBusqueda(e.target.value)}
            placeholder="Buscar insumo..."
            style={{ marginBottom: 8 }}
          />
          <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--line)", borderRadius: "var(--radius)" }}>
            {insumosFiltrados.map((i, idx) => {
              const marcado = i.id in editSeleccionados;
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
                    onChange={(e) => toggleEditInsumo(i.id, e.target.checked)}
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
                      value={editSeleccionados[i.id]}
                      onChange={(e) =>
                        setEditSeleccionados((prev) => ({ ...prev, [i.id]: Number(e.target.value) }))
                      }
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

          {errorEdicion && <p className="field error">{errorEdicion}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn-primary" disabled={guardandoEdicion} onClick={guardarEdicion}>
              {guardandoEdicion ? "Guardando..." : "Guardar cambios"}
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setEditando(false);
                setErrorEdicion(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!editando && (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
          {data.detalle.map((item, i) => (
            <div key={item.id} style={{ padding: 14, borderBottom: i < data.detalle.length - 1 ? "1px solid var(--line)" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500 }}>{item.insumoNombre}</p>
                  <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                    Solicitado: {item.cantidadSolicitada} {item.unidadMedida ?? ""} · Stock disponible:{" "}
                    {item.stockDisponible.toFixed(2)} {item.unidadMedida ?? ""}
                  </p>
                </div>
                {!enDecision && (
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                    {ESTADO_ITEM_LABEL[item.estadoItem] ?? item.estadoItem}
                  </span>
                )}
              </div>

              {puedeDespachar && data.estado === "aprobada" && item.estadoItem === "por_despachar" && (
                <label className="checkbox-row mono" style={{ fontSize: 12, marginTop: 10 }}>
                  <input
                    type="checkbox"
                    checked={!!seleccionDespacho[item.id]}
                    onChange={(e) => setSeleccionDespacho({ ...seleccionDespacho, [item.id]: e.target.checked })}
                  />
                  Despachar {item.cantidadAprobada} {item.unidadMedida ?? ""}
                </label>
              )}

              {enDecision && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div className="field" style={{ margin: 0, width: 140 }}>
                      <label>Cantidad a aprobar</label>
                      <input
                        type="number"
                        step="0.01"
                        disabled={!!eliminados[item.id]}
                        value={cantidades[item.id] ?? 0}
                        onChange={(e) => setCantidades({ ...cantidades, [item.id]: Number(e.target.value) })}
                      />
                    </div>
                    <label className="checkbox-row mono" style={{ fontSize: 12, color: "var(--alert)" }}>
                      <input
                        type="checkbox"
                        checked={!!eliminados[item.id]}
                        onChange={(e) => setEliminados({ ...eliminados, [item.id]: e.target.checked })}
                      />
                      Eliminar ítem
                    </label>
                  </div>

                  {!eliminados[item.id] && (
                    <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                      <span className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", textTransform: "uppercase" }}>
                        Origen:
                      </span>
                      <label className="checkbox-row mono" style={{ fontSize: 12 }}>
                        <input
                          type="radio"
                          name={`origen-${item.id}`}
                          checked={(origenes[item.id] ?? "") === ""}
                          onChange={() => setOrigenes({ ...origenes, [item.id]: "" })}
                        />
                        Automático
                      </label>
                      <label className="checkbox-row mono" style={{ fontSize: 12 }}>
                        <input
                          type="radio"
                          name={`origen-${item.id}`}
                          checked={origenes[item.id] === "almacen"}
                          onChange={() => setOrigenes({ ...origenes, [item.id]: "almacen" })}
                        />
                        Sacar de almacén
                      </label>
                      <label className="checkbox-row mono" style={{ fontSize: 12 }}>
                        <input
                          type="radio"
                          name={`origen-${item.id}`}
                          checked={origenes[item.id] === "compra"}
                          onChange={() => setOrigenes({ ...origenes, [item.id]: "compra" })}
                        />
                        Enviar a comprar
                      </label>
                    </div>
                  )}

                  {!eliminados[item.id] && (origenes[item.id] ?? "") === "" && (cantidades[item.id] ?? 0) > item.stockDisponible && (
                    <span className="mono" style={{ fontSize: 11, color: "var(--stamp)" }}>
                      {(cantidades[item.id] ?? 0) > item.stockDisponible && item.stockDisponible > 0
                        ? `Se dividirá: ${item.stockDisponible.toFixed(2)} con stock + ${(
                            (cantidades[item.id] ?? 0) - item.stockDisponible
                          ).toFixed(2)} a compra`
                        : "Sin stock — pasará completo a compra"}
                    </span>
                  )}
                  {!eliminados[item.id] && origenes[item.id] === "almacen" && (cantidades[item.id] ?? 0) > item.stockDisponible && (
                    <span className="mono" style={{ fontSize: 11, color: "var(--alert)" }}>
                      No hay stock suficiente ({item.stockDisponible.toFixed(2)} disponible) — reduce la cantidad o cambia el
                      origen a &quot;Enviar a comprar&quot;.
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {enDecision && !editando && (
        <div className="card">
          <div className="field">
            <label>Comentario (opcional)</label>
            <input value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Ej: se reduce cantidad por presupuesto" />
          </div>
          {error && <p className="field error">{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-primary" disabled={enviando} onClick={() => decidir("aprobar")}>
              {enviando ? "Guardando..." : "Aprobar"}
            </button>
            <button className="btn-ghost" disabled={enviando} onClick={() => decidir("rechazar")}>
              Rechazar
            </button>
          </div>
        </div>
      )}

      {puedeDespachar && data.estado === "aprobada" && data.detalle.some((d) => d.estadoItem === "por_despachar") && (
        <div className="card">
          <p style={{ fontWeight: 500, marginBottom: 10 }}>Despacho</p>
          <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 10 }}>
            Al despachar se descuenta el stock real de los lotes más antiguos primero (PEPS) y queda registrado en el Kardex.
          </p>
          {errorDespacho && <p className="field error">{errorDespacho}</p>}
          <button className="btn-primary" disabled={despachando} onClick={handleDespachar}>
            {despachando ? "Despachando..." : "Despachar seleccionados"}
          </button>
        </div>
      )}
    </main>
  );
}
