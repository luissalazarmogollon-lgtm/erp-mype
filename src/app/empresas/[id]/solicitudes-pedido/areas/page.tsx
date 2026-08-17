"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AreaItem = { id: string; nombre: string };

export default function AreasPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [areas, setAreas] = useState<AreaItem[]>([]);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const res = await fetch(`/api/empresas/${empresaId}/areas`).then((r) => r.json());
    setAreas(Array.isArray(res) ? res : []);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setGuardando(true);
    const res = await fetch(`/api/empresas/${empresaId}/areas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre }),
    });
    setGuardando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo crear el área.");
      return;
    }

    setNombre("");
    cargar();
  }

  async function handleEliminar(areaId: string) {
    if (!confirm("¿Desactivar esta área? Dejará de aparecer al crear nuevas solicitudes.")) return;
    await fetch(`/api/empresas/${empresaId}/areas/${areaId}`, { method: "DELETE" });
    cargar();
  }

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}/solicitudes-pedido`} style={{ color: "inherit" }}>
          ← Solicitudes de Pedido
        </Link>
      </p>
      <h1 style={{ fontSize: 24, marginBottom: 20 }}>Áreas</h1>

      <form onSubmit={handleCrear} className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div className="field" style={{ margin: 0, flex: 1 }}>
            <label>Nombre del área</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Cocina, Barra, Administración" />
          </div>
          <button className="btn-primary" disabled={guardando} type="submit">
            {guardando ? "Guardando..." : "+ Agregar"}
          </button>
        </div>
        {error && <p className="field error">{error}</p>}
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {areas.map((a) => (
          <div
            key={a.id}
            className="card"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}
          >
            <span style={{ fontSize: 14 }}>{a.nombre}</span>
            <button
              onClick={() => handleEliminar(a.id)}
              className="btn-ghost"
              style={{ fontSize: 12, padding: "4px 10px" }}
            >
              Desactivar
            </button>
          </div>
        ))}
        {areas.length === 0 && <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no hay áreas creadas.</p>}
      </div>
    </main>
  );
}
