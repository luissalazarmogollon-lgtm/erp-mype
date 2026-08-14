"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Gasto = {
  id: string;
  categoria: string;
  proveedorNombre: string | null;
  descripcion: string;
  tipoComprobante: string;
  montoTotal: string;
  fecha: string;
  esCostoDirecto: boolean;
  condicion: string;
  estadoPago: string;
};
type Catalogo = { id: string; nombre: string };

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

const TIPOS_COMPROBANTE = [
  { value: "boleta", label: "Boleta" },
  { value: "factura", label: "Factura" },
  { value: "recibo_honorarios", label: "Recibo por honorarios" },
  { value: "ticket", label: "Ticket" },
  { value: "sin_comprobante", label: "Sin comprobante" },
];

export default function GastosPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [tiposGasto, setTiposGasto] = useState<Catalogo[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [form, setForm] = useState({
    categoriaId: "",
    proveedorNombre: "",
    descripcion: "",
    tipoComprobante: "boleta",
    montoTotal: 0,
    fecha: hoyISO(),
    esCostoDirecto: false,
    condicion: "contado",
    medioPago: "Efectivo",
    fechaVencimiento: "",
  });

  async function cargar() {
    const [resGastos, resCatalogos] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/gastos`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/catalogos`).then((r) => r.json()),
    ]);
    setGastos(resGastos);
    setTiposGasto(resCatalogos.tiposGasto ?? []);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const totalCostoDirecto = gastos.filter((g) => g.esCostoDirecto).reduce((acc, g) => acc + Number(g.montoTotal), 0);
  const totalGastoOperativo = gastos.filter((g) => !g.esCostoDirecto).reduce((acc, g) => acc + Number(g.montoTotal), 0);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);

    const res = await fetch(`/api/empresas/${empresaId}/gastos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setGuardando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo registrar el gasto.");
      return;
    }

    setForm({ ...form, descripcion: "", montoTotal: 0, proveedorNombre: "" });
    setMostrarForm(false);
    cargar();
  }

  return (
    <main style={{ maxWidth: 750, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>Gastos y Costos</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Gastos y Costos</h1>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 20 }}>
        Costo directo: S/ {totalCostoDirecto.toFixed(2)} · Gasto operativo: S/ {totalGastoOperativo.toFixed(2)}
      </p>

      {!mostrarForm ? (
        <button className="btn-primary" onClick={() => setMostrarForm(true)} style={{ marginBottom: 20 }}>
          + Registrar gasto/costo
        </button>
      ) : (
        <form onSubmit={handleCrear} className="card" style={{ marginBottom: 20 }}>
          <div className="field">
            <label>Descripción</label>
            <input
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Ej: Compra de pollo, factura Distribuidora XYZ"
              required
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>Categoría</label>
              <select value={form.categoriaId} onChange={(e) => setForm({ ...form, categoriaId: e.target.value })}>
                <option value="">Sin categoría</option>
                {tiposGasto.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>¿Costo directo o gasto operativo?</label>
              <select
                value={form.esCostoDirecto ? "costo" : "gasto"}
                onChange={(e) => setForm({ ...form, esCostoDirecto: e.target.value === "costo" })}
              >
                <option value="gasto">Gasto operativo (alquiler, servicios, marketing...)</option>
                <option value="costo">Costo directo (insumos, materia prima...)</option>
              </select>
            </div>
            <div className="field">
              <label>Proveedor (opcional)</label>
              <input value={form.proveedorNombre} onChange={(e) => setForm({ ...form, proveedorNombre: e.target.value })} />
            </div>
            <div className="field">
              <label>Tipo de comprobante</label>
              <select value={form.tipoComprobante} onChange={(e) => setForm({ ...form, tipoComprobante: e.target.value })}>
                {TIPOS_COMPROBANTE.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Monto total (S/)</label>
              <input type="number" step="0.01" value={form.montoTotal} onChange={(e) => setForm({ ...form, montoTotal: Number(e.target.value) })} required />
            </div>
            <div className="field">
              <label>Fecha</label>
              <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
            </div>
          </div>

          <div className="field">
            <label>¿Cómo se pagó?</label>
            <select value={form.condicion} onChange={(e) => setForm({ ...form, condicion: e.target.value })}>
              <option value="contado">Al contado (ya se pagó)</option>
              <option value="credito">Al crédito (genera cuenta por pagar)</option>
            </select>
          </div>

          {form.condicion === "contado" ? (
            <div className="field">
              <label>Medio de pago</label>
              <select value={form.medioPago} onChange={(e) => setForm({ ...form, medioPago: e.target.value })}>
                <option value="Efectivo">Efectivo</option>
                <option value="Yape/Plin">Yape/Plin</option>
                <option value="Tarjeta">Tarjeta</option>
                <option value="Transferencia">Transferencia</option>
              </select>
            </div>
          ) : (
            <div className="field">
              <label>Fecha de vencimiento (opcional)</label>
              <input type="date" value={form.fechaVencimiento} onChange={(e) => setForm({ ...form, fechaVencimiento: e.target.value })} />
            </div>
          )}

          {error && <p className="field error">{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? "Guardando..." : "Registrar"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setMostrarForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {gastos.map((g) => (
          <div key={g.id} className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{g.descripcion}</p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {g.categoria} · {g.esCostoDirecto ? "Costo directo" : "Gasto operativo"} · {new Date(g.fecha).toLocaleDateString("es-PE")}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p className="mono" style={{ fontSize: 14 }}>S/ {Number(g.montoTotal).toFixed(2)}</p>
                <p className="mono" style={{ fontSize: 10, textTransform: "uppercase", color: g.estadoPago === "pendiente" ? "var(--stamp)" : "var(--teal)" }}>
                  {g.condicion === "credito" ? g.estadoPago : "pagado"}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
