"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Registro = {
  id: string;
  local: string | null;
  fecha: string;
  montoEfectivo: string;
  montoYape: string;
  montoPlin: string;
  montoTarjeta: string;
  total: string;
  observacion: string | null;
  conciliacion: {
    efectivoCuenta: string | null;
    yapeCuenta: string | null;
    plinCuenta: string | null;
    tarjetaCuenta: string | null;
  };
};
type LocalOpcion = { id: string; nombre: string };
type CuentaOpcion = { id: string; bancoNombre: string };

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

const LEGS = [
  { campo: "efectivoCuentaId" as const, conciliacionCampo: "efectivoCuenta" as const, monto: "montoEfectivo" as const, label: "Efectivo" },
  { campo: "yapeCuentaId" as const, conciliacionCampo: "yapeCuenta" as const, monto: "montoYape" as const, label: "Yape" },
  { campo: "plinCuentaId" as const, conciliacionCampo: "plinCuenta" as const, monto: "montoPlin" as const, label: "Plin" },
  { campo: "tarjetaCuentaId" as const, conciliacionCampo: "tarjetaCuenta" as const, monto: "montoTarjeta" as const, label: "Tarjeta" },
];

export default function VentasDiariasPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [locales, setLocales] = useState<LocalOpcion[]>([]);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaOpcion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [conciliando, setConciliando] = useState<string | null>(null);
  const [formConciliar, setFormConciliar] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    localId: "",
    fecha: hoyISO(),
    montoEfectivo: 0,
    montoYape: 0,
    montoPlin: 0,
    montoTarjeta: 0,
    observacion: "",
  });

  async function cargar() {
    const [resRegistros, resCatalogos] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/ventas-diarias`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/catalogos`).then((r) => r.json()),
    ]);
    setRegistros(resRegistros);
    setLocales(resCatalogos.locales ?? []);
    setCuentasBancarias(resCatalogos.cuentasBancarias ?? []);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const totalForm = form.montoEfectivo + form.montoYape + form.montoPlin + form.montoTarjeta;

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);

    const res = await fetch(`/api/empresas/${empresaId}/ventas-diarias`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setGuardando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo guardar el registro.");
      return;
    }

    setForm({ ...form, montoEfectivo: 0, montoYape: 0, montoPlin: 0, montoTarjeta: 0, observacion: "" });
    cargar();
  }

  async function handleConciliar(registroId: string) {
    setError(null);
    const res = await fetch(`/api/empresas/${empresaId}/ventas-diarias/${registroId}/conciliar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formConciliar),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo actualizar el flujo de caja.");
      return;
    }
    setConciliando(null);
    setFormConciliar({});
    cargar();
  }

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>Ventas diarias</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Ventas diarias</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 20 }}>
        Registra el total que te reporta el punto de venta del cliente, por método de pago
        {locales.length > 0 ? " y por local" : ""}. Después, desde cada registro, puedes indicar a qué cuenta
        bancaria entró cada método de pago para que se refleje en el Flujo de Caja.
      </p>

      <form onSubmit={handleGuardar} className="card" style={{ marginBottom: 24 }}>
        {locales.length > 0 && (
          <div className="field">
            <label>Local</label>
            <select value={form.localId} onChange={(e) => setForm({ ...form, localId: e.target.value })}>
              <option value="">Consolidado (sin local específico)</option>
              {locales.map((l) => (
                <option key={l.id} value={l.id}>{l.nombre}</option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label>Fecha</label>
          <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label>Efectivo (S/)</label>
            <input type="number" step="0.01" value={form.montoEfectivo} onChange={(e) => setForm({ ...form, montoEfectivo: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Yape (S/)</label>
            <input type="number" step="0.01" value={form.montoYape} onChange={(e) => setForm({ ...form, montoYape: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Plin (S/)</label>
            <input type="number" step="0.01" value={form.montoPlin} onChange={(e) => setForm({ ...form, montoPlin: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Tarjeta (S/)</label>
            <input type="number" step="0.01" value={form.montoTarjeta} onChange={(e) => setForm({ ...form, montoTarjeta: Number(e.target.value) })} />
          </div>
        </div>
        <div className="field">
          <label>Observación (opcional)</label>
          <input value={form.observacion} onChange={(e) => setForm({ ...form, observacion: e.target.value })} />
        </div>

        <p className="mono" style={{ fontSize: 14, marginBottom: 12 }}>Total del día: S/ {totalForm.toFixed(2)}</p>

        {error && <p className="field error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar registro del día"}
        </button>
      </form>

      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Historial</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {registros.map((r) => {
          const legsPendientes = LEGS.filter(
            (leg) => Number(r[leg.monto]) > 0 && !r.conciliacion[leg.conciliacionCampo]
          );
          return (
            <div key={r.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 500, fontSize: 14 }}>
                  {new Date(r.fecha).toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short" })}
                  {r.local && <span className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}> · {r.local}</span>}
                </span>
                <span className="mono" style={{ fontWeight: 500 }}>S/ {Number(r.total).toFixed(2)}</span>
              </div>
              <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 4 }}>
                Efectivo S/{Number(r.montoEfectivo).toFixed(2)}{r.conciliacion.efectivoCuenta ? ` → ${r.conciliacion.efectivoCuenta}` : ""} ·
                {" "}Yape S/{Number(r.montoYape).toFixed(2)}{r.conciliacion.yapeCuenta ? ` → ${r.conciliacion.yapeCuenta}` : ""} ·
                {" "}Plin S/{Number(r.montoPlin).toFixed(2)}{r.conciliacion.plinCuenta ? ` → ${r.conciliacion.plinCuenta}` : ""} ·
                {" "}Tarjeta S/{Number(r.montoTarjeta).toFixed(2)}{r.conciliacion.tarjetaCuenta ? ` → ${r.conciliacion.tarjetaCuenta}` : ""}
              </p>

              {cuentasBancarias.length > 0 && legsPendientes.length > 0 && (
                conciliando === r.id ? (
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                    {legsPendientes.map((leg) => (
                      <div key={leg.campo} className="field" style={{ marginBottom: 8 }}>
                        <label>{leg.label} (S/ {Number(r[leg.monto]).toFixed(2)}) entró a:</label>
                        <select
                          value={formConciliar[leg.campo] ?? ""}
                          onChange={(e) => setFormConciliar({ ...formConciliar, [leg.campo]: e.target.value })}
                        >
                          <option value="">Sin registrar</option>
                          {cuentasBancarias.map((c) => (
                            <option key={c.id} value={c.id}>{c.bancoNombre}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                    {error && <p className="field error">{error}</p>}
                    <div style={{ display: "flex", gap: 10 }}>
                      <button className="btn-primary" style={{ fontSize: 12, padding: "8px 14px" }} onClick={() => handleConciliar(r.id)}>
                        Guardar
                      </button>
                      <button className="btn-ghost" style={{ fontSize: 12, padding: "8px 14px" }} onClick={() => setConciliando(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn-ghost"
                    style={{ marginTop: 10, fontSize: 12, padding: "6px 12px" }}
                    onClick={() => { setConciliando(r.id); setFormConciliar({}); setError(null); }}
                  >
                    Actualizar flujo de caja
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
