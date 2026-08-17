"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Insumo = {
  id: string;
  codigo: string | null;
  nombre: string;
  categoria: string | null;
  unidadMedida: string | null;
  stockMinimo: string;
  stockActual: string;
  costoPromedioActual: string;
  bajoMinimo: boolean;
  proveedorPreferidoId: string | null;
  proveedorPreferidoNombre: string | null;
};

type Catalogo = { id: string; nombre: string };

export default function InsumosPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [categorias, setCategorias] = useState<Catalogo[]>([]);
  const [unidades, setUnidades] = useState<Catalogo[]>([]);
  const [proveedores, setProveedores] = useState<Catalogo[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [ajustando, setAjustando] = useState<string | null>(null);
  const [asignandoProveedor, setAsignandoProveedor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ nombre: "", codigo: "", categoriaId: "", unidadMedidaId: "", stockMinimo: 0 });
  const [ajuste, setAjuste] = useState({ cantidad: 0, costoUnitario: 0, observacion: "" });

  async function cargarTodo() {
    const resInsumos = await fetch(`/api/empresas/${empresaId}/insumos`).then((r) => r.json());
    setInsumos(resInsumos);
  }

  useEffect(() => {
    cargarTodo();
    fetch(`/api/empresas/${empresaId}/catalogos`)
      .then((r) => r.json())
      .then((data) => {
        setCategorias(data.categoriasInsumo ?? []);
        setUnidades(data.unidadesMedida ?? []);
        setProveedores(data.proveedores ?? []);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/empresas/${empresaId}/insumos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo crear el insumo.");
      return;
    }
    setForm({ nombre: "", codigo: "", categoriaId: "", unidadMedidaId: "", stockMinimo: 0 });
    setMostrarForm(false);
    cargarTodo();
  }

  async function handleAjustar(insumoId: string) {
    setError(null);
    const res = await fetch(`/api/empresas/${empresaId}/insumos/${insumoId}/ajuste`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ajuste),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo ajustar el stock.");
      return;
    }
    setAjustando(null);
    setAjuste({ cantidad: 0, costoUnitario: 0, observacion: "" });
    cargarTodo();
  }

  async function handleAsignarProveedor(insumoId: string, proveedorId: string) {
    await fetch(`/api/empresas/${empresaId}/insumos/${insumoId}/proveedor`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proveedorId: proveedorId || null }),
    });
    setAsignandoProveedor(null);
    cargarTodo();
  }

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>Insumos</b>
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 26 }}>Insumos</h1>
        <Link href={`/empresas/${empresaId}/insumos/importar`} className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Cargar por plantilla →
        </Link>
      </div>

      {!mostrarForm ? (
        <button className="btn-primary" onClick={() => setMostrarForm(true)} style={{ marginBottom: 20 }}>
          + Nuevo insumo
        </button>
      ) : (
        <form onSubmit={handleCrear} className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>Nombre</label>
              <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
            </div>
            <div className="field">
              <label>Código (opcional)</label>
              <input value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            </div>
            <div className="field">
              <label>Categoría</label>
              <select value={form.categoriaId} onChange={(e) => setForm({ ...form, categoriaId: e.target.value })}>
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Unidad de medida</label>
              <select value={form.unidadMedidaId} onChange={(e) => setForm({ ...form, unidadMedidaId: e.target.value })}>
                <option value="">Sin unidad</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Stock mínimo</label>
              <input
                type="number"
                step="0.001"
                value={form.stockMinimo}
                onChange={(e) => setForm({ ...form, stockMinimo: Number(e.target.value) })}
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

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {insumos.map((i) => (
          <div key={i.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>
                  {i.nombre} {i.bajoMinimo && <span style={{ color: "var(--alert)", fontSize: 11 }}>· bajo mínimo</span>}
                </p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {i.categoria ?? "Sin categoría"} · {i.unidadMedida ?? "-"}
                </p>
                {asignandoProveedor === i.id ? (
                  <select
                    className="mono"
                    style={{ fontSize: 11, marginTop: 4 }}
                    defaultValue={i.proveedorPreferidoId ?? ""}
                    onChange={(e) => handleAsignarProveedor(i.id, e.target.value)}
                    onBlur={() => setAsignandoProveedor(null)}
                    autoFocus
                  >
                    <option value="">Sin proveedor preferido</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                ) : (
                  <button
                    onClick={() => setAsignandoProveedor(i.id)}
                    className="mono"
                    style={{ fontSize: 11, color: "var(--ink-soft)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 2 }}
                  >
                    {i.proveedorPreferidoNombre ? `Proveedor: ${i.proveedorPreferidoNombre} (editar)` : "+ Asignar proveedor preferido"}
                  </button>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <p className="mono" style={{ fontSize: 13 }}>Stock: {i.stockActual}</p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  Costo prom: S/ {Number(i.costoPromedioActual).toFixed(4)}
                </p>
              </div>
            </div>

            {ajustando === i.id ? (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div className="field">
                    <label>Cantidad (+ entra, - sale)</label>
                    <input
                      type="number"
                      step="0.001"
                      value={ajuste.cantidad}
                      onChange={(e) => setAjuste({ ...ajuste, cantidad: Number(e.target.value) })}
                    />
                  </div>
                  <div className="field">
                    <label>Costo unitario (si entra stock)</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={ajuste.costoUnitario}
                      onChange={(e) => setAjuste({ ...ajuste, costoUnitario: Number(e.target.value) })}
                    />
                  </div>
                </div>
                {error && <p className="field error">{error}</p>}
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn-primary" onClick={() => handleAjustar(i.id)}>Confirmar ajuste</button>
                  <button className="btn-ghost" onClick={() => setAjustando(null)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: "6px 12px" }}
                  onClick={() => { setAjustando(i.id); setError(null); }}
                >
                  Ajustar stock
                </button>
                <Link
                  href={`/empresas/${empresaId}/insumos/${i.id}/kardex`}
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: "6px 12px", textDecoration: "none" }}
                >
                  Ver Kardex / Lotes
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
