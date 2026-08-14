"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type LocalItem = { id: string; nombre: string };

export default function LocalesPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [locales, setLocales] = useState<LocalItem[]>([]);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    const data = await fetch(`/api/empresas/${empresaId}/locales`).then((r) => r.json());
    setLocales(data);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/empresas/${empresaId}/locales`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo crear el local.");
      return;
    }
    setNombre("");
    cargar();
  }

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>Locales</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Locales / Centros de costo</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 20 }}>
        Si tu cliente tiene más de un punto de venta, créalos aquí. Podrás registrar ventas y gastos por local, y
        el Estado de Resultados los consolida automáticamente en uno solo. Si el negocio tiene un solo local, no
        necesitas crear ninguno — todo se registra "consolidado" por defecto.
      </p>

      <form onSubmit={handleCrear} className="card" style={{ marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Nombre del local</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Sede Miraflores" required />
        </div>
        <button type="submit" className="btn-primary" style={{ marginBottom: 0 }}>
          + Crear local
        </button>
      </form>
      {error && <p className="field error">{error}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {locales.map((l) => (
          <div key={l.id} className="card" style={{ padding: 14 }}>
            <p style={{ fontSize: 14 }}>{l.nombre}</p>
          </div>
        ))}
        {locales.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no has creado ningún local.</p>
        )}
      </div>
    </main>
  );
}
