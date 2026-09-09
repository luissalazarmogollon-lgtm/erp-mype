"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Este mismo módulo ("ventas_diarias" — el permiso no cambió de nombre a
// propósito, para no tener que reasignarlo a nadie) sirve dos pantallas
// muy distintas según el tipo de negocio de la empresa:
//
//  - Productos / Mixta: la caja registradora diaria de siempre
//    (VentasDiariasClasica) — total del día por método de pago.
//  - Servicios: Facturación (FacturacionServicios) — una empresa de
//    servicios no tiene caja registradora, factura a sus clientes. Este
//    formulario registra directamente en Cuentas por Cobrar (cliente,
//    RUC, N° de factura, detalle y si está pagada o no), con la misma
//    lógica de registrar-y-luego-liquidar que Cuentas por Pagar.
//
// Quién ve cuál se decide con `esServicios`, que vive en /mi-acceso.
export default function VentasDiariasORFacturacionPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [esServicios, setEsServicios] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`/api/empresas/${empresaId}/mi-acceso`)
      .then((r) => r.json())
      .then((data) => setEsServicios(Boolean(data.esServicios)));
  }, [empresaId]);

  if (esServicios === null) {
    return (
      <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px" }}>
        <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>Cargando…</p>
      </main>
    );
  }

  return esServicios ? <FacturacionServicios empresaId={empresaId} /> : <VentasDiariasClasica empresaId={empresaId} />;
}

// ---------------------------------------------------------------------
// Productos / Mixta — caja registradora diaria (sin cambios de lógica).
// ---------------------------------------------------------------------

type LegResumen = {
  depositado: string;
  pendiente: string;
  excedente: string | null;
  depositos: { cuenta: string; monto: string; fecha: string }[];
};
type Registro = {
  id: string;
  local: string | null;
  fecha: string;
  montoEfectivo: string;
  montoYape: string;
  montoPlin: string;
  montoTarjeta: string;
  total: string;
  observacion: string | null;
  conciliacion: {
    efectivo: LegResumen;
    yape: LegResumen;
    plin: LegResumen;
    tarjeta: LegResumen;
  };
};
type LocalOpcion = { id: string; nombre: string };
type CuentaOpcion = { id: string; bancoNombre: string };
type EntradaDeposito = { cuentaBancariaId: string; monto: number };

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

const LEGS = [
  { key: "efectivo" as const, monto: "montoEfectivo" as const, label: "Efectivo" },
  { key: "yape" as const, monto: "montoYape" as const, label: "Yape" },
  { key: "plin" as const, monto: "montoPlin" as const, label: "Plin" },
  { key: "tarjeta" as const, monto: "montoTarjeta" as const, label: "Tarjeta" },
];

