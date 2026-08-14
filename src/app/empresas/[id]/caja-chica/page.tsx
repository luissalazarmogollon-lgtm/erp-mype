"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NATURALEZAS_EGRESO, CATEGORIAS_POR_NATURALEZA } from "@/lib/naturalezaEgreso";
import { TIPOS_COMPROBANTE } from "@/lib/tiposComprobante";

type Caja = { id: string; nombre: string; cuentaBancaria: string | null; montoFondo: string };
type GastoCC = {
  id: string;
  descripcion: string;
  monto: string;
  fecha: string;
  tipoComprobante: string;
  numeroComprobante: string | null;
  estado: string;
  naturaleza: string | null;
  categoriaEspecifica: string | null;
};
type CuentaOpcion = { id: string; bancoNombre: string; saldoActual: string };

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function CajaChicaPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaOpcion[]>([]);
  const [cajaSeleccionada, setCajaSeleccionada] = useState<string | null>(null);
  const [gastos, setGastos] = useState<GastoCC[]>([]);
  const [mostrarFormCaja, setMostrarFormCaja] = useState(false);
  const [mostrarFormGasto, setMostrarFormGasto] = useState(false);
  const [reponiendo, setReponiendo] = useState(false);
  const [clasificando, setClasificando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [puedeClasificar, setPuedeClasificar] = useState(false);
  const [puedeGestionarFondos, setPuedeGestionarFondos] = useState(false);

  const [formCaja, setFormCaja] = useState({ nombre: "", cuentaBancariaId: "", montoFondo: 0 });
  const [formReponer, setFormReponer] = useState({ monto: 0, cuentaBancariaId: "" });
  const [formGasto, setFormGasto] = useState({ descripcion: "", monto: 0, fecha: hoyISO(), tipoComprobante: "sin_comprobante", numeroComprobante: "" });
  const [formClasificar, setFormClasificar] = useState({ naturaleza: "gasto_operativo", categoriaEspecifica: CATEGORIAS_POR_NATURALEZA.gasto_operativo[0], proveedorNombre: "" });

  async function cargarCajas() {
    const [resCajas, resCatalogos, resAcceso] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/caja-chica`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/catalogos`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/mi-acceso`).then((r) => r.json()),
    ]);
    setCajas(resCajas);
    setCuentasBancarias(resCatalogos.cuentasBancarias ?? []);
    setPuedeClasificar(Boolean(resAcceso.esSuperadminPlataforma) || resAcceso.tipoActor === "asesor");
    // Crear cajas chicas y reponer fondo mueve dinero real de una cuenta
    // bancaria — eso es trabajo de asesor/superadmin, no de quien solo
    // registra los gastos chicos del día a día.
    setPuedeGestionarFondos(
      Boolean(resAcceso.esSuperadminPlataforma) ||
        Boolean(resAcceso.accesoTotal) ||
        (resAcceso.permisos ?? []).includes("flujo_caja")
    );
    if (resCajas.length > 0 && !cajaSeleccionada) setCajaSeleccionada(resCajas[0].id);
  }

  async function cargarGastos(cajaId: string) {
    const data = await fetch(`/api/empresas/${empresaId}/caja-chica/${cajaId}/gastos`).then((r) => r.json());
    setGastos(data);
  }

  useEffect(() => {
    cargarCajas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  useEffect(() => {
    if (cajaSeleccionada) cargarGastos(cajaSeleccionada);
  }, [cajaSeleccionada]); // eslint-disable-line react-hooks/exhaustive-deps

  const caja = cajas.find((c) => c.id === cajaSeleccionada);

  async function handleCrearCaja(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/empresas/${empresaId}/caja-chica`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formCaja),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo crear la caja chica.");
      return;
    }
    setFormCaja({ nombre: "", cuentaBancariaId: "", montoFondo: 0 });
    setMostrarFormCaja(false);
    cargarCajas();
  }

  async function handleReponer() {
    if (!cajaSeleccionada) return;
    setError(null);
    const res = await fetch(`/api/empresas/${empresaId}/caja-chica/${cajaSeleccionada}/reponer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formReponer),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo reponer el fondo.");
      return;
    }
    setReponiendo(false);
    setFormReponer({ monto: 0, cuentaBancariaId: "" });
    cargarCajas();
  }

  async function handleRegistrarGasto(e: React.FormEvent) {
    e.preventDefault();
    if (!cajaSeleccionada) return;
    setError(null);
    const res = await fetch(`/api/empresas/${empresaId}/caja-chica/${cajaSeleccionada}/gastos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formGasto),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo registrar el gasto.");
      return;
    }
    setFormGasto({ descripcion: "", monto: 0, fecha: hoyISO(), tipoComprobante: "sin_comprobante", numeroComprobante: "" });
    setMostrarFormGasto(false);
    cargarCajas();
    cargarGastos(cajaSeleccionada);
  }

  async function handleTrasladar(gastoCajaChicaId: string) {
    setError(null);
    const res = await fetch(`/api/empresas/${empresaId}/caja-chica/gastos/${gastoCajaChicaId}/trasladar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formClasificar),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo trasladar el gasto.");
      return;
    }
    setClasificando(null);
    if (cajaSeleccionada) cargarGastos(cajaSeleccionada);
  }

  const categoriasDisponibles = CATEGORIAS_POR_NATURALEZA[formClasificar.naturaleza] ?? [];

  return (
    <main style={{ maxWidth: 750, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>Caja Chica</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Caja Chica</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 20 }}>
        Quien maneja la caja registra sus gastos aquí — no se ven en Gastos y Costos todavía. El administrador los
        clasifica y los traslada cuando corresponda.
      </p>

      {puedeGestionarFondos && (
        !mostrarFormCaja ? (
          <button className="btn-primary" onClick={() => setMostrarFormCaja(true)} style={{ marginBottom: 20 }}>
            + Nueva caja chica
          </button>
        ) : (
          <form onSubmit={handleCrearCaja} className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="field">
                <label>Nombre</label>
                <input value={formCaja.nombre} onChange={(e) => setFormCaja({ ...formCaja, nombre: e.target.value })} placeholder="Ej: Caja Chica Local Centro" required />
              </div>
              <div className="field">
                <label>Fondo inicial (S/)</label>
                <input type="number" step="0.01" value={formCaja.montoFondo} onChange={(e) => setFormCaja({ ...formCaja, montoFondo: Number(e.target.value) })} />
              </div>
              {cuentasBancarias.length > 0 && (
                <div className="field" style={{ gridColumn: "span 2" }}>
                  <label>¿De qué cuenta sale el fondo? (opcional)</label>
                  <select value={formCaja.cuentaBancariaId} onChange={(e) => setFormCaja({ ...formCaja, cuentaBancariaId: e.target.value })}>
                    <option value="">No descontar de ninguna cuenta</option>
                    {cuentasBancarias.map((c) => (
                      <option key={c.id} value={c.id}>{c.bancoNombre} (S/ {Number(c.saldoActual).toFixed(2)})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {error && <p className="field error">{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button type="submit" className="btn-primary">Crear</button>
              <button type="button" className="btn-ghost" onClick={() => setMostrarFormCaja(false)}>Cancelar</button>
            </div>
        </form>
        )
      )}

      {cajas.length === 0 ? (
        <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no has creado ninguna caja chica.</p>
      ) : (
        <>
          <div className="field" style={{ marginBottom: 20 }}>
            <label>Caja chica</label>
            <select value={cajaSeleccionada ?? ""} onChange={(e) => setCajaSeleccionada(e.target.value)}>
              {cajas.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre} — S/ {Number(c.montoFondo).toFixed(2)}</option>
              ))}
            </select>
          </div>

          {caja && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500 }}>{caja.nombre}</p>
                  <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                    {caja.cuentaBancaria ? `Se nutre de: ${caja.cuentaBancaria}` : "Sin cuenta bancaria asociada"}
                  </p>
                </div>
                <p className="mono" style={{ fontSize: 18, fontWeight: 500 }}>S/ {Number(caja.montoFondo).toFixed(2)}</p>
              </div>

              {puedeGestionarFondos && (
                reponiendo ? (
                  <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="number" step="0.01" placeholder="Monto a reponer"
                        value={formReponer.monto}
                        onChange={(e) => setFormReponer({ ...formReponer, monto: Number(e.target.value) })}
                        style={{ flex: 1, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 2 }}
                      />
                      {cuentasBancarias.length > 0 && (
                        <select
                          value={formReponer.cuentaBancariaId}
                          onChange={(e) => setFormReponer({ ...formReponer, cuentaBancariaId: e.target.value })}
                          style={{ flex: 1 }}
                        >
                          <option value="">Cuenta por defecto</option>
                          {cuentasBancarias.map((c) => (
                            <option key={c.id} value={c.id}>{c.bancoNombre}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                      <button className="btn-primary" style={{ fontSize: 12, padding: "8px 14px" }} onClick={handleReponer}>Confirmar</button>
                      <button className="btn-ghost" style={{ fontSize: 12, padding: "8px 14px" }} onClick={() => setReponiendo(false)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn-ghost" style={{ marginTop: 10, fontSize: 12, padding: "6px 12px" }} onClick={() => setReponiendo(true)}>
                    Reponer fondo
                  </button>
                )
              )}
            </div>
          )}

          {!mostrarFormGasto ? (
            <button className="btn-primary" onClick={() => setMostrarFormGasto(true)} style={{ marginBottom: 20 }}>
              + Registrar gasto de caja chica
            </button>
          ) : (
            <form onSubmit={handleRegistrarGasto} className="card" style={{ marginBottom: 20 }}>
              <div className="field">
                <label>Descripción</label>
                <input value={formGasto.descripcion} onChange={(e) => setFormGasto({ ...formGasto, descripcion: e.target.value })} placeholder="Ej: Útiles de limpieza" required />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field">
                  <label>Monto (S/)</label>
                  <input type="number" step="0.01" value={formGasto.monto} onChange={(e) => setFormGasto({ ...formGasto, monto: Number(e.target.value) })} required />
                </div>
                <div className="field">
                  <label>Fecha</label>
                  <input type="date" value={formGasto.fecha} onChange={(e) => setFormGasto({ ...formGasto, fecha: e.target.value })} required />
                </div>
                <div className="field">
                  <label>Tipo de documento</label>
                  <select value={formGasto.tipoComprobante} onChange={(e) => setFormGasto({ ...formGasto, tipoComprobante: e.target.value })}>
                    {TIPOS_COMPROBANTE.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>N° de documento (opcional)</label>
                  <input value={formGasto.numeroComprobante} onChange={(e) => setFormGasto({ ...formGasto, numeroComprobante: e.target.value })} placeholder="Ej: B001-00123" />
                </div>
              </div>
              {error && <p className="field error">{error}</p>}
              <div style={{ display: "flex", gap: 10 }}>
                <button type="submit" className="btn-primary">Registrar</button>
                <button type="button" className="btn-ghost" onClick={() => setMostrarFormGasto(false)}>Cancelar</button>
              </div>
            </form>
          )}

          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Gastos de esta caja</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {gastos.map((g) => (
              <div key={g.id} className="card" style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ fontSize: 14 }}>{g.descripcion}</p>
                    <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                      {new Date(g.fecha).toLocaleDateString("es-PE")}
                      {g.numeroComprobante ? ` · ${g.numeroComprobante}` : g.tipoComprobante !== "sin_comprobante" ? ` · ${g.tipoComprobante}` : ""}
                      {g.estado === "trasladado" && ` · ${g.naturaleza} · ${g.categoriaEspecifica}`}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p className="mono" style={{ fontSize: 13 }}>S/ {Number(g.monto).toFixed(2)}</p>
                    <p className="mono" style={{ fontSize: 10, textTransform: "uppercase", color: g.estado === "trasladado" ? "var(--teal)" : "var(--stamp)" }}>
                      {g.estado}
                    </p>
                  </div>
                </div>

                {g.estado === "pendiente" && !puedeClasificar && (
                  <p className="mono" style={{ marginTop: 8, fontSize: 11, color: "var(--ink-soft)" }}>
                    Pendiente de que el superadmin o un Asesor lo clasifique y traslade.
                  </p>
                )}

                {g.estado === "pendiente" && puedeClasificar && (
                  clasificando === g.id ? (
                    <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label>Naturaleza del egreso</label>
                          <select
                            value={formClasificar.naturaleza}
                            onChange={(e) => setFormClasificar({ ...formClasificar, naturaleza: e.target.value, categoriaEspecifica: CATEGORIAS_POR_NATURALEZA[e.target.value]?.[0] ?? "" })}
                          >
                            {NATURALEZAS_EGRESO.map((n) => (
                              <option key={n.value} value={n.value}>{n.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label>Categoría específica</label>
                          <select
                            value={formClasificar.categoriaEspecifica}
                            onChange={(e) => setFormClasificar({ ...formClasificar, categoriaEspecifica: e.target.value })}
                          >
                            {categoriasDisponibles.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {error && <p className="field error" style={{ marginTop: 8 }}>{error}</p>}
                      <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                        <button className="btn-primary" style={{ fontSize: 12, padding: "8px 14px" }} onClick={() => handleTrasladar(g.id)}>
                          Trasladar a Gastos y Costos
                        </button>
                        <button className="btn-ghost" style={{ fontSize: 12, padding: "8px 14px" }} onClick={() => setClasificando(null)}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="btn-ghost"
                      style={{ marginTop: 10, fontSize: 12, padding: "6px 12px" }}
                      onClick={() => { setClasificando(g.id); setError(null); }}
                    >
                      Clasificar y trasladar
                    </button>
                  )
                )}
              </div>
            ))}
            {gastos.length === 0 && (
              <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no hay gastos registrados en esta caja.</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
