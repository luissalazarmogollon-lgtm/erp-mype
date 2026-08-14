"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Cuenta = { id: string; bancoNombre: string; numeroCuenta: string | null; moneda: string; saldoActual: string };
type Movimiento = { id: string; cuenta: string; tipo: string; monto: string; concepto: string; fecha: string };

export default function FlujoCajaPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [saldoConsolidado, setSaldoConsolidado] = useState(0);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [ajustando, setAjustando] = useState<string | null>(null);
  const [nuevoSaldo, setNuevoSaldo] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ bancoNombre: "", numeroCuenta: "", moneda: "PEN", saldoInicial: 0 });

  async function cargar() {
    const data = await fetch(`/api/empresas/${empresaId}/flujo-caja`).then((r) => r.json());
    setSaldoConsolidado(data.saldoConsolidado ?? 0);
    setCuentas(data.cuentas ?? []);
    setMovimientos(data.movimientos ?? []);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function handleCrearCuenta(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/empresas/${empresaId}/cuentas-bancarias`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo crear la cuenta.");
      return;
    }
    setForm({ bancoNombre: "", numeroCuenta: "", moneda: "PEN", saldoInicial: 0 });
    setMostrarForm(false);
    cargar();
  }

  async function handleAjustarSaldo(cuentaId: string) {
    setError(null);
    const res = await fetch(`/api/empresas/${empresaId}/cuentas-bancarias/${cuentaId}/saldo-inicial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ saldo: nuevoSaldo, concepto: "Ajuste / saldo de inicio de mes" }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo ajustar el saldo.");
      return;
    }
    setAjustando(null);
    cargar();
  }

  return (
    <main style={{ maxWidth: 750, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>Flujo de Caja</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Flujo de Caja</h1>
      <p className="mono" style={{ fontSize: 16, color: "var(--teal, #20554e)", marginBottom: 20 }}>
        Saldo consolidado: S/ {saldoConsolidado.toFixed(2)}
      </p>

      {!mostrarForm ? (
        <button className="btn-primary" onClick={() => setMostrarForm(true)} style={{ marginBottom: 20 }}>
          + Nueva cuenta / caja
        </button>
      ) : (
        <form onSubmit={handleCrearCuenta} className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>Banco (o "Caja Efectivo")</label>
              <input value={form.bancoNombre} onChange={(e) => setForm({ ...form, bancoNombre: e.target.value })} required />
            </div>
            <div className="field">
              <label>N° de cuenta (opcional)</label>
              <input value={form.numeroCuenta} onChange={(e) => setForm({ ...form, numeroCuenta: e.target.value })} />
            </div>
            <div className="field">
              <label>Moneda</label>
              <select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })}>
                <option value="PEN">Soles (PEN)</option>
                <option value="USD">Dólares (USD)</option>
              </select>
            </div>
            <div className="field">
              <label>Saldo inicial (S/)</label>
              <input
                type="number"
                step="0.01"
                value={form.saldoInicial}
                onChange={(e) => setForm({ ...form, saldoInicial: Number(e.target.value) })}
              />
            </div>
          </div>
          {error && <p className="field error">{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="btn-primary">Crear</button>
            <button type="button" className="btn-ghost" onClick={() => setMostrarForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Cuentas</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 28 }}>
        {cuentas.map((c) => (
          <div key={c.id} className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{c.bancoNombre}</p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {c.numeroCuenta ?? "-"} · {c.moneda}
                </p>
              </div>
              <p className="mono" style={{ fontSize: 15, fontWeight: 500 }}>S/ {Number(c.saldoActual).toFixed(2)}</p>
            </div>

            {ajustando === c.id ? (
              <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
                <input
                  type="number"
                  step="0.01"
                  value={nuevoSaldo}
                  onChange={(e) => setNuevoSaldo(Number(e.target.value))}
                  style={{ flex: 1, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 2 }}
                />
                <button className="btn-primary" style={{ padding: "8px 14px", fontSize: 12 }} onClick={() => handleAjustarSaldo(c.id)}>
                  Confirmar
                </button>
                <button className="btn-ghost" style={{ padding: "8px 14px", fontSize: 12 }} onClick={() => setAjustando(null)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                className="btn-ghost"
                style={{ marginTop: 10, fontSize: 12, padding: "6px 12px" }}
                onClick={() => { setAjustando(c.id); setNuevoSaldo(Number(c.saldoActual)); setError(null); }}
              >
                Registrar saldo de inicio de mes / ajustar
              </button>
            )}
          </div>
        ))}
        {cuentas.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no has creado ninguna cuenta.</p>
        )}
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Movimientos recientes</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {movimientos.map((m) => (
          <div key={m.id} className="card" style={{ display: "flex", justifyContent: "space-between", padding: 12 }}>
            <div>
              <p style={{ fontSize: 13 }}>{m.concepto}</p>
              <p className="mono" style={{ fontSize: 10, color: "var(--ink-soft)" }}>
                {m.cuenta} · {new Date(m.fecha).toLocaleDateString("es-PE")}
              </p>
            </div>
            <p
              className="mono"
              style={{ fontSize: 13, color: m.tipo === "egreso" ? "var(--alert)" : "var(--teal)" }}
            >
              {m.tipo === "egreso" ? "−" : "+"} S/ {Number(m.monto).toFixed(2)}
            </p>
          </div>
        ))}
        {movimientos.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no hay movimientos.</p>
        )}
      </div>
    </main>
  );
}
