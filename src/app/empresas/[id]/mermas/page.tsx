"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Merma = {
  id: string;
  insumo: string;
  cantidad: string;
  motivo: string;
  costoEstimado: string;
  fecha: string;
  observacion: string | null;
};
type InsumoOpcion = { id: string; nombre: string; stockActual: string };

const MOTIVOS = [
  { value: "vencimiento", label: "Vencimiento" },
  { value: "desperdicio_preparacion", label: "Desperdicio en preparación" },
  { value: "robo_diferencia", label: "Robo / diferencia" },
  { value: "otro", label: "Otro" },
];

export default function MermasPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [mermas, setMermas] = useState<Merma[]>([]);
  const [insumos, setInsumos] = useState<InsumoOpcion[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ insumoId: "", cantidad: 0, motivo: "desperdicio_preparacion", observacion: "" });

  async function cargarTodo() {
    const [resMermas, resCatalogos] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/mermas`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/catalogos`).then((r) => r.json()),
    ]);
    setMermas(resMermas);
    setInsumos(resCatalogos.insumos ?? []);
    if (resCatalogos.insumos?.length > 0 && !form.insumoId) {
      setForm((f) => ({ ...f, insumoId: resCatalogos.insumos[0].id }));
    }
  }

  useEffect(() => {
    cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const impactoTotal = mermas.reduce((acc, m) => acc + Number(m.costoEstimado), 0);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/empresas/${empresaId}/mermas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo registrar la merma.");
      return;
    }
    setForm({ ...form, cantidad: 0, observacion: "" });
    setMostrarForm(false);
    cargarTodo();
  }

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>Mermas</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Mermas</h1>
      <p className="mono" style={{ fontSize: 12, color: "var(--alert)", marginBottom: 20 }}>
        Impacto económico total: S/ {impactoTotal.toFixed(2)}
      </p>

      {!mostrarForm ? (
        <button className="btn-primary" onClick={() => setMostrarForm(true)} style={{ marginBottom: 20 }}>
          + Registrar merma
        </button>
      ) : (
        <form onSubmit={handleCrear} className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>Insumo</label>
              <select value={form.insumoId} onChange={(e) => setForm({ ...form, insumoId: e.target.value })}>
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>{i.nombre} (stock: {i.stockActual})</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Cantidad</label>
              <input
                type="number"
                step="0.001"
                value={form.cantidad}
                onChange={(e) => setForm({ ...form, cantidad: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Motivo</label>
              <select value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })}>
                {MOTIVOS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Observación (opcional)</label>
              <input value={form.observacion} onChange={(e) => setForm({ ...form, observacion: e.target.value })} />
            </div>
          </div>
          {error && <p className="field error">{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="btn-primary">Registrar</button>
            <button type="button" className="btn-ghost" onClick={() => setMostrarForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {mermas.map((m) => (
          <div key={m.id} className="card" style={{ display: "flex", justifyContent: "space-between", padding: 14 }}>
            <div>
              <p style={{ fontSize: 14 }}>{m.cantidad} × {m.insumo}</p>
              <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                {MOTIVOS.find((x) => x.value === m.motivo)?.label} · {new Date(m.fecha).toLocaleDateString("es-PE", { timeZone: "UTC" })}
              </p>
            </div>
            <p className="mono" style={{ fontSize: 13, color: "var(--alert)" }}>S/ {Number(m.costoEstimado).toFixed(2)}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
