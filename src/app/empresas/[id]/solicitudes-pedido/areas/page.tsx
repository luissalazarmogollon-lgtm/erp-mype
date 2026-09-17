"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AreaItem = { id: string; nombre: string; esAlmacen: boolean };

export default function AreasPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [areas, setAreas] = useState<AreaItem[]>([]);
  const [nombre, setNombre] = useState("");
  const [esAlmacen, setEsAlmacen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [actualizando, setActualizando] = useState<string | null>(null);

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
      body: JSON.stringify({ nombre, esAlmacen }),
    });
    setGuardando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo crear el área.");
      return;
    }

    setNombre("");
    setEsAlmacen(false);
    cargar();
  }

  async function handleEliminar(areaId: string) {
    if (!confirm("¿Desactivar esta área? Dejará de aparecer al crear nuevas solicitudes.")) return;
    await fetch(`/api/empresas/${empresaId}/areas/${areaId}`, { method: "DELETE" });
    cargar();
  }

  async function handleToggleAlmacen(area: AreaItem) {
    setActualizando(area.id);
    await fetch(`/api/empresas/${empresaId}/areas/${area.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ esAlmacen: !area.esAlmacen }),
    });
    setActualizando(null);
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
        <label className="checkbox-row" style={{ fontSize: 12, marginTop: 10 }}>
          <input type="checkbox" checked={esAlmacen} onChange={(e) => setEsAlmacen(e.target.checked)} />
          Esta área representa al propio Almacén (autoabastecimiento)
        </label>
        <p className="mono" style={{ fontSize: 10.5, color: "var(--ink-soft)", marginTop: 4 }}>
          Marca esto solo en el área que use Almacén para pedirse mercadería a sí mismo — normalmente una sola. Sus
          solicitudes las decide quien tenga el permiso &quot;Aprobar solicitudes de Almacén&quot;, no el encargado
          de almacén (para que nadie apruebe su propio pedido).
        </p>
        {error && <p className="field error">{error}</p>}
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {areas.map((a) => (
          <div
            key={a.id}
            className="card"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px" }}
          >
            <div>
              <span style={{ fontSize: 14 }}>{a.nombre}</span>
              {a.esAlmacen && (
                <span
                  className="mono"
                  style={{ marginLeft: 8, fontSize: 10, textTransform: "uppercase", color: "var(--stamp)", background: "var(--stamp-bg)", padding: "2px 8px", borderRadius: "var(--radius)" }}
                >
                  Almacén
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <button
                onClick={() => handleToggleAlmacen(a)}
                disabled={actualizando === a.id}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--ink-soft)" }}
              >
                {a.esAlmacen ? "Quitar marca de Almacén" : "Marcar como Almacén"}
              </button>
              <button
                onClick={() => handleEliminar(a.id)}
                className="btn-ghost"
                style={{ fontSize: 12, padding: "4px 10px" }}
              >
                Desactivar
              </button>
            </div>
          </div>
        ))}
        {areas.length === 0 && <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no hay áreas creadas.</p>}
      </div>
    </main>
  );
}
