"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type EstadoResultados = {
  rango: { desde: string; hasta: string };
  ventas: { porMetodoPago: { efectivo: number; yape: number; plin: number; tarjeta: number }; creditos: number; total: number };
  costoVentas: number;
  utilidadBruta: number;
  margenBrutoPct: number;
  gastoOperativo: number;
  ebitda: number;
  margenEbitdaPct: number;
  depreciacionAmortizacion: number;
  utilidadOperativa: number;
  margenOperativoPct: number;
  gastoFinanciero: number;
  utilidadAntesImpuestos: number;
  gastoTributario: number;
  otrosEgresos: number;
  utilidadNeta: number;
  margenNetoPct: number;
  egresoCajaTotal: number;
  egresoCajaNoOperativo: number;
  detallePorNaturaleza: Record<string, number>;
};
type LocalOpcion = { id: string; nombre: string };

function inicioMesISO() {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
}
function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function Linea({
  label, valor, negativo = false, destacado = false, borde = false, sub = false, unidad = "soles",
}: { label: string; valor: number; negativo?: boolean; destacado?: boolean; borde?: boolean; sub?: boolean; unidad?: "soles" | "pct" }) {
  const texto = unidad === "pct" ? `${valor.toFixed(1)}%` : `${negativo && valor > 0 ? "− " : ""}S/ ${valor.toFixed(2)}`;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: destacado ? "10px 0" : "7px 0",
        paddingLeft: sub ? 14 : 0,
        borderTop: borde ? "2px solid var(--ink)" : sub ? "none" : "1px solid var(--line)",
        fontWeight: destacado ? 600 : 400,
        fontSize: destacado ? 15 : sub ? 12.5 : 13.5,
        color: sub ? "var(--ink-soft)" : "var(--ink)",
      }}
    >
      <span>{label}</span>
      <span className="mono" style={{ color: negativo ? "var(--alert)" : destacado ? (valor >= 0 ? "var(--teal)" : "var(--alert)") : undefined }}>
        {texto}
      </span>
    </div>
  );
}

export default function EstadoResultadosPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [desde, setDesde] = useState(inicioMesISO());
  const [hasta, setHasta] = useState(hoyISO());
  const [localId, setLocalId] = useState("");
  const [locales, setLocales] = useState<LocalOpcion[]>([]);
  const [data, setData] = useState<EstadoResultados | null>(null);
  const [cargando, setCargando] = useState(true);
  const [esServicios, setEsServicios] = useState(false);

  async function cargar() {
    setCargando(true);
    const qs = new URLSearchParams({ desde, hasta });
    if (localId) qs.set("localId", localId);
    const res = await fetch(`/api/empresas/${empresaId}/estado-resultados?${qs.toString()}`);
    const json = await res.json();
    setData(json);
    setCargando(false);
  }

  useEffect(() => {
    fetch(`/api/empresas/${empresaId}/catalogos`)
      .then((r) => r.json())
      .then((d) => setLocales(d.locales ?? []));
    fetch(`/api/empresas/${empresaId}/mi-acceso`)
      .then((r) => r.json())
      .then((d) => setEsServicios(Boolean(d.esServicios)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, desde, hasta, localId]);

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

      <div className="card" style={{ marginBottom: 20, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field" style={{ marginBottom: 0, flex: 1 }}>
          <label>Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0, flex: 1 }}>
          <label>Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        {locales.length > 0 && (
          <div className="field" style={{ marginBottom: 0, flex: 1 }}>
            <label>Local</label>
            <select value={localId} onChange={(e) => setLocalId(e.target.value)}>
              <option value="">Todos (consolidado)</option>
              {locales.map((l) => (
                <option key={l.id} value={l.id}>{l.nombre}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {cargando || !data ? (
        <p style={{ color: "var(--ink-soft)" }}>Calculando...</p>
      ) : (
        <>
          {(data.detallePorNaturaleza?.sin_clasificar ?? 0) > 0 && (
            <div className="card" style={{ marginBottom: 16, borderColor: "var(--stamp)", background: "var(--stamp-bg, #f1e2c8)" }}>
              <p style={{ fontSize: 13, margin: 0 }}>
                <b>S/ {data.detallePorNaturaleza.sin_clasificar.toFixed(2)}</b> en gastos todavía no están incluidos
                en este resultado — vienen de facturas por pagar registradas sin clasificar.{" "}
                <Link href={`/empresas/${empresaId}/cuentas-por-pagar`} style={{ color: "inherit", textDecoration: "underline" }}>
                  Clasifícalos en Cuentas por Pagar
                </Link>{" "}
                para que se sumen aquí.
              </p>
            </div>
          )}

          <div className="card" style={{ marginBottom: 16 }}>
            <Linea label="Ventas totales" valor={data.ventas.total} destacado />
            <div style={{ paddingLeft: 12, marginBottom: 8 }}>
              {!esServicios && (
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  Efectivo S/{data.ventas.porMetodoPago.efectivo.toFixed(2)} · Yape S/{data.ventas.porMetodoPago.yape.toFixed(2)} · Plin S/{data.ventas.porMetodoPago.plin.toFixed(2)} · Tarjeta S/{data.ventas.porMetodoPago.tarjeta.toFixed(2)}
                </p>
              )}
              <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                {esServicios ? "Facturación emitida en el período" : "Créditos otorgados en el período"}: S/ {data.ventas.creditos.toFixed(2)}
              </p>
            </div>

            <Linea label="(−) Costo de ventas" valor={data.costoVentas} negativo />
            <Linea label="Utilidad bruta" valor={data.utilidadBruta} destacado borde />
            <Linea label="Margen bruto" valor={data.margenBrutoPct} sub unidad="pct" />

            <Linea label="(−) Gasto operativo" valor={data.gastoOperativo} negativo />
            <Linea label="EBITDA" valor={data.ebitda} destacado borde />
            <Linea label="Margen EBITDA" valor={data.margenEbitdaPct} sub unidad="pct" />

            <Linea label="(−) Depreciación y amortización" valor={data.depreciacionAmortizacion} negativo />
            <Linea label="Utilidad operativa (EBIT)" valor={data.utilidadOperativa} destacado borde />
            <Linea label="Margen operativo" valor={data.margenOperativoPct} sub unidad="pct" />

            <Linea label="(−) Gasto financiero" valor={data.gastoFinanciero} negativo />
            <Linea label="Utilidad antes de impuestos (EBT)" valor={data.utilidadAntesImpuestos} destacado borde />

            <Linea label="(−) Gasto tributario" valor={data.gastoTributario} negativo />
            <Linea label="(−) Otros egresos" valor={data.otrosEgresos} negativo />

            <div
              style={{
                display: "flex", justifyContent: "space-between", padding: "12px 0",
                borderTop: "2px solid var(--ink)", fontWeight: 600, fontSize: 16,
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

          <div className="card">
            <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 8, textTransform: "uppercase" }}>
              ¿Cuánto dinero salió realmente de la empresa? (egreso de caja)
            </p>
            <Linea label="Egreso de caja total" valor={data.egresoCajaTotal} />
            <Linea label="De lo cual, no afecta el resultado (activos, pago de deuda, retiros)" valor={data.egresoCajaNoOperativo} />
            <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 8 }}>
              La depreciación y amortización todavía está en S/ 0.00 — se activará automáticamente cuando esté
              listo el módulo de Activos Fijos.
            </p>
          </div>
        </>
      )}
    </main>
  );
}
