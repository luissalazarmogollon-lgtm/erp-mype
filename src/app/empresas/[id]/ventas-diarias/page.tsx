"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Registro = {
  id: string;
  fecha: string;
  montoEfectivo: string;
  montoYape: string;
  montoPlin: string;
  montoTarjeta: string;
  total: string;
  observacion: string | null;
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function VentasDiariasPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [form, setForm] = useState({
    fecha: hoyISO(),
    montoEfectivo: 0,
    montoYape: 0,
    montoPlin: 0,
    montoTarjeta: 0,
    observacion: "",
  });

  async function cargar() {
    const data = await fetch(`/api/empresas/${empresaId}/ventas-diarias`).then((r) => r.json());
    setRegistros(data);
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

    setForm({ fecha: hoyISO(), montoEfectivo: 0, montoYape: 0, montoPlin: 0, montoTarjeta: 0, observacion: "" });
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
        Registra el total que te reporta el punto de venta del cliente, por método de pago. Si ya existe un registro
        para esa fecha, se actualiza (no se duplica).
      </p>

      <form onSubmit={handleGuardar} className="card" style={{ marginBottom: 24 }}>
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
        {registros.map((r) => (
          <div key={r.id} className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 500, fontSize: 14 }}>
                {new Date(r.fecha).toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short" })}
              </span>
              <span className="mono" style={{ fontWeight: 500 }}>S/ {Number(r.total).toFixed(2)}</span>
            </div>
            <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 4 }}>
              Efectivo S/{Number(r.montoEfectivo).toFixed(2)} · Yape S/{Number(r.montoYape).toFixed(2)} · Plin S/{Number(r.montoPlin).toFixed(2)} · Tarjeta S/{Number(r.montoTarjeta).toFixed(2)}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
