"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NATURALEZAS_EGRESO, CATEGORIAS_POR_NATURALEZA } from "@/lib/naturalezaEgreso";
import { TIPOS_COMPROBANTE } from "@/lib/tiposComprobante";

type Cxp = {
  id: string;
  proveedorNombre: string | null;
  descripcionGasto: string;
  montoTotal: string;
  saldoPendiente: string;
  fechaEmision: string;
  estado: string;
};
type CuentaOpcion = { id: string; bancoNombre: string; saldoActual: string };
type LocalOpcion = { id: string; nombre: string };

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function CuentasPorPagarPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [cxps, setCxps] = useState<Cxp[]>([]);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaOpcion[]>([]);
  const [locales, setLocales] = useState<LocalOpcion[]>([]);
  const [pagando, setPagando] = useState<string | null>(null);
  const [montoPago, setMontoPago] = useState(0);
  const [cuentaPago, setCuentaPago] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mostrarPagadas, setMostrarPagadas] = useState(false);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [form, setForm] = useState({
    localId: "",
    naturaleza: "gasto_operativo",
    categoriaEspecifica: CATEGORIAS_POR_NATURALEZA.gasto_operativo[0],
    proveedorNombre: "",
    descripcion: "",
    tipoComprobante: "factura",
    numeroComprobante: "",
    montoTotal: 0,
    fecha: hoyISO(),
    fechaVencimiento: "",
  });

  async function cargar() {
    const [resCxp, resCatalogos] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/cuentas-por-pagar`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/catalogos`).then((r) => r.json()),
    ]);
    setCxps(resCxp);
    setCuentasBancarias(resCatalogos.cuentasBancarias ?? []);
    setLocales(resCatalogos.locales ?? []);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const categoriasDisponibles = CATEGORIAS_POR_NATURALEZA[form.naturaleza] ?? [];

  function cambiarNaturaleza(naturaleza: string) {
    setForm({ ...form, naturaleza, categoriaEspecifica: CATEGORIAS_POR_NATURALEZA[naturaleza]?.[0] ?? "" });
  }

  async function handleCrearFactura(e: React.FormEvent) {
    e.preventDefault();
    setErrorForm(null);
    setGuardando(true);

    const res = await fetch(`/api/empresas/${empresaId}/cuentas-por-pagar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setGuardando(false);

    if (!res.ok) {
      const data = await res.json();
      setErrorForm(data.error?.toString() ?? "No se pudo registrar la factura.");
      return;
    }

    setForm({ ...form, proveedorNombre: "", descripcion: "", numeroComprobante: "", montoTotal: 0, fechaVencimiento: "" });
    setMostrarForm(false);
    cargar();
  }

  const totalPorPagar = cxps.filter((c) => c.estado !== "pagada").reduce((acc, c) => acc + Number(c.saldoPendiente), 0);
  const cxpsVisibles = mostrarPagadas ? cxps : cxps.filter((c) => c.estado !== "pagada");
  const cantidadPagadas = cxps.filter((c) => c.estado === "pagada").length;

  async function handlePago(cxpId: string) {
    setError(null);
    const res = await fetch(`/api/empresas/${empresaId}/cuentas-por-pagar/${cxpId}/pago`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monto: montoPago, cuentaBancariaId: cuentaPago || undefined }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo registrar el pago.");
      return;
    }
    setPagando(null);
    setMontoPago(0);
    cargar();
  }

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>Cuentas por pagar</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Cuentas por pagar</h1>
      <p className="mono" style={{ fontSize: 12, color: "var(--alert)", marginBottom: 20 }}>
        Total por pagar: S/ {totalPorPagar.toFixed(2)}
      </p>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 12 }}>
        Las cuentas por pagar también se generan automáticamente al registrar un gasto "al crédito" en Gastos y Costos.
        Puedes pagarlas de una sola vez o en varios abonos.
      </p>

      {!mostrarForm ? (
        <button className="btn-primary" style={{ marginBottom: 20 }} onClick={() => setMostrarForm(true)}>
          + Registrar factura
        </button>
      ) : (
        <form onSubmit={handleCrearFactura} className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Registrar factura por pagar</h3>
          <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 12 }}>
            Para una factura que llega directamente al área de pagos, sin pasar por una compra o solicitud previa.
            Queda pendiente de pago de inmediato y también se clasifica en Gastos y Costos.
          </p>

          <div className="field">
            <label>Proveedor</label>
            <input
              value={form.proveedorNombre}
              onChange={(e) => setForm({ ...form, proveedorNombre: e.target.value })}
              placeholder="Ej: Distribuidora XYZ"
              required
            />
          </div>
          <div className="field">
            <label>Descripción</label>
            <input
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Ej: Factura F001-00234 — insumos del mes"
              required
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {locales.length > 0 && (
              <div className="field">
                <label>Local (opcional)</label>
                <select value={form.localId} onChange={(e) => setForm({ ...form, localId: e.target.value })}>
                  <option value="">Consolidado (sin local específico)</option>
                  {locales.map((l) => (
                    <option key={l.id} value={l.id}>{l.nombre}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label>Naturaleza del egreso</label>
              <select value={form.naturaleza} onChange={(e) => cambiarNaturaleza(e.target.value)}>
                {NATURALEZAS_EGRESO.map((n) => (
                  <option key={n.value} value={n.value}>{n.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Categoría específica</label>
              <select value={form.categoriaEspecifica} onChange={(e) => setForm({ ...form, categoriaEspecifica: e.target.value })}>
                {categoriasDisponibles.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
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
              <label>N° de comprobante (opcional)</label>
              <input value={form.numeroComprobante} onChange={(e) => setForm({ ...form, numeroComprobante: e.target.value })} placeholder="Ej: F001-00234" />
            </div>
            <div className="field">
              <label>Monto total (S/)</label>
              <input type="number" step="0.01" value={form.montoTotal} onChange={(e) => setForm({ ...form, montoTotal: Number(e.target.value) })} required />
            </div>
            <div className="field">
              <label>Fecha de emisión</label>
              <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
            </div>
            <div className="field">
              <label>Fecha de vencimiento (opcional)</label>
              <input type="date" value={form.fechaVencimiento} onChange={(e) => setForm({ ...form, fechaVencimiento: e.target.value })} />
            </div>
          </div>

          {errorForm && <p className="field error">{errorForm}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? "Guardando..." : "Registrar factura"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => { setMostrarForm(false); setErrorForm(null); }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {cantidadPagadas > 0 && (
        <label className="checkbox-row mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 20 }}>
          <input type="checkbox" checked={mostrarPagadas} onChange={(e) => setMostrarPagadas(e.target.checked)} />
          Mostrar también las {cantidadPagadas} ya pagadas
        </label>
      )}

      {cxpsVisibles.length === 0 ? (
        <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
          {cxps.length === 0 ? "No hay cuentas por pagar registradas." : "No tienes cuentas por pagar pendientes."}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cxpsVisibles.map((c) => (
            <div key={c.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500 }}>{c.proveedorNombre ?? "Proveedor sin nombre"}</p>
                  <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                    {c.descripcionGasto} · {new Date(c.fechaEmision).toLocaleDateString("es-PE", { timeZone: "UTC" })}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p className="mono" style={{ fontSize: 14 }}>
                    S/ {Number(c.saldoPendiente).toFixed(2)}{" "}
                    <span style={{ fontSize: 10, color: "var(--ink-soft)" }}>/ {Number(c.montoTotal).toFixed(2)}</span>
                  </p>
                  <p className="mono" style={{ fontSize: 10, textTransform: "uppercase", color: c.estado === "pagada" ? "var(--teal)" : "var(--stamp)" }}>
                    {c.estado}
                  </p>
                </div>
              </div>

              {c.estado !== "pagada" && (
                pagando === c.id ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: cuentasBancarias.length > 0 ? 8 : 0 }}>
                      <input
                        type="number"
                        step="0.01"
                        value={montoPago}
                        onChange={(e) => setMontoPago(Number(e.target.value))}
                        style={{ flex: 1, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 2 }}
                      />
                      <button className="btn-primary" style={{ padding: "8px 14px", fontSize: 12 }} onClick={() => handlePago(c.id)}>
                        Confirmar
                      </button>
                      <button className="btn-ghost" style={{ padding: "8px 14px", fontSize: 12 }} onClick={() => setPagando(null)}>
                        Cancelar
                      </button>
                    </div>
                    {cuentasBancarias.length > 0 && (
                      <select
                        value={cuentaPago}
                        onChange={(e) => setCuentaPago(e.target.value)}
                        style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 2, fontSize: 12 }}
                      >
                        <option value="">¿De qué cuenta sale? (opcional, para el flujo de caja)</option>
                        {cuentasBancarias.map((cb) => (
                          <option key={cb.id} value={cb.id}>{cb.bancoNombre} (S/ {Number(cb.saldoActual).toFixed(2)})</option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : (
                  <button
                    className="btn-ghost"
                    style={{ marginTop: 10, fontSize: 12, padding: "6px 12px" }}
                    onClick={() => { setPagando(c.id); setMontoPago(Number(c.saldoPendiente)); setCuentaPago(""); setError(null); }}
                  >
                    Registrar pago
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
      {error && <p className="field error" style={{ marginTop: 12 }}>{error}</p>}
    </main>
  );
}
