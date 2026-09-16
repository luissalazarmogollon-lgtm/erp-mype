"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type CategoriaResumen = { categoria: string; total: string };
type NaturalezaResumen = {
  naturaleza: string | null;
  label: string;
  impactaResultados: boolean;
  total: string;
  categorias: CategoriaResumen[];
};
type EmpresaResumen = {
  empresaId: string;
  nombreComercial: string;
  total: string;
  totalImpactaResultados: string;
  totalNoImpactaResultados: string;
  naturalezas: NaturalezaResumen[];
};
type Reporte = {
  desde: string;
  hasta: string;
  totalGeneral: string;
  totalImpactaResultados: string;
  totalNoImpactaResultados: string;
  empresas: EmpresaResumen[];
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}
function primerDiaMesISO() {
  const hoy = new Date();
  return new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
function soles(valor: string) {
  return `S/ ${Number(valor).toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function pct(parte: string, total: string) {
  const t = Number(total);
  if (t <= 0) return "0%";
  return `${((Number(parte) / t) * 100).toFixed(1)}%`;
}

// Reporte consolidado (TODAS las empresas) de gastos por naturaleza y
// categoría específica — para alta gerencia. Muestra, de mayor a menor
// gasto, cada empresa con su desglose: cuánto de lo gastado es gasto real
// (afecta el Estado de Resultados) y cuánto es inversión, pago de deuda o
// retiro de socios (mueve caja pero no es "gasto" contable todavía).
//
// Solo lo ve el superadmin (igual que Cuentas por Cobrar consolidado):
// cruza datos de todas las empresas a la vez.
export default function GastosPorNaturalezaPage() {
  const [desde, setDesde] = useState(primerDiaMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback((desdeConsulta: string, hastaConsulta: string) => {
    setCargando(true);
    setError(null);
    fetch(`/api/reportes/gastos-por-naturaleza?desde=${desdeConsulta}&hasta=${hastaConsulta}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "No se pudo cargar el reporte.");
        return data as Reporte;
      })
      .then(setReporte)
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargar(desde, hasta);
    // Solo al entrar a la pantalla — después, el botón "Consultar" dispara
    // la recarga con las fechas que el usuario haya elegido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href="/dashboard" style={{ color: "inherit" }}>
          Tus empresas
        </Link>{" "}
        → <b>Gastos por Naturaleza</b>
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
        <h1 style={{ fontSize: 26 }}>Gastos por Naturaleza — todas las empresas</h1>
        {reporte && (
          <a
            href={`/api/reportes/gastos-por-naturaleza/exportar?desde=${reporte.desde}&hasta=${reporte.hasta}`}
            className="btn-ghost"
            style={{ textDecoration: "none", fontSize: 13, whiteSpace: "nowrap" }}
          >
            Exportar a Excel
          </a>
        )}
      </div>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 20 }}>
        Cuánto se gasta por empresa, clasificado por naturaleza del egreso y, dentro de cada una, por categoría
        específica. Distingue el gasto real (afecta el Estado de Resultados) de la inversión, pago de deuda o
        retiro de socios (mueven caja, pero no son "gasto" contable en el momento).
      </p>

      <div className="card" style={{ marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <button className="btn-primary" onClick={() => cargar(desde, hasta)} disabled={cargando} style={{ marginBottom: 0 }}>
          {cargando ? "Consultando..." : "Consultar"}
        </button>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 20 }}>
          <p className="field error" style={{ margin: 0 }}>{error}</p>
        </div>
      )}

      {reporte && !error && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <div className="card">
              <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", textTransform: "uppercase", marginBottom: 4 }}>
                Total del período
              </p>
              <p className="mono" style={{ fontSize: 22, fontWeight: 600 }}>{soles(reporte.totalGeneral)}</p>
            </div>
            <div className="card">
              <p className="mono" style={{ fontSize: 11, color: "var(--teal)", textTransform: "uppercase", marginBottom: 4 }}>
                Afecta resultados
              </p>
              <p className="mono" style={{ fontSize: 22, fontWeight: 600, color: "var(--teal)" }}>
                {soles(reporte.totalImpactaResultados)}
              </p>
            </div>
            <div className="card">
              <p className="mono" style={{ fontSize: 11, color: "var(--stamp)", textTransform: "uppercase", marginBottom: 4 }}>
                Inversión / deuda / retiros
              </p>
              <p className="mono" style={{ fontSize: 22, fontWeight: 600, color: "var(--stamp)" }}>
                {soles(reporte.totalNoImpactaResultados)}
              </p>
            </div>
          </div>

          {reporte.empresas.length === 0 ? (
            <div className="card">
              <p style={{ color: "var(--ink-soft)" }}>No hay gastos registrados en ninguna empresa en este período.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {reporte.empresas.map((empresa) => (
                <div key={empresa.empresaId} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
                    <Link href={`/empresas/${empresa.empresaId}/estado-resultados`} style={{ color: "inherit", textDecoration: "none" }}>
                      <h3 style={{ fontSize: 16 }}>{empresa.nombreComercial} →</h3>
                    </Link>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <a
                        href={`/api/reportes/gastos-por-naturaleza/${empresa.empresaId}/pdf?desde=${reporte.desde}&hasta=${reporte.hasta}`}
                        className="btn-ghost"
                        style={{ textDecoration: "none", fontSize: 11.5, padding: "5px 10px" }}
                      >
                        Descargar PDF
                      </a>
                      <p className="mono" style={{ fontSize: 17, fontWeight: 600 }}>{soles(empresa.total)}</p>
                    </div>
                  </div>
                  <p className="mono" style={{ fontSize: 10.5, color: "var(--ink-soft)", marginBottom: 12 }}>
                    {soles(empresa.totalImpactaResultados)} afecta resultados · {soles(empresa.totalNoImpactaResultados)} inversión/deuda/retiros
                  </p>

                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {empresa.naturalezas.map((naturaleza) => (
                      <div key={naturaleza.naturaleza ?? "sin_clasificar"} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                          <p style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                            {naturaleza.label}
                            <span
                              className="mono"
                              style={{
                                fontSize: 9.5,
                                padding: "1px 6px",
                                borderRadius: 999,
                                background: naturaleza.impactaResultados ? "var(--teal-bg)" : "var(--stamp-bg)",
                                color: naturaleza.impactaResultados ? "var(--teal)" : "var(--stamp)",
                              }}
                            >
                              {naturaleza.impactaResultados ? "gasto" : "no es gasto"}
                            </span>
                          </p>
                          <p className="mono" style={{ fontSize: 13 }}>
                            {soles(naturaleza.total)}{" "}
                            <span style={{ fontSize: 10.5, color: "var(--ink-soft)" }}>({pct(naturaleza.total, empresa.total)})</span>
                          </p>
                        </div>
                        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                          {naturaleza.categorias.map((categoria) => (
                            <div
                              key={categoria.categoria}
                              style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-soft)", paddingLeft: 10 }}
                            >
                              <span>{categoria.categoria}</span>
                              <span className="mono">
                                {soles(categoria.total)} ({pct(categoria.total, naturaleza.total)})
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
