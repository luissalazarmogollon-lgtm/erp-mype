"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NATURALEZAS_EGRESO, CATEGORIAS_POR_NATURALEZA } from "@/lib/naturalezaEgreso";
import { TIPOS_COMPROBANTE } from "@/lib/tiposComprobante";

type ItemCxp = {
  id: string;
  descripcion: string;
  monto: string;
  naturaleza: string | null;
  categoriaEspecifica: string | null;
};
type Cxp = {
  id: string;
  proveedorNombre: string | null;
  descripcionGasto: string;
  montoTotal: string;
  saldoPendiente: string;
  fechaEmision: string;
  estado: string;
  items: ItemCxp[];
  pendienteClasificar: boolean;
};
type CuentaOpcion = { id: string; bancoNombre: string; saldoActual: string };
type LocalOpcion = { id: string; nombre: string };
type MiAcceso = { esSuperadminPlataforma: boolean; accesoTotal: boolean; permisos: string[] };

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function CuentasPorPagarPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [cxps, setCxps] = useState<Cxp[]>([]);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaOpcion[]>([]);
  const [locales, setLocales] = useState<LocalOpcion[]>([]);
  const [miAcceso, setMiAcceso] = useState<MiAcceso | null>(null);
  const [pagando, setPagando] = useState<string | null>(null);
  const [montoPago, setMontoPago] = useState(0);
  const [cuentaPago, setCuentaPago] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mostrarPagadas, setMostrarPagadas] = useState(false);

  // Clasificación de un ítem (naturaleza + categoría) — solo disponible
  // para quien tiene el permiso completo "cuentas_por_pagar".
  const [clasificando, setClasificando] = useState<string | null>(null); // gastoId del ítem
  const [clasifForm, setClasifForm] = useState({
    naturaleza: "gasto_operativo",
    categoriaEspecifica: CATEGORIAS_POR_NATURALEZA.gasto_operativo[0],
  });
  const [guardandoClasif, setGuardandoClasif] = useState(false);
  const [errorClasif, setErrorClasif] = useState<string | null>(null);

  // Registro de una factura nueva — solo ítem + monto, sin clasificar.
  const [mostrarForm, setMostrarForm] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [form, setForm] = useState({
    localId: "",
    proveedorNombre: "",
    tipoComprobante: "factura",
    numeroComprobante: "",
    fecha: hoyISO(),
    fechaVencimiento: "",
  });
  const [itemActual, setItemActual] = useState({ descripcion: "", monto: 0 });
  const [itemsFactura, setItemsFactura] = useState<{ descripcion: string; monto: number }[]>([]);

  async function cargar() {
    const [resCxp, resCatalogos, resAcceso] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/cuentas-por-pagar`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/catalogos`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/mi-acceso`).then((r) => r.json()),
    ]);
    setCxps(resCxp);
    setCuentasBancarias(resCatalogos.cuentasBancarias ?? []);
    setLocales(resCatalogos.locales ?? []);
    if (!resAcceso.error) setMiAcceso(resAcceso);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  // "cuentas_por_pagar" = responsable de finanzas/contabilidad: puede
  // clasificar ítems y pagar. "cuentas_por_pagar_registrar" = solo
  // registra facturas nuevas, sin ver ni tocar la clasificación contable.
  const puedeClasificarYPagar =
    !!miAcceso && (miAcceso.accesoTotal || miAcceso.permisos.includes("cuentas_por_pagar"));
  const puedeRegistrar =
    !!miAcceso &&
    (miAcceso.accesoTotal ||
      miAcceso.permisos.includes("cuentas_por_pagar") ||
      miAcceso.permisos.includes("cuentas_por_pagar_registrar"));

  const totalPorPagar = cxps.filter((c) => c.estado !== "pagada").reduce((acc, c) => acc + Number(c.saldoPendiente), 0);
  const cxpsVisibles = mostrarPagadas ? cxps : cxps.filter((c) => c.estado !== "pagada");
  const cantidadPagadas = cxps.filter((c) => c.estado === "pagada").length;

  function agregarItem() {
    setErrorForm(null);
    if (!itemActual.descripcion.trim()) {
      setErrorForm("Describe el ítem antes de agregarlo.");
      return;
    }
    if (itemActual.monto <= 0) {
      setErrorForm("El monto del ítem debe ser mayor a 0.");
      return;
    }
    setItemsFactura([...itemsFactura, itemActual]);
    setItemActual({ descripcion: "", monto: 0 });
  }

  function quitarItem(index: number) {
    setItemsFactura(itemsFactura.filter((_, i) => i !== index));
  }

  const totalFactura = itemsFactura.reduce((acc, i) => acc + i.monto, 0);

  async function handleRegistrarFactura() {
    setErrorForm(null);
    if (itemsFactura.length === 0) {
      setErrorForm("Agrega al menos un ítem de la factura.");
      return;
    }
    setGuardando(true);

    const res = await fetch(`/api/empresas/${empresaId}/cuentas-por-pagar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, items: itemsFactura }),
    });

    setGuardando(false);

    if (!res.ok) {
      const data = await res.json();
      setErrorForm(data.error?.toString() ?? "No se pudo registrar la factura.");
      return;
    }

    setItemsFactura([]);
    setForm({ ...form, proveedorNombre: "", numeroComprobante: "", fechaVencimiento: "" });
    setMostrarForm(false);
    cargar();
  }

  function iniciarClasificacion(itemId: string) {
    setClasificando(itemId);
    setClasifForm({ naturaleza: "gasto_operativo", categoriaEspecifica: CATEGORIAS_POR_NATURALEZA.gasto_operativo[0] });
    setErrorClasif(null);
  }

  function cambiarNaturalezaClasif(naturaleza: string) {
    setClasifForm({ naturaleza, categoriaEspecifica: CATEGORIAS_POR_NATURALEZA[naturaleza]?.[0] ?? "" });
  }

  async function handleGuardarClasificacion(cxpId: string, gastoId: string) {
    setErrorClasif(null);
    setGuardandoClasif(true);
    const res = await fetch(`/api/empresas/${empresaId}/cuentas-por-pagar/${cxpId}/items/${gastoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clasifForm),
    });
    setGuardandoClasif(false);
    if (!res.ok) {
      const data = await res.json();
      setErrorClasif(data.error?.toString() ?? "No se pudo guardar la clasificación.");
      return;
    }
    setClasificando(null);
    cargar();
  }

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
        {puedeClasificarYPagar
          ? " Antes de pagar una factura hay que clasificar todos sus ítems (Naturaleza del egreso y Categoría específica)."
          : " Registra cada factura con sus ítems y montos — la clasificación contable y el pago los hace finanzas/contabilidad."}
      </p>

      {puedeRegistrar && (
        <>
          {!mostrarForm ? (
            <button className="btn-primary" style={{ marginBottom: 20 }} onClick={() => setMostrarForm(true)}>
              + Registrar factura
            </button>
          ) : (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 15, marginBottom: 4 }}>Registrar factura por pagar</h3>
              <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 14 }}>
                Agrega cada ítem de la factura con su monto — el total se suma solo y debe coincidir con el de tu
                comprobante físico. No necesitas indicar naturaleza ni categoría: eso lo completa después
                finanzas/contabilidad.
              </p>

              <div className="card" style={{ background: "var(--paper)", marginBottom: 14 }}>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 10, textTransform: "uppercase" }}>
                  Agregar ítem
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                  <div className="field">
                    <label>Descripción del ítem</label>
                    <input
                      value={itemActual.descripcion}
                      onChange={(e) => setItemActual({ ...itemActual, descripcion: e.target.value })}
                      placeholder="Ej: Harina 25kg"
                    />
                  </div>
                  <div className="field">
                    <label>Monto (S/)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={itemActual.monto}
                      onChange={(e) => setItemActual({ ...itemActual, monto: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <button type="button" className="btn-ghost" onClick={agregarItem} style={{ fontSize: 12, padding: "6px 12px" }}>
                  + Agregar ítem a la lista
                </button>
              </div>

              {itemsFactura.length > 0 && (
                <div className="card" style={{ marginBottom: 14 }}>
                  {itemsFactura.map((item, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < itemsFactura.length - 1 ? "1px solid var(--line)" : "none" }}>
                      <span style={{ fontSize: 13 }}>{item.descripcion}</span>
                      <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span className="mono" style={{ fontSize: 13 }}>S/ {item.monto.toFixed(2)}</span>
                        <button onClick={() => quitarItem(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-soft)" }}>×</button>
                      </span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTop: "2px solid var(--ink)" }}>
                    <span style={{ fontWeight: 500, fontSize: 13 }}>Total de la factura</span>
                    <span className="mono" style={{ fontWeight: 500 }}>S/ {totalFactura.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 10, textTransform: "uppercase" }}>
                Datos de la factura
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field">
                  <label>Proveedor</label>
                  <input value={form.proveedorNombre} onChange={(e) => setForm({ ...form, proveedorNombre: e.target.value })} placeholder="Ej: Distribuidora XYZ" />
                </div>
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
                  <label>Tipo de comprobante</label>
                  <select value={form.tipoComprobante} onChange={(e) => setForm({ ...form, tipoComprobante: e.target.value })}>
                    {TIPOS_COMPROBANTE.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>N° de comprobante</label>
                  <input value={form.numeroComprobante} onChange={(e) => setForm({ ...form, numeroComprobante: e.target.value })} placeholder="Ej: F001-00234" />
                </div>
                <div className="field">
                  <label>Fecha de emisión</label>
                  <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
                </div>
                <div className="field">
                  <label>Fecha de vencimiento (opcional)</label>
                  <input type="date" value={form.fechaVencimiento} onChange={(e) => setForm({ ...form, fechaVencimiento: e.target.value })} />
                </div>
              </div>

              {errorForm && <p className="field error">{errorForm}</p>}
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button className="btn-primary" disabled={guardando} onClick={handleRegistrarFactura}>
                  {guardando ? "Guardando..." : `Registrar factura — S/ ${totalFactura.toFixed(2)}`}
                </button>
                <button className="btn-ghost" onClick={() => { setMostrarForm(false); setItemsFactura([]); setErrorForm(null); }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
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

              {/* Ítems de la factura, con su estado de clasificación */}
              <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                {c.items.map((item) => (
                  <div key={item.id} style={{ padding: "6px 0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <p style={{ fontSize: 12.5 }}>{item.descripcion}</p>
                        <p className="mono" style={{ fontSize: 10, color: item.naturaleza ? "var(--ink-soft)" : "var(--stamp)" }}>
                          {item.naturaleza
                            ? `${NATURALEZAS_EGRESO.find((n) => n.value === item.naturaleza)?.label ?? item.naturaleza}${item.categoriaEspecifica ? ` · ${item.categoriaEspecifica}` : ""}`
                            : "Sin clasificar"}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span className="mono" style={{ fontSize: 12 }}>S/ {Number(item.monto).toFixed(2)}</span>
                        {!item.naturaleza && puedeClasificarYPagar && clasificando !== item.id && (
                          <button
                            className="btn-ghost"
                            style={{ fontSize: 11, padding: "4px 8px" }}
                            onClick={() => iniciarClasificacion(item.id)}
                          >
                            Clasificar
                          </button>
                        )}
                      </div>
                    </div>

                    {clasificando === item.id && (
                      <div style={{ marginTop: 8, marginBottom: 4, background: "var(--paper)", padding: 10, borderRadius: 2 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: 11 }}>Naturaleza del egreso</label>
                            <select value={clasifForm.naturaleza} onChange={(e) => cambiarNaturalezaClasif(e.target.value)}>
                              {NATURALEZAS_EGRESO.map((n) => (
                                <option key={n.value} value={n.value}>{n.label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="field" style={{ marginBottom: 0 }}>
                            <label style={{ fontSize: 11 }}>Categoría específica</label>
                            <select
                              value={clasifForm.categoriaEspecifica}
                              onChange={(e) => setClasifForm({ ...clasifForm, categoriaEspecifica: e.target.value })}
                            >
                              {(CATEGORIAS_POR_NATURALEZA[clasifForm.naturaleza] ?? []).map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {errorClasif && <p className="field error" style={{ fontSize: 11 }}>{errorClasif}</p>}
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            className="btn-primary"
                            style={{ fontSize: 11, padding: "5px 10px" }}
                            disabled={guardandoClasif}
                            onClick={() => handleGuardarClasificacion(c.id, item.id)}
                          >
                            {guardandoClasif ? "Guardando..." : "Guardar clasificación"}
                          </button>
                          <button className="btn-ghost" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => setClasificando(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {c.estado !== "pagada" && puedeClasificarYPagar && (
                c.pendienteClasificar ? (
                  <p className="mono" style={{ marginTop: 10, fontSize: 11, color: "var(--stamp)" }}>
                    Clasifica todos los ítems para poder pagar esta factura.
                  </p>
                ) : pagando === c.id ? (
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