function VentasDiariasClasica({ empresaId }: { empresaId: string }) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [locales, setLocales] = useState<LocalOpcion[]>([]);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaOpcion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [conciliando, setConciliando] = useState<string | null>(null);
  const [formConciliar, setFormConciliar] = useState<Record<string, EntradaDeposito>>({});
  // Actualizar Flujo de Caja (conciliar) es un permiso granular aparte —
  // el superadmin siempre lo tiene, y además se le puede asignar a
  // cualquier persona que apoye sin darle acceso total. `accesoTotal`
  // cubre tanto al superadmin como a alguien con acceso total en esta
  // empresa; `permisos` cubre a quien solo tiene este permiso puntual.
  const [puedeConciliar, setPuedeConciliar] = useState(false);
  const [fechasAbiertas, setFechasAbiertas] = useState<Record<string, boolean>>({});

  const [form, setForm] = useState({
    localId: "",
    fecha: hoyISO(),
    montoEfectivo: 0,
    montoYape: 0,
    montoPlin: 0,
    montoTarjeta: 0,
    observacion: "",
  });

  async function cargar() {
    const [resRegistros, resCatalogos, resAcceso] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/ventas-diarias`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/catalogos`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/mi-acceso`).then((r) => r.json()),
    ]);
    setRegistros(resRegistros);
    setLocales(resCatalogos.locales ?? []);
    setCuentasBancarias(resCatalogos.cuentasBancarias ?? []);
    if (!resAcceso.error) {
      setPuedeConciliar(
        Boolean(resAcceso.esSuperadminPlataforma) ||
          Boolean(resAcceso.accesoTotal) ||
          (resAcceso.permisos ?? []).includes("conciliar_ventas_diarias")
      );
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const totalForm = form.montoEfectivo + form.montoYape + form.montoPlin + form.montoTarjeta;

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);

    const res = await fetch(`/api/empresas/${empresaId}/ventas-diarias`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setGuardando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo guardar el registro.");
      return;
    }

    setForm({ ...form, montoEfectivo: 0, montoYape: 0, montoPlin: 0, montoTarjeta: 0, observacion: "" });
    cargar();
  }

  async function handleConciliar(registroId: string) {
    setError(null);
    // Solo se envían los métodos con monto y cuenta indicados — el monto
    // depositado puede ser distinto (menor o mayor) al monto registrado
    // en la venta del día; no hace falta llenar todos los pendientes de
    // una sola vez.
    const body: Record<string, EntradaDeposito> = {};
    for (const [key, entrada] of Object.entries(formConciliar)) {
      if (entrada.cuentaBancariaId && entrada.monto > 0) body[key] = entrada;
    }
    if (Object.keys(body).length === 0) {
      setError("Indica el monto depositado y la cuenta de al menos un método de pago.");
      return;
    }
    const res = await fetch(`/api/empresas/${empresaId}/ventas-diarias/${registroId}/conciliar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo actualizar el flujo de caja.");
      return;
    }
    setConciliando(null);
    setFormConciliar({});
    cargar();
  }

  async function handleEliminar(registroId: string) {
    if (!confirm("¿Eliminar este registro de ventas diarias? Esta acción no se puede deshacer.")) return;
    setError(null);
    const res = await fetch(`/api/empresas/${empresaId}/ventas-diarias/${registroId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo eliminar el registro.");
      return;
    }
    cargar();
  }

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>Ventas diarias</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Ventas diarias</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 20 }}>
        Registra el total que te reporta el punto de venta del cliente, por método de pago
        {locales.length > 0 ? " y por local" : ""}. Después, desde cada registro, puedes indicar a qué cuenta
        bancaria entró cada método de pago para que se refleje en el Flujo de Caja.
      </p>

      <form onSubmit={handleGuardar} className="card" style={{ marginBottom: 24 }}>
        {locales.length > 0 && (
          <div className="field">
            <label>Local</label>
            <select value={form.localId} onChange={(e) => setForm({ ...form, localId: e.target.value })}>
              <option value="">Consolidado (sin local específico)</option>
              {locales.map((l) => (
                <option key={l.id} value={l.id}>{l.nombre}</option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label>Fecha</label>
          <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label>Efectivo (S/)</label>
            <input type="number" step="0.01" value={form.montoEfectivo} onChange={(e) => setForm({ ...form, montoEfectivo: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Yape (S/)</label>
            <input type="number" step="0.01" value={form.montoYape} onChange={(e) => setForm({ ...form, montoYape: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Plin (S/)</label>
            <input type="number" step="0.01" value={form.montoPlin} onChange={(e) => setForm({ ...form, montoPlin: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>Tarjeta (S/)</label>
            <input type="number" step="0.01" value={form.montoTarjeta} onChange={(e) => setForm({ ...form, montoTarjeta: Number(e.target.value) })} />
          </div>
        </div>
        <div className="field">
          <label>Observación (opcional)</label>
          <input value={form.observacion} onChange={(e) => setForm({ ...form, observacion: e.target.value })} />
        </div>

        <p className="mono" style={{ fontSize: 14, marginBottom: 12 }}>Total del día: S/ {totalForm.toFixed(2)}</p>

        {error && <p className="field error">{error}</p>}
        <button type="submit" className="btn-primary" disabled={guardando}>
          {guardando ? "Guardando..." : "Guardar registro del día"}
        </button>
      </form>

      <h2 style={{ fontSize: 16, marginBottom: 12 }}>Historial</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {Array.from(new Set(registros.map((r) => r.fecha.slice(0, 10))))
          .sort((a, b) => (a < b ? 1 : -1))
          .map((fechaKey) => {
            const registrosDelDia = registros.filter((r) => r.fecha.slice(0, 10) === fechaKey);
            const totalDia = registrosDelDia.reduce((acc, r) => acc + Number(r.total), 0);
            const abierta = fechasAbiertas[fechaKey] ?? false;

            return (
              <div key={fechaKey} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <button
                  onClick={() => setFechasAbiertas({ ...fechasAbiertas, [fechaKey]: !abierta })}
                  style={{
                    width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: 14, background: "none", border: "none", cursor: "pointer", textAlign: "left",
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 500 }}>
                    {abierta ? "▾" : "▸"}{" "}
                    {new Date(fechaKey).toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" })}
                    {registrosDelDia.length > 1 && (
                      <span className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}> · {registrosDelDia.length} locales</span>
                    )}
                  </span>
                  <span className="mono" style={{ fontSize: 14, fontWeight: 500 }}>S/ {totalDia.toFixed(2)}</span>
                </button>

                {abierta && (
                  <div style={{ borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column" }}>
                    {registrosDelDia.map((r) => {
                      const legsPendientes = LEGS.filter(
                        (leg) => Number(r[leg.monto]) > 0 && Number(r.conciliacion[leg.key].pendiente) > 0.004
                      );
                      const tieneAlgoDepositado = LEGS.some((leg) => Number(r.conciliacion[leg.key].depositado) > 0.004);
                      return (
                        <div key={r.id} style={{ padding: 14, borderBottom: "1px solid var(--line)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 13.5 }}>{r.local ?? "Consolidado"}</span>
                            <span className="mono" style={{ fontSize: 13.5 }}>S/ {Number(r.total).toFixed(2)}</span>
                          </div>
                          <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 4 }}>
                            {LEGS.filter((leg) => Number(r[leg.monto]) > 0)
                              .map((leg) => {
                                const resumen = r.conciliacion[leg.key];
                                const pendiente = Number(resumen.pendiente);
                                let estado = "";
                                if (pendiente <= 0.004) {
                                  estado = resumen.excedente ? ` ✓ (excedente S/${resumen.excedente})` : " ✓";
                                } else if (Number(resumen.depositado) > 0.004) {
                                  estado = ` — depositado S/${resumen.depositado}, falta S/${resumen.pendiente}`;
                                } else {
                                  estado = " — sin depositar";
                                }
                                return `${leg.label} S/${Number(r[leg.monto]).toFixed(2)}${estado}`;
                              })
                              .join(" · ")}
                          </p>

                          {!tieneAlgoDepositado && (
                            <button
                              onClick={() => handleEliminar(r.id)}
                              style={{
                                marginTop: 8, fontSize: 11, background: "none", border: "none", cursor: "pointer",
                                color: "var(--alert)", padding: 0,
                              }}
                            >
                              Eliminar registro
                            </button>
                          )}

                          {puedeConciliar && cuentasBancarias.length > 0 && legsPendientes.length > 0 && (
                            conciliando === r.id ? (
                              <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                                {legsPendientes.map((leg) => {
                                  const resumen = r.conciliacion[leg.key];
                                  const pendiente = Number(resumen.pendiente);
                                  const entrada = formConciliar[leg.key] ?? { cuentaBancariaId: "", monto: pendiente };
                                  return (
                                    <div key={leg.key} className="field" style={{ marginBottom: 10 }}>
                                      <label>
                                        {leg.label} — registrado S/{Number(r[leg.monto]).toFixed(2)}
                                        {Number(resumen.depositado) > 0.004 && ` · ya depositado S/${resumen.depositado}`}
                                        {" "}· falta depositar S/{resumen.pendiente}
                                      </label>
                                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min="0"
                                          value={entrada.monto}
                                          onChange={(e) =>
                                            setFormConciliar({
                                              ...formConciliar,
                                              [leg.key]: { ...entrada, monto: Number(e.target.value) },
                                            })
                                          }
                                          placeholder="Monto depositado"
                                        />
                                        <select
                                          value={entrada.cuentaBancariaId}
                                          onChange={(e) =>
                                            setFormConciliar({
                                              ...formConciliar,
                                              [leg.key]: { ...entrada, cuentaBancariaId: e.target.value },
                                            })
                                          }
                                        >
                                          <option value="">¿A qué cuenta entró?</option>
                                          {cuentasBancarias.map((c) => (
                                            <option key={c.id} value={c.id}>{c.bancoNombre}</option>
                                          ))}
                                        </select>
                                      </div>
                                      {entrada.monto > 0 && entrada.monto < pendiente - 0.004 && (
                                        <p className="mono" style={{ fontSize: 11, color: "var(--stamp)", marginTop: 4 }}>
                                          Quedará pendiente por depositar S/{(pendiente - entrada.monto).toFixed(2)} de {leg.label}.
                                        </p>
                                      )}
                                      {entrada.monto > pendiente + 0.004 && (
                                        <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 4 }}>
                                          Depositas S/{(entrada.monto - pendiente).toFixed(2)} más de lo que faltaba — queda como excedente.
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                                {error && <p className="field error">{error}</p>}
                                <div style={{ display: "flex", gap: 10 }}>
                                  <button className="btn-primary" style={{ fontSize: 12, padding: "8px 14px" }} onClick={() => handleConciliar(r.id)}>
                                    Guardar
                                  </button>
                                  <button className="btn-ghost" style={{ fontSize: 12, padding: "8px 14px" }} onClick={() => setConciliando(null)}>
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                className="btn-ghost"
                                style={{ marginTop: 10, fontSize: 12, padding: "6px 12px" }}
                                onClick={() => { setConciliando(r.id); setFormConciliar({}); setError(null); }}
                              >
                                Actualizar flujo de caja
                              </button>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        {registros.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no hay ventas registradas.</p>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------
// Servicios — Facturación. Registra directamente en Cuentas por Cobrar
// (misma tabla y misma API que "Créditos (CxC)" — ver
// /empresas/[id]/creditos —, solo que aquí es la pantalla principal de
// ventas de una empresa de servicios, con el N° de factura y el detalle
// como campos centrales en vez de opcionales).
// ---------------------------------------------------------------------

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

function FacturacionServicios({ empresaId }: { empresaId: string }) {
  const [facturas, setFacturas] = useState<Cxc[]>([]);
  const [clientes, setClientes] = useState<ClienteOpcion[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false);
  const [cobrando, setCobrando] = useState<string | null>(null);
  const [montoCobro, setMontoCobro] = useState(0);
  const [medioPagoCobro, setMedioPagoCobro] = useState("Efectivo");
  const [cuentaCobro, setCuentaCobro] = useState("");
  const [cuentasBancarias, setCuentasBancarias] = useState<{ id: string; bancoNombre: string; saldoActual: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mostrarPagadas, setMostrarPagadas] = useState(false);

  const [form, setForm] = useState({
    clienteId: "",
    numeroFactura: "",
    montoTotal: 0,
    descripcion: "",
    condicion: "credito",
    medioPago: "Efectivo",
    cuentaBancariaId: "",
    fechaVencimiento: "",
  });
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: "", docIdentidad: "", telefono: "" });

  async function cargar() {
    const [resFacturas, resClientes, resCatalogos] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/cuentas-por-cobrar`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/clientes`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/catalogos`).then((r) => r.json()),
    ]);
    setFacturas(resFacturas);
    setClientes(resClientes);
    setCuentasBancarias(resCatalogos.cuentasBancarias ?? []);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const totalPorCobrar = facturas.filter((f) => f.estado !== "pagada").reduce((acc, f) => acc + Number(f.saldoPendiente), 0);
  const facturasVisibles = mostrarPagadas ? facturas : facturas.filter((f) => f.estado !== "pagada");
  const cantidadPagadas = facturas.filter((f) => f.estado === "pagada").length;

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

  async function handleCrearFactura(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.montoTotal <= 0) {
      setError("El monto debe ser mayor a 0.");
      return;
    }
    if (!form.numeroFactura.trim()) {
      setError("Indica el N° de factura.");
      return;
    }
    if (form.condicion === "contado" && !form.medioPago) {
      setError("Indica el medio de pago.");
      return;
    }
    const res = await fetch(`/api/empresas/${empresaId}/cuentas-por-cobrar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo registrar la factura.");
      return;
    }
    setForm({
      clienteId: "",
      numeroFactura: "",
      montoTotal: 0,
      descripcion: "",
      condicion: "credito",
      medioPago: "Efectivo",
      cuentaBancariaId: "",
      fechaVencimiento: "",
    });
    setMostrarForm(false);
    cargar();
  }

  async function handleCobro(cxcId: string) {
    setError(null);
    if (montoCobro <= 0) {
      setError("El monto del pago debe ser mayor a 0.");
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
      setError(data.error?.toString() ?? "No se pudo registrar el pago.");
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
        → <b>Facturación</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Facturación</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 6 }}>
        Registra cada factura emitida a un cliente. Queda en Cuentas por Cobrar hasta que el cliente la paga —
        igual que una factura por pagar, pero en sentido contrario — y ya cuenta como venta en el Estado de
        Resultados desde que la emites.
      </p>
      <p className="mono" style={{ fontSize: 12, color: "var(--alert)", marginBottom: 20 }}>
        Total por cobrar: S/ {totalPorCobrar.toFixed(2)}
      </p>

      {!mostrarForm ? (
        <button className="btn-primary" onClick={() => setMostrarForm(true)} style={{ marginBottom: 20 }}>
          + Registrar factura
        </button>
      ) : (
        <form onSubmit={handleCrearFactura} className="card" style={{ marginBottom: 20 }}>
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
                  <label>Nombre / Razón social del cliente</label>
                  <input value={nuevoCliente.nombre} onChange={(e) => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })} />
                </div>
                <div className="field" style={{ marginBottom: 8 }}>
                  <label>RUC (opcional)</label>
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
              <label>N° de factura</label>
              <input
                value={form.numeroFactura}
                onChange={(e) => setForm({ ...form, numeroFactura: e.target.value })}
                placeholder="Ej: F001-00234"
                required
              />
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
            <label>Detalle de la factura</label>
            <input
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="Ej: consultoría contable — agosto 2026"
              required
            />
          </div>

          <div className="field">
            <label>¿Cómo paga el cliente?</label>
            <select value={form.condicion} onChange={(e) => setForm({ ...form, condicion: e.target.value })}>
              <option value="credito">Al crédito (queda en Cuentas por Cobrar)</option>
              <option value="contado">Al contado (ya se pagó)</option>
            </select>
          </div>

          {form.condicion === "contado" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field">
                  <label>Medio de pago</label>
                  <select value={form.medioPago} onChange={(e) => setForm({ ...form, medioPago: e.target.value })}>
                    {MEDIOS_PAGO.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                {cuentasBancarias.length > 0 && (
                  <div className="field">
                    <label>Cuenta a la que entra (opcional)</label>
                    <select value={form.cuentaBancariaId} onChange={(e) => setForm({ ...form, cuentaBancariaId: e.target.value })}>
                      <option value="">No registrar en flujo de caja</option>
                      {cuentasBancarias.map((c) => (
                        <option key={c.id} value={c.id}>{c.bancoNombre} (S/ {Number(c.saldoActual).toFixed(2)})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 12 }}>
                Se registra como ya pagada — el cobro completo se hace en este mismo paso y, si eliges una cuenta,
                aparece de inmediato en Flujo de Caja.
              </p>
            </>
          ) : (
            <div className="field">
              <label>Fecha de vencimiento (opcional)</label>
              <input type="date" value={form.fechaVencimiento} onChange={(e) => setForm({ ...form, fechaVencimiento: e.target.value })} />
            </div>
          )}

          {error && <p className="field error">{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="btn-primary">
              {form.condicion === "contado" ? "Registrar factura pagada" : "Registrar factura"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setMostrarForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {cantidadPagadas > 0 && (
        <label className="checkbox-row mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 20 }}>
          <input type="checkbox" checked={mostrarPagadas} onChange={(e) => setMostrarPagadas(e.target.checked)} />
          Mostrar también las {cantidadPagadas} facturas ya pagadas
        </label>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {facturasVisibles.map((f) => (
          <div key={f.id} className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>
                  {f.cliente}{f.clienteRuc ? ` — RUC ${f.clienteRuc}` : ""}
                </p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {f.numeroFactura ? `Factura ${f.numeroFactura} · ` : ""}
                  {f.descripcion ?? "-"} · {new Date(f.fechaEmision).toLocaleDateString("es-PE", { timeZone: "UTC" })}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p className="mono" style={{ fontSize: 14 }}>
                  S/ {Number(f.saldoPendiente).toFixed(2)}{" "}
                  <span style={{ fontSize: 10, color: "var(--ink-soft)" }}>/ {Number(f.montoTotal).toFixed(2)}</span>
                </p>
                <p className="mono" style={{ fontSize: 10, textTransform: "uppercase", color: f.estado === "pagada" ? "var(--teal)" : "var(--stamp)" }}>
                  {f.estado === "pagada" ? "pagada" : "sin pagar"}
                </p>
              </div>
            </div>

            {f.estado !== "pagada" && (
              cobrando === f.id ? (
                <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={montoCobro}
                      onChange={(e) => setMontoCobro(Math.max(0, Number(e.target.value)))}
                      placeholder="Monto pagado"
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
                  <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 8 }}>
                    Vas a registrar un pago de <b>S/ {montoCobro.toFixed(2)}</b> de <b>{f.cliente}</b> por{" "}
                    <b>{medioPagoCobro}</b>
                    {cuentaCobro && (
                      <> hacia <b>{cuentasBancarias.find((cb) => cb.id === cuentaCobro)?.bancoNombre}</b></>
                    )}
                    .
                  </p>
                  {error && <p className="field error">{error}</p>}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      className="btn-primary"
                      style={{ padding: "8px 14px", fontSize: 12 }}
                      disabled={montoCobro <= 0}
                      onClick={() => handleCobro(f.id)}
                    >
                      Confirmar pago de S/ {montoCobro.toFixed(2)}
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
                    setCobrando(f.id);
                    setMontoCobro(Number(f.saldoPendiente));
                    setMedioPagoCobro("Efectivo");
                    setCuentaCobro("");
                    setError(null);
                  }}
                >
                  Marcar como pagada / registrar pago
                </button>
              )
            )}
          </div>
        ))}
        {facturasVisibles.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no hay facturas registradas.</p>
        )}
      </div>
    </main>
  );
}
