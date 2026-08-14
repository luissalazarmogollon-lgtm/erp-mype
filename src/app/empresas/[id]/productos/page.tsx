"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Producto = {
  id: string;
  nombre: string;
  categoria: string | null;
  tipo: string;
  precioVenta: string;
  requiereReceta: boolean;
  costoEstimadoActual: string;
  receta: { insumoNombre: string; cantidadRequerida: string; costoInsumo: string }[];
};

type Catalogo = { id: string; nombre: string };
type InsumoOpcion = { id: string; nombre: string; costoPromedioActual: string };

export default function ProductosPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Catalogo[]>([]);
  const [insumos, setInsumos] = useState<InsumoOpcion[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    nombre: "",
    codigo: "",
    categoriaId: "",
    tipo: "producto",
    precioVenta: 0,
    requiereReceta: false,
  });
  const [receta, setReceta] = useState<{ insumoId: string; cantidadRequerida: number }[]>([]);

  async function cargarTodo() {
    const [resProductos, resCatalogos] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/productos`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/catalogos`).then((r) => r.json()),
    ]);
    setProductos(resProductos);
    setCategorias(resCatalogos.categoriasProducto ?? []);
    setInsumos(resCatalogos.insumos ?? []);
  }

  useEffect(() => {
    cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  function agregarLineaReceta() {
    if (insumos.length === 0) return;
    setReceta([...receta, { insumoId: insumos[0].id, cantidadRequerida: 0 }]);
  }

  function actualizarLineaReceta(index: number, campo: "insumoId" | "cantidadRequerida", valor: string | number) {
    const nueva = [...receta];
    nueva[index] = { ...nueva[index], [campo]: valor };
    setReceta(nueva);
  }

  function quitarLineaReceta(index: number) {
    setReceta(receta.filter((_, i) => i !== index));
  }

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.requiereReceta && receta.length === 0) {
      setError("Agrega al menos un insumo a la receta, o desmarca 'Requiere receta'.");
      return;
    }

    const res = await fetch(`/api/empresas/${empresaId}/productos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, receta }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo crear el producto.");
      return;
    }

    setForm({ nombre: "", codigo: "", categoriaId: "", tipo: "producto", precioVenta: 0, requiereReceta: false });
    setReceta([]);
    setMostrarForm(false);
    cargarTodo();
  }

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>Productos</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 20 }}>Productos</h1>

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
          </div>

          <div className="field checkbox-row" style={{ marginTop: 4 }}>
            <input
              type="checkbox"
              id="requiereReceta"
              checked={form.requiereReceta}
              onChange={(e) => setForm({ ...form, requiereReceta: e.target.checked })}
            />
            <label htmlFor="requiereReceta" style={{ marginBottom: 0 }}>
              Este producto se prepara con insumos (necesita ficha técnica / receta)
            </label>
          </div>

          {form.requiereReceta && (
            <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 10 }}>
                RECETA — cuánto de cada insumo lleva este producto
              </p>
              {receta.map((linea, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <select
                    value={linea.insumoId}
                    onChange={(e) => actualizarLineaReceta(i, "insumoId", e.target.value)}
                    style={{ flex: 2 }}
                  >
                    {insumos.map((ins) => (
                      <option key={ins.id} value={ins.id}>{ins.nombre}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.0001"
                    placeholder="Cantidad"
                    value={linea.cantidadRequerida}
                    onChange={(e) => actualizarLineaReceta(i, "cantidadRequerida", Number(e.target.value))}
                    style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 2 }}
                  />
                  <button type="button" className="rm-btn" onClick={() => quitarLineaReceta(i)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--ink-soft)" }}>
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="btn-ghost" onClick={agregarLineaReceta} style={{ fontSize: 12, padding: "6px 12px" }}>
                + Agregar insumo a la receta
              </button>
            </div>
          )}

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
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{p.nombre}</p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {p.categoria ?? "Sin categoría"} · {p.tipo}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p className="mono" style={{ fontSize: 13 }}>Precio: S/ {Number(p.precioVenta).toFixed(2)}</p>
                {p.requiereReceta && (
                  <p className="mono" style={{ fontSize: 11, color: "var(--teal, #20554e)" }}>
                    Costo receta: S/ {Number(p.costoEstimadoActual).toFixed(2)} · Margen: S/{" "}
                    {(Number(p.precioVenta) - Number(p.costoEstimadoActual)).toFixed(2)}
                  </p>
                )}
              </div>
            </div>
            {p.requiereReceta && p.receta.length > 0 && (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                {p.receta.map((r, i) => (
                  <p key={i} className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                    {r.cantidadRequerida} × {r.insumoNombre} (S/ {Number(r.costoInsumo).toFixed(4)}/u)
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
