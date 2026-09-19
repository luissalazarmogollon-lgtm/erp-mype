"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Producto = {
  id: string;
  codigo: string | null;
  nombre: string;
  categoriaId: string | null;
  categoria: string | null;
  tipo: string;
  precioVenta: string;
  unidadMedidaId: string | null;
  unidadMedida: string | null;
  stockMinimo: string;
  stockActual: string;
  costoPromedioActual: string;
  bajoMinimo: boolean;
  margen: string;
};

type Catalogo = { id: string; nombre: string };

export default function ProductosPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Catalogo[]>([]);
  const [unidades, setUnidades] = useState<Catalogo[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [ajustando, setAjustando] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null);

  const [form, setForm] = useState({
    nombre: "",
    codigo: "",
    categoriaId: "",
    tipo: "producto",
    precioVenta: 0,
    unidadMedidaId: "",
    stockMinimo: 0,
  });
  const [ajuste, setAjuste] = useState({ cantidad: 0, costoUnitario: 0, observacion: "" });
  const [editForm, setEditForm] = useState({
    nombre: "",
    codigo: "",
    categoriaId: "",
    tipo: "producto",
    precioVenta: 0,
    unidadMedidaId: "",
    stockMinimo: 0,
  });

  async function cargarTodo() {
    const [resProductos, resCatalogos] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/productos`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/catalogos`).then((r) => r.json()),
    ]);
    setProductos(resProductos);
    setCategorias(resCatalogos.categoriasProducto ?? []);
    setUnidades(resCatalogos.unidadesMedida ?? []);
  }

  useEffect(() => {
    cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const res = await fetch(`/api/empresas/${empresaId}/productos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo crear el producto.");
      return;
    }

    setForm({ nombre: "", codigo: "", categoriaId: "", tipo: "producto", precioVenta: 0, unidadMedidaId: "", stockMinimo: 0 });
    setMostrarForm(false);
    cargarTodo();
  }

  async function handleAjustar(productoId: string) {
    setError(null);
    const res = await fetch(`/api/empresas/${empresaId}/productos/${productoId}/ajuste`, {
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

  function iniciarEdicion(p: Producto) {
    setEditForm({
      nombre: p.nombre,
      codigo: p.codigo ?? "",
      categoriaId: p.categoriaId ?? "",
      tipo: p.tipo,
      precioVenta: Number(p.precioVenta),
      unidadMedidaId: p.unidadMedidaId ?? "",
      stockMinimo: Number(p.stockMinimo),
    });
    setErrorEdicion(null);
    setEditando(p.id);
  }

  async function handleGuardarEdicion(productoId: string) {
    setErrorEdicion(null);
    const res = await fetch(`/api/empresas/${empresaId}/productos/${productoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    if (!res.ok) {
      const data = await res.json();
      setErrorEdicion(data.error?.toString() ?? "No se pudo guardar los cambios.");
      return;
    }
    setEditando(null);
    cargarTodo();
  }

  async function handleEliminar(p: Producto) {
    const advertencia =
      Number(p.stockActual) !== 0
        ? `"${p.nombre}" todavía tiene stock (${p.stockActual}). ¿Eliminarlo de todas formas? No se borra su historial de ventas/lotes, solo desaparece de la lista y del punto de venta.`
        : `¿Eliminar "${p.nombre}"? No se borra su historial, solo desaparece de la lista y del punto de venta.`;
    if (!confirm(advertencia)) return;
    setError(null);
    setEliminandoId(p.id);
    const res = await fetch(`/api/empresas/${empresaId}/productos/${p.id}`, { method: "DELETE" });
    setEliminandoId(null);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo eliminar el producto.");
      return;
    }
    cargarTodo();
  }

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <b>Productos</b>
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h1 style={{ fontSize: 26 }}>Productos</h1>
        <Link href={`/empresas/${empresaId}/productos/importar`} className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Cargar por plantilla →
        </Link>
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 20 }}>
        Mercadería de venta al público comprada ya terminada para revender (ej. gaseosa, agua) — cada producto tiene
        su propio stock y costo, igual que un insumo. Para cargar la primera mercadería o registrar una compra usa
        "Ajustar stock"; las ventas del POS descuentan el stock automáticamente.
      </p>

      {!mostrarForm ? (
        <button className="btn-primary" onClick={() => setMostrarForm(true)} style={{ marginBottom: 20 }}>
          + Nuevo producto
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
              <label>Tipo</label>
              <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                <option value="producto">Producto</option>
                <option value="servicio">Servicio</option>
              </select>
            </div>
            <div className="field">
              <label>Precio de venta (S/)</label>
              <input
                type="number"
                step="0.01"
                value={form.precioVenta}
                onChange={(e) => setForm({ ...form, precioVenta: Number(e.target.value) })}
                required
              />
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

          {error && <p className="field error" style={{ marginTop: 12 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button type="submit" className="btn-primary">Crear producto</button>
            <button type="button" className="btn-ghost" onClick={() => setMostrarForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {productos.map((p) => (
          <div key={p.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>
                  {p.nombre} {p.bajoMinimo && <span style={{ color: "var(--alert)", fontSize: 11 }}>· bajo mínimo</span>}
                </p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {p.categoria ?? "Sin categoría"} · {p.tipo} {p.unidadMedida ? `· ${p.unidadMedida}` : ""}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p className="mono" style={{ fontSize: 13 }}>Precio: S/ {Number(p.precioVenta).toFixed(2)}</p>
                <p className="mono" style={{ fontSize: 13 }}>Stock: {p.stockActual}</p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  Costo prom: S/ {Number(p.costoPromedioActual).toFixed(4)} · Margen: S/ {p.margen}
                </p>
              </div>
            </div>

            {editando === p.id && (
              <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div className="field">
                    <label>Nombre</label>
                    <input
                      value={editForm.nombre}
                      onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Código (opcional)</label>
                    <input
                      value={editForm.codigo}
                      onChange={(e) => setEditForm({ ...editForm, codigo: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Categoría</label>
                    <select
                      value={editForm.categoriaId}
                      onChange={(e) => setEditForm({ ...editForm, categoriaId: e.target.value })}
                    >
                      <option value="">Sin categoría</option>
                      {categorias.map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Tipo</label>
                    <select
                      value={editForm.tipo}
                      onChange={(e) => setEditForm({ ...editForm, tipo: e.target.value })}
                    >
                      <option value="producto">Producto</option>
                      <option value="servicio">Servicio</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Precio de venta (S/)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.precioVenta}
                      onChange={(e) => setEditForm({ ...editForm, precioVenta: Number(e.target.value) })}
                    />
                  </div>
                  <div className="field">
                    <label>Unidad de medida</label>
                    <select
                      value={editForm.unidadMedidaId}
                      onChange={(e) => setEditForm({ ...editForm, unidadMedidaId: e.target.value })}
                    >
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
                      value={editForm.stockMinimo}
                      onChange={(e) => setEditForm({ ...editForm, stockMinimo: Number(e.target.value) })}
                    />
                  </div>
                </div>
                {errorEdicion && <p className="field error">{errorEdicion}</p>}
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn-primary" onClick={() => handleGuardarEdicion(p.id)}>Guardar cambios</button>
                  <button className="btn-ghost" onClick={() => setEditando(null)}>Cancelar</button>
                </div>
              </div>
            )}

            {ajustando === p.id ? (
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
                  <button className="btn-primary" onClick={() => handleAjustar(p.id)}>Confirmar ajuste</button>
                  <button className="btn-ghost" onClick={() => setAjustando(null)}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: "6px 12px" }}
                  onClick={() => iniciarEdicion(p)}
                >
                  Editar
                </button>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: "6px 12px" }}
                  onClick={() => { setAjustando(p.id); setError(null); }}
                >
                  Ajustar stock
                </button>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: "6px 12px", color: "var(--alert)", marginLeft: "auto" }}
                  disabled={eliminandoId === p.id}
                  onClick={() => handleEliminar(p)}
                >
                  {eliminandoId === p.id ? "Eliminando..." : "Eliminar"}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
