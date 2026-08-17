"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Alerta = {
  id: string;
  insumoNombre: string;
  costoAnterior: string;
  costoNuevo: string;
  variacionPct: string;
  fecha: string;
  estado: string;
};

export default function AlertasCostoPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [umbral, setUmbral] = useState<number | null>(null);
  const [editandoUmbral, setEditandoUmbral] = useState(false);
  const [accesoTotal, setAccesoTotal] = useState(false);

  async function cargar() {
    const res = await fetch(`/api/empresas/${empresaId}/alertas-costo`).then((r) => r.json());
    setAlertas(Array.isArray(res) ? res : []);
  }

  async function cargarAcceso() {
    const res = await fetch(`/api/empresas/${empresaId}/mi-acceso`).then((r) => r.json());
    setAccesoTotal(!!res.accesoTotal);
  }

  useEffect(() => {
    cargar();
    cargarAcceso();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function guardarUmbral() {
    if (umbral === null) return;
    await fetch(`/api/empresas/${empresaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ umbralAlertaAnomaliaPct: umbral }),
    });
    setEditandoUmbral(false);
  }

  async function marcarRevisado(id: string) {
    await fetch(`/api/empresas/${empresaId}/alertas-costo/${id}`, { method: "PATCH" });
    cargar();
  }

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}/compras`} style={{ color: "inherit" }}>
          ← Compras
        </Link>
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h1 style={{ fontSize: 24, marginBottom: 6 }}>Alertas de anomalía de costo</h1>
        {accesoTotal && (
          editandoUmbral ? (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="number"
                step="0.1"
                defaultValue={15}
                style={{ width: 70, padding: "4px 6px", fontSize: 12 }}
                onChange={(e) => setUmbral(Number(e.target.value))}
              />
              <span className="mono" style={{ fontSize: 12 }}>%</span>
              <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={guardarUmbral}>Guardar</button>
            </div>
          ) : (
            <button className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", background: "none", border: "none", cursor: "pointer" }} onClick={() => setEditandoUmbral(true)}>
              Editar umbral
            </button>
          )
        )}
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 20 }}>
        Se genera una alerta cuando el costo de un lote recién recibido varía más del umbral configurado respecto al lote
        anterior del mismo insumo.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {alertas.map((a) => (
          <div key={a.id} className="card" style={{ opacity: a.estado === "revisado" ? 0.55 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{a.insumoNombre}</p>
                <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  S/ {Number(a.costoAnterior).toFixed(4)} → S/ {Number(a.costoNuevo).toFixed(4)} ·{" "}
                  <span style={{ color: "var(--alert)" }}>{Number(a.variacionPct).toFixed(1)}% de variación</span>
                </p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {new Date(a.fecha).toLocaleDateString("es-PE")}
                </p>
              </div>
              {a.estado === "pendiente" && (
                <button className="btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => marcarRevisado(a.id)}>
                  Marcar revisado
                </button>
              )}
            </div>
          </div>
        ))}
        {alertas.length === 0 && <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>No hay alertas de anomalía de costo.</p>}
      </div>
    </main>
  );
}
