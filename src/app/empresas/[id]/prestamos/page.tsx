"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Cuota = {
  id: string;
  fecha: string;
  naturaleza: string;
  montoTotal: string;
  descripcion: string;
};
type Prestamo = {
  id: string;
  entidadFinanciera: string;
  numeroCredito: string | null;
  montoOriginal: string;
  saldoPendiente: string;
  tasaInteres: string | null;
  fecha: string;
  cuentaBancariaId: string | null;
  cuentaBancaria: string | null;
  localId: string | null;
  local: string | null;
  estado: string;
  observacion: string | null;
  totalCapitalPagado: string;
  totalInteresPagado: string;
  cantidadCuotas: number;
  puedeEliminar: boolean;
  cuotas: Cuota[];
};
type LocalOpcion = { id: string; nombre: string };
type CuentaOpcion = { id: string; bancoNombre: string; saldoActual?: string };

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function PrestamosPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [locales, setLocales] = useState<LocalOpcion[]>([]);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaOpcion[]>([]);
  const [esSuperadmin, setEsSuperadmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState({
    entidadFinanciera: "",
    numeroCredito: "",
    montoOriginal: 0,
    tasaInteres: 0,
    fecha: hoyISO(),
    cuentaBancariaId: "",
    localId: "",
    observacion: "",
  });

  const [cuotaAbiertaId, setCuotaAbiertaId] = useState<string | null>(null);
  const [formCuota, setFormCuota] = useState({ fecha: hoyISO(), montoCapital: 0, montoInteres: 0, cuentaBancariaId: "" });
  const [historialAbiertoId, setHistorialAbiertoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);

  async function cargar() {
    const [resPrestamos, resCatalogos, resAcceso] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/prestamos`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/catalogos`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/mi-acceso`).then((r) => r.json()),
    ]);
    setPrestamos(Array.isArray(resPrestamos) ? resPrestamos : []);
    setLocales(resCatalogos.locales ?? []);
    setCuentasBancarias(resCatalogos.cuentasBancarias ?? []);
    if (!resAcceso.error) setEsSuperadmin(Boolean(resAcceso.esSuperadminPlataforma));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.montoOriginal <= 0) {
      setError("El monto del préstamo debe ser mayor a 0.");
      return;
    }
    setGuardando(true);
    const res = await fetch(`/api/empresas/${empresaId}/prestamos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        numeroCredito: form.numeroCredito || undefined,
        tasaInteres: form.tasaInteres > 0 ? form.tasaInteres : undefined,
        cuentaBancariaId: form.cuentaBancariaId || undefined,
        localId: form.localId || undefined,
        observacion: form.observacion || undefined,
      }),
    });
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo registrar el préstamo.");
      return;
    }
    setForm({
      entidadFinanciera: "",
      numeroCredito: "",
      montoOriginal: 0,
      tasaInteres: 0,
      fecha: hoyISO(),
      cuentaBancariaId: "",
      localId: "",
      observacion: "",
    });
    setMostrarForm(false);
    cargar();
  }

  async function handleRegistrarCuota(prestamoId: string) {
    setError(null);
    if (formCuota.montoCapital <= 0 && formCuota.montoInteres <= 0) {
      setError("Indica el monto de capital y/o de interés de la cuota.");
      return;
    }
    if (!formCuota.cuentaBancariaId) {
      setError("Indica de qué cuenta bancaria sale el pago de la cuota.");
      return;
    }
    setGuardando(true);
    const res = await fetch(`/api/empresas/${empresaId}/prestamos/${prestamoId}/cuota`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formCuota),
    });
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo registrar la cuota.");
      return;
    }
    setCuotaAbiertaId(null);
    setFormCuota({ fecha: hoyISO(), montoCapital: 0, montoInteres: 0, cuentaBancariaId: "" });
    cargar();
  }

  async function handleEliminar(p: Prestamo) {
    if (!confirm(`¿Eliminar el préstamo de ${p.entidadFinanciera} por S/ ${Number(p.montoOriginal).toFixed(2)}? Esta acción no se puede deshacer.`)) return;
    setEliminandoId(p.id);
    setError(null);
    const res = await fetch(`/api/empresas/${empresaId}/prestamos/${p.id}`, { method: "DELETE" });
    setEliminandoId(null);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo eliminar el préstamo.");
      return;
    }
    cargar();
  }

  const totalPendiente = prestamos.reduce((acc, p) => acc + Number(p.saldoPendiente), 0);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>Préstamos</b>
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <h1 style={{ fontSize: 26 }}>Préstamos</h1>
        {totalPendiente > 0.004 && (
          <div style={{ textAlign: "right" }}>
            <p className="mono" style={{ fontSize: 10, color: "var(--ink-soft)", textTransform: "uppercase" }}>
              Deuda pendiente
            </p>
            <p className="mono" style={{ fontSize: 26, fontWeight: 600, color: "var(--stamp)" }}>
              S/ {totalPendiente.toFixed(2)}
            </p>
          </div>
        )}
      </div>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 20 }}>
        Registra cada préstamo recibido (banco, entidad financiera, socio...). El desembolso entra al Flujo de Caja
        pero no afecta el Estado de Resultados — es un pasivo, no una venta. Cada cuota que registres se separa
        automáticamente en capital (reduce este saldo pendiente, no afecta resultados) e interés (sí afecta
        resultados, como gasto financiero) — el mismo tratamiento que ya usa Gastos y Costos para "Pago de deuda".
        Si asocias el préstamo a un local, sus cuotas también cuentan en el Estado de Resultados filtrado por ese
        local.
      </p>

      {!mostrarForm ? (
        <button className="btn-primary" onClick={() => setMostrarForm(true)} style={{ marginBottom: 20 }}>
          + Registrar préstamo
        </button>
      ) : (
        <form onSubmit={handleCrear} className="card" style={{ marginBottom: 24 }}>
          <div className="field">
            <label>Entidad financiera / persona</label>
            <input
              value={form.entidadFinanciera}
              onChange={(e) => setForm({ ...form, entidadFinanciera: e.target.value })}
              placeholder="Ej: BCP, Interbank, socio..."
              required
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>N° de crédito (opcional)</label>
              <input value={form.numeroCredito} onChange={(e) => setForm({ ...form, numeroCredito: e.target.value })} />
            </div>
            <div className="field">
              <label>Fecha de desembolso</label>
              <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
            </div>
            <div className="field">
              <label>Monto del préstamo (S/)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.montoOriginal}
                onChange={(e) => setForm({ ...form, montoOriginal: Number(e.target.value) })}
                required
              />
            </div>
            <div className="field">
              <label>Tasa de interés % (opcional, informativa)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.tasaInteres}
                onChange={(e) => setForm({ ...form, tasaInteres: Number(e.target.value) })}
              />
            </div>
          </div>
          {cuentasBancarias.length > 0 && (
            <div className="field">
              <label>¿A qué cuenta entró el desembolso? (opcional)</label>
              <select value={form.cuentaBancariaId} onChange={(e) => setForm({ ...form, cuentaBancariaId: e.target.value })}>
                <option value="">No registrar el ingreso en Flujo de Caja</option>
                {cuentasBancarias.map((c) => (
                  <option key={c.id} value={c.id}>{c.bancoNombre}</option>
                ))}
              </select>
            </div>
          )}
          {locales.length > 0 && (
            <div className="field">
              <label>¿Es para un local/proyecto específico? (opcional)</label>
              <select value={form.localId} onChange={(e) => setForm({ ...form, localId: e.target.value })}>
                <option value="">No — es para la empresa en general</option>
                {locales.map((l) => (
                  <option key={l.id} value={l.id}>{l.nombre}</option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Observación (opcional)</label>
            <input value={form.observacion} onChange={(e) => setForm({ ...form, observacion: e.target.value })} />
          </div>

          {error && <p className="field error">{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? "Guardando..." : "Registrar préstamo"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => { setMostrarForm(false); setError(null); }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {prestamos.map((p) => {
          const pagado = p.estado === "pagado";
          const pctPagado = Number(p.montoOriginal) > 0
            ? Math.min(100, ((Number(p.montoOriginal) - Number(p.saldoPendiente)) / Number(p.montoOriginal)) * 100)
            : 0;
          return (
            <div key={p.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p style={{ fontSize: 14.5, fontWeight: 500 }}>
                    {p.entidadFinanciera}{p.numeroCredito ? ` — N° ${p.numeroCredito}` : ""}
                  </p>
                  <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>
                    {new Date(p.fecha).toLocaleDateString("es-PE", { timeZone: "UTC" })}
                    {p.cuentaBancaria ? ` · ${p.cuentaBancaria}` : ""}
                    {p.local ? ` · ${p.local}` : ""}
                    {p.tasaInteres ? ` · ${p.tasaInteres}% interés` : ""}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p className="mono" style={{ fontSize: 10, textTransform: "uppercase", color: pagado ? "var(--teal)" : "var(--stamp)" }}>
                    {pagado ? "pagado" : "activo"}
                  </p>
                  <p className="mono" style={{ fontSize: 16, fontWeight: 600 }}>
                    S/ {Number(p.saldoPendiente).toFixed(2)}
                  </p>
                  <p className="mono" style={{ fontSize: 10, color: "var(--ink-soft)" }}>
                    de S/ {Number(p.montoOriginal).toFixed(2)}
                  </p>
                </div>
              </div>

              <div style={{ height: 6, background: "var(--paper)", borderRadius: 3, marginTop: 10, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pctPagado}%`, background: pagado ? "var(--teal)" : "var(--stamp)" }} />
              </div>

              {p.observacion && (
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 8 }}>{p.observacion}</p>
              )}

              <div style={{ display: "flex", gap: 14, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                {p.cuotas.length > 0 && (
                  <button
                    onClick={() => setHistorialAbiertoId(historialAbiertoId === p.id ? null : p.id)}
                    style={{ fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--ink-soft)", padding: 0 }}
                  >
                    {historialAbiertoId === p.id ? "▾" : "▸"} Capital pagado S/ {p.totalCapitalPagado} · Interés pagado S/ {p.totalInteresPagado}
                  </button>
                )}
                {esSuperadmin && p.puedeEliminar && (
                  <button
                    onClick={() => handleEliminar(p)}
                    disabled={eliminandoId === p.id}
                    style={{ fontSize: 11, background: "none", border: "none", cursor: "pointer", color: "var(--alert)", padding: 0, marginLeft: "auto" }}
                  >
                    Eliminar préstamo
                  </button>
                )}
              </div>

              {historialAbiertoId === p.id && (
                <div style={{ marginTop: 8, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                  {p.cuotas.map((c) => (
                    <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                      <span className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                        {new Date(c.fecha).toLocaleDateString("es-PE", { timeZone: "UTC" })} · {c.naturaleza === "deuda" ? "Capital" : "Interés"}
                      </span>
                      <span className="mono" style={{ fontSize: 11 }}>S/ {Number(c.montoTotal).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              {!pagado && (
                cuotaAbiertaId === p.id ? (
                  <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div className="field" style={{ marginBottom: 8 }}>
                        <label>Fecha de la cuota</label>
                        <input type="date" value={formCuota.fecha} onChange={(e) => setFormCuota({ ...formCuota, fecha: e.target.value })} />
                      </div>
                      <div className="field" style={{ marginBottom: 8 }}>
                        <label>Cuenta desde la que se paga</label>
                        <select value={formCuota.cuentaBancariaId} onChange={(e) => setFormCuota({ ...formCuota, cuentaBancariaId: e.target.value })}>
                          <option value="">Selecciona...</option>
                          {cuentasBancarias.map((c) => (
                            <option key={c.id} value={c.id}>{c.bancoNombre}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field" style={{ marginBottom: 8 }}>
                        <label>Capital (S/) — máx. S/ {Number(p.saldoPendiente).toFixed(2)}</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={Number(p.saldoPendiente)}
                          value={formCuota.montoCapital}
                          onChange={(e) => setFormCuota({ ...formCuota, montoCapital: Number(e.target.value) })}
                        />
                      </div>
                      <div className="field" style={{ marginBottom: 8 }}>
                        <label>Interés (S/)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formCuota.montoInteres}
                          onChange={(e) => setFormCuota({ ...formCuota, montoInteres: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                    <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 8 }}>
                      Total de la cuota: S/ {(formCuota.montoCapital + formCuota.montoInteres).toFixed(2)} · Saldo del préstamo después: S/{" "}
                      {Math.max(Number(p.saldoPendiente) - formCuota.montoCapital, 0).toFixed(2)}
                    </p>
                    {formCuota.montoCapital > Number(p.saldoPendiente) + 0.004 && (
                      <p className="mono" style={{ fontSize: 11, color: "var(--alert)", marginBottom: 8 }}>
                        El capital no puede superar el saldo pendiente (S/ {Number(p.saldoPendiente).toFixed(2)}).
                      </p>
                    )}
                    {error && <p className="field error">{error}</p>}
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        className="btn-primary"
                        style={{ fontSize: 12, padding: "8px 14px" }}
                        disabled={guardando || formCuota.montoCapital > Number(p.saldoPendiente) + 0.004}
                        onClick={() => handleRegistrarCuota(p.id)}
                      >
                        Registrar cuota
                      </button>
                      <button className="btn-ghost" style={{ fontSize: 12, padding: "8px 14px" }} onClick={() => { setCuotaAbiertaId(null); setError(null); }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn-ghost"
                    style={{ marginTop: 10, fontSize: 12, padding: "6px 12px" }}
                    onClick={() => {
                      setCuotaAbiertaId(p.id);
                      setFormCuota({ fecha: hoyISO(), montoCapital: Number(p.saldoPendiente), montoInteres: 0, cuentaBancariaId: p.cuentaBancariaId ?? "" });
                      setError(null);
                    }}
                  >
                    Registrar cuota
                  </button>
                )
              )}
            </div>
          );
        })}
        {prestamos.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no has registrado ningún préstamo.</p>
        )}
      </div>
    </main>
  );
}
