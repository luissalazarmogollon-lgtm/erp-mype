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
  area: string | null;
  motivo: string | null;
  estado: string;
  fecha: string;
  esDueno: boolean;
  puedeAprobar: boolean;
  comentarioAprobador: string | null;
  detalle: DetalleItem[];
};

const ESTADO_ITEM_LABEL: Record<string, string> = {
  pendiente: "Pendiente de decisión",
  eliminado: "Eliminado por el aprobador",
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
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [puedeDespachar, setPuedeDespachar] = useState(false);
  const [seleccionDespacho, setSeleccionDespacho] = useState<Record<string, boolean>>({});
  const [despachando, setDespachando] = useState(false);
  const [errorDespacho, setErrorDespacho] = useState<string | null>(null);

  async function cargarAcceso() {
    const res = await fetch(`/api/empresas/${empresaId}/mi-acceso`).then((r) => r.json());
    setPuedeDespachar(res.accesoTotal || res.permisos?.includes("despachar_solicitudes_pedido"));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, solicitudId]);

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

  if (error && !data) {
    return (
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
        <p>{error}</p>
      </main>
    );
  }
  if (!data) return null;

  const enDecision = data.estado === "enviada" && data.puedeAprobar;

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}/solicitudes-pedido`} style={{ color: "inherit" }}>
          ← Solicitudes de Pedido
        </Link>
      </p>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>{data.area ?? "Sin área"}</h1>
      {data.motivo && <p style={{ color: "var(--ink-soft)", marginBottom: 20 }}>{data.motivo}</p>}

      {data.estado !== "enviada" && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p className="mono" style={{ fontSize: 11, textTransform: "uppercase", color: "var(--ink-soft)" }}>
            Estado: {data.estado}
          </p>
          {data.comentarioAprobador && <p style={{ fontSize: 13, marginTop: 6 }}>{data.comentarioAprobador}</p>}
        </div>
      )}

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
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
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
                {!eliminados[item.id] && (cantidades[item.id] ?? 0) > item.stockDisponible && (
                  <span className="mono" style={{ fontSize: 11, color: "var(--stamp)" }}>
                    {(cantidades[item.id] ?? 0) > item.stockDisponible && item.stockDisponible > 0
                      ? `Se dividirá: ${item.stockDisponible.toFixed(2)} con stock + ${(
                          (cantidades[item.id] ?? 0) - item.stockDisponible
                        ).toFixed(2)} a compra`
                      : "Sin stock — pasará completo a compra"}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {enDecision && (
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
