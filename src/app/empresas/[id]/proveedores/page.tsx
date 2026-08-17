"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Proveedor = {
  id: string;
  nombre: string;
  ruc: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
};

export default function ProveedoresPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({ nombre: "", ruc: "", contacto: "", telefono: "", email: "" });

  async function cargar() {
    const res = await fetch(`/api/empresas/${empresaId}/proveedores`).then((r) => r.json());
    setProveedores(Array.isArray(res) ? res : []);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setGuardando(true);
    const res = await fetch(`/api/empresas/${empresaId}/proveedores`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setGuardando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo crear el proveedor.");
      return;
    }

    setForm({ nombre: "", ruc: "", contacto: "", telefono: "", email: "" });
    setMostrarForm(false);
    cargar();
  }

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          ← Volver a la empresa
        </Link>
      </p>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Proveedores</h1>

      {!mostrarForm ? (
        <button className="btn-primary" onClick={() => setMostrarForm(true)} style={{ marginBottom: 20 }}>
          + Nuevo proveedor
        </button>
      ) : (
        <form onSubmit={handleCrear} className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>Nombre / razón social</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div className="field">
              <label>RUC (opcional)</label>
              <input value={form.ruc} onChange={(e) => setForm({ ...form, ruc: e.target.value })} />
            </div>
            <div className="field">
              <label>Contacto (opcional)</label>
              <input value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
            </div>
            <div className="field">
              <label>Teléfono (opcional)</label>
              <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </div>
            <div className="field">
              <label>Email (opcional)</label>
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          {error && <p className="field error">{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-primary" disabled={guardando} type="submit">
              {guardando ? "Guardando..." : "Guardar"}
            </button>
            <button className="btn-ghost" type="button" onClick={() => setMostrarForm(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {proveedores.map((p) => (
          <div key={p.id} className="card">
            <p style={{ fontSize: 14, fontWeight: 500 }}>{p.nombre}</p>
            <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
              {[p.ruc && `RUC ${p.ruc}`, p.contacto, p.telefono, p.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}
            </p>
          </div>
        ))}
        {proveedores.length === 0 && <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no hay proveedores registrados.</p>}
      </div>
    </main>
  );
}
