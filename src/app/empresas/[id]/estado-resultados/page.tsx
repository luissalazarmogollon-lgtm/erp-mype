"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type EstadoResultados = {
  rango: { desde: string; hasta: string };
  ventas: { porMetodoPago: { efectivo: number; yape: number; plin: number; tarjeta: number }; creditos: number; total: number };
  costoDirecto: number;
  utilidadBruta: number;
  gastoOperativo: number;
  gastoOperativoPorCategoria: Record<string, number>;
  utilidadNeta: number;
  margenNetoPct: number;
};

function inicioMesISO() {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
}
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function EstadoResultadosPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [desde, setDesde] = useState(inicioMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [data, setData] = useState<EstadoResultados | null>(null);
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    setCargando(true);
    const res = await fetch(`/api/empresas/${empresaId}/estado-resultados?desde=${desde}&hasta=${hasta}`);
    const json = await res.json();
    setData(json);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, desde, hasta]);

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>Estado de Resultados</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Estado de Resultados</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 20 }}>
        Se calcula en tiempo real sumando lo que ya registraste — sin esperar a un cierre de mes.
      </p>

      <div className="card" style={{ marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0, flex: 1 }}>
          <label>Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0, flex: 1 }}>
          <label>Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>

      {cargando || !data ? (
        <p style={{ color: "var(--ink-soft)" }}>Calculando...</p>
      ) : (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
            <span>Ventas totales</span>
            <span className="mono" style={{ fontWeight: 500 }}>S/ {data.ventas.total.toFixed(2)}</span>
          </div>
          <div style={{ paddingLeft: 12, marginBottom: 8 }}>
            <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
              Efectivo S/{data.ventas.porMetodoPago.efectivo.toFixed(2)} · Yape S/{data.ventas.porMetodoPago.yape.toFixed(2)} · Plin S/{data.ventas.porMetodoPago.plin.toFixed(2)} · Tarjeta S/{data.ventas.porMetodoPago.tarjeta.toFixed(2)}
            </p>
            <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
              Créditos otorgados en el período: S/ {data.ventas.creditos.toFixed(2)}
            </p>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
            <span>(−) Costo directo</span>
            <span className="mono" style={{ color: "var(--alert)" }}>S/ {data.costoDirecto.toFixed(2)}</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "2px solid var(--ink)", fontWeight: 500 }}>
            <span>Utilidad bruta</span>
            <span className="mono">S/ {data.utilidadBruta.toFixed(2)}</span>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
            <span>(−) Gasto operativo</span>
            <span className="mono" style={{ color: "var(--alert)" }}>S/ {data.gastoOperativo.toFixed(2)}</span>
          </div>
          <div style={{ paddingLeft: 12, marginBottom: 8 }}>
            {Object.entries(data.gastoOperativoPorCategoria).map(([categoria, monto]) => (
              <p key={categoria} className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                {categoria}: S/ {monto.toFixed(2)}
              </p>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "12px 0",
              borderTop: "2px solid var(--ink)",
              fontWeight: 600,
              fontSize: 16,
            }}
          >
            <span>Utilidad neta</span>
            <span className="mono" style={{ color: data.utilidadNeta >= 0 ? "var(--teal)" : "var(--alert)" }}>
              S/ {data.utilidadNeta.toFixed(2)}
            </span>
          </div>
          <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", textAlign: "right" }}>
            Margen neto: {data.margenNetoPct.toFixed(1)}%
          </p>
        </div>
      )}
    </main>
  );
}
