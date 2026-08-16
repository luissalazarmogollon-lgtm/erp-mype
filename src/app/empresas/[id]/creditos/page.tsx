"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Cxc = {
  id: string;
  cliente: string;
  clienteRuc: string | null;
  numeroFactura: string | null;
  descripcion: string | null;
  montoTotal: string;
  saldoPendiente: string;
  fechaEmision: string;
  estado: string;
};
type ClienteOpcion = { id: string; nombre: string; docIdentidad: string | null };

const MEDIOS_PAGO = ["Efectivo", "Tarjeta", "Plin", "Yape", "Transferencia"];

export default function CreditosPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [cxcs, setCxcs] = useState<Cxc[]>([]);
  const [clientes, setClientes] = useState<ClienteOpcion[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false);
  const [cobrando, setCobrando] = useState<string | null>(null);
  const [montoCobro, setMontoCobro] = useState(0);
  const [medioPagoCobro, setMedioPagoCobro] = useState("Efectivo");
  const [cuentaCobro, setCuentaCobro] = useState("");
  const [cuentasBancarias, setCuentasBancarias] = useState<{ id: string; bancoNombre: string; saldoActual: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ clienteId: "", numeroFactura: "", montoTotal: 0, descripcion: "" });
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: "", docIdentidad: "", telefono: "" });

  async function cargar() {
    const [resCxc, resClientes, resCatalogos] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/cuentas-por-cobrar`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/clientes`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/catalogos`).then((r) => r.json()),
    ]);
    setCxcs(resCxc);
    setClientes(resClientes);
    setCuentasBancarias(resCatalogos.cuentasBancarias ?? []);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const totalPorCobrar = cxcs.filter((c) => c.estado !== "pagada").reduce((acc, c) => acc + Number(c.saldoPendiente), 0);

  async function crearCliente() {
    const res = await fetch(`/api/empresas/${empresaId}/clientes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nuevoCliente),
    });
    if (res.ok) {
      const data = await res.json();
      await cargar();
      setForm({ ...form, clienteId: data.id });
      setNuevoCliente({ nombre: "", docIdentidad: "", telefono: "" });
      setMostrarNuevoCliente(false);
    }
  }

  async function handleCrearCredito(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.montoTotal <= 0) {
      setError("El monto debe ser mayor a 0.");
      return;
    }
    const res = await fetch(`/api/empresas/${empresaId}/cuentas-por-cobrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo registrar el crédito.");
      return;
    }
    setForm({ clienteId: "", numeroFactura: "", montoTotal: 0, descripcion: "" });
    setMostrarForm(false);
    cargar();
  }

  async function handleCobro(cxcId: string) {
    setError(null);
    if (montoCobro <= 0) {
      setError("El monto del cobro debe ser mayor a 0.");
      return;
    }
    const res = await fetch(`/api/empresas/${empresaId}/cuentas-por-cobrar/${cxcId}/cobro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monto: montoCobro,
        medioPago: medioPagoCobro,
        cuentaBancariaId: cuentaCobro || undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo registrar el cobro.");
      return;
    }
    setCobrando(null);
    setMontoCobro(0);
    cargar();
  }

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>Créditos (CxC)</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Créditos a clientes</h1>
      <p className="mono" style={{ fontSize: 12, color: "var(--alert)", marginBottom: 20 }}>
        Total por cobrar: S/ {totalPorCobrar.toFixed(2)}
      </p>

      {!mostrarForm ? (
        <button className="btn-primary" onClick={() => setMostrarForm(true)} style={{ marginBottom: 20 }}>
          + Registrar nuevo crédito
        </button>
      ) : (
        <form onSubmit={handleCrearCredito} className="card" style={{ marginBottom: 20 }}>
          <div className="field">
            <label>Cliente</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })} required style={{ flex: 1 }}>
                <option value="">Selecciona...</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}{c.docIdentidad ? ` — RUC ${c.docIdentidad}` : ""}</option>
                ))}
              </select>
              <button type="button" className="btn-ghost" onClick={() => setMostrarNuevoCliente(!mostrarNuevoCliente)} style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                + Nuevo cliente
              </button>
            </div>
          </div>

          {mostrarNuevoCliente && (
            <div className="card" style={{ marginBottom: 16, background: "var(--paper)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div className="field" style={{ marginBottom: 8 }}>
                  <label>Nombre del cliente</label>
                  <input value={nuevoCliente.nombre} onChange={(e) => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })} />
                </div>
                <div className="field" style={{ marginBottom: 8 }}>
                  <label>RUC / DNI (opcional)</label>
                  <input value={nuevoCliente.docIdentidad} onChange={(e) => setNuevoCliente({ ...nuevoCliente, docIdentidad: e.target.value })} />
                </div>
                <div className="field" style={{ marginBottom: 0, gridColumn: "span 2" }}>
                  <label>Teléfono (opcional)</label>
                  <input value={nuevoCliente.telefono} onChange={(e) => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })} />
                </div>
              </div>
              <button type="button" className="btn-primary" onClick={crearCliente} style={{ marginTop: 10 }}>
                Crear cliente
              </button>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>N° de factura (opcional)</label>
              <input value={form.numeroFactura} onChange={(e) => setForm({ ...form, numeroFactura: e.target.value })} placeholder="Ej: F001-00234" />
            </div>
            <div className="field">
              <label>Monto de la factura (S/)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.montoTotal}
                onChange={(e) => setForm({ ...form, montoTotal: Math.max(0, Number(e.target.value)) })}
                required
              />
            </div>
          </div>
          <div className="field">
            <label>Descripción (opcional)</label>
            <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Ej: consumo del 12/08" />
          </div>

          {error && <p className="field error">{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="btn-primary">Registrar crédito</button>
            <button type="button" className="btn-ghost" onClick={() => setMostrarForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {cxcs.map((c) => (
          <div key={c.id} className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>
                  {c.cliente}{c.clienteRuc ? ` — RUC ${c.clienteRuc}` : ""}
                </p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {c.numeroFactura ? `Factura ${c.numeroFactura} · ` : ""}
                  {c.descripcion ?? "-"} · {new Date(c.fechaEmision).toLocaleDateString("es-PE", { timeZone: "UTC" })}
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
              cobrando === c.id ? (
                <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={montoCobro}
                      onChange={(e) => setMontoCobro(Math.max(0, Number(e.target.value)))}
                      placeholder="Monto cobrado"
                      style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 2 }}
                    />
                    <select
                      value={medioPagoCobro}
                      onChange={(e) => setMedioPagoCobro(e.target.value)}
                      style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 2, fontSize: 13 }}
                    >
                      {MEDIOS_PAGO.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  {cuentasBancarias.length > 0 && (
                    <select
                      value={cuentaCobro}
                      onChange={(e) => setCuentaCobro(e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 2, fontSize: 12, marginBottom: 8 }}
                    >
                      <option value="">¿A qué cuenta entra? (opcional, para el flujo de caja)</option>
                      {cuentasBancarias.map((cb) => (
                        <option key={cb.id} value={cb.id}>{cb.bancoNombre} (S/ {Number(cb.saldoActual).toFixed(2)})</option>
                      ))}
                    </select>
                  )}
                  {error && <p className="field error">{error}</p>}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn-primary" style={{ padding: "8px 14px", fontSize: 12 }} onClick={() => handleCobro(c.id)}>
                      Confirmar
                    </button>
                    <button className="btn-ghost" style={{ padding: "8px 14px", fontSize: 12 }} onClick={() => setCobrando(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="btn-ghost"
                  style={{ marginTop: 10, fontSize: 12, padding: "6px 12px" }}
                  onClick={() => {
                    setCobrando(c.id);
                    setMontoCobro(Number(c.saldoPendiente));
                    setMedioPagoCobro("Efectivo");
                    setCuentaCobro("");
                    setError(null);
                  }}
                >
                  Registrar cobro
                </button>
              )
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
