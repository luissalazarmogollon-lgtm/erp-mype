"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { NATURALEZAS_EGRESO, CATEGORIAS_POR_NATURALEZA } from "@/lib/naturalezaEgreso";
import { TIPOS_COMPROBANTE } from "@/lib/tiposComprobante";

type Gasto = {
  id: string;
  local: string | null;
  naturaleza: string | null;
  categoriaEspecifica: string | null;
  proveedorNombre: string | null;
  descripcion: string;
  tipoComprobante: string;
  numeroComprobante: string | null;
  montoTotal: string;
  fecha: string;
  condicion: string;
  estadoPago: string;
  impactaResultados: boolean;
};
type LocalOpcion = { id: string; nombre: string };

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function GastosPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [locales, setLocales] = useState<LocalOpcion[]>([]);
  const [cuentasBancarias, setCuentasBancarias] = useState<{ id: string; bancoNombre: string; saldoActual: string }[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarFormDocumento, setMostrarFormDocumento] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDoc, setErrorDoc] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardandoDoc, setGuardandoDoc] = useState(false);
  const [naturalezasAbiertas, setNaturalezasAbiertas] = useState<Record<string, boolean>>({});

  const [formDoc, setFormDoc] = useState({
    localId: "",
    proveedorNombre: "",
    tipoComprobante: "factura",
    numeroComprobante: "",
    fecha: hoyISO(),
    condicion: "contado",
    medioPago: "Efectivo",
    cuentaBancariaId: "",
    fechaVencimiento: "",
  });
  const [itemActual, setItemActual] = useState({
    descripcion: "",
    naturaleza: "costo_directo",
    categoriaEspecifica: CATEGORIAS_POR_NATURALEZA.costo_directo[0],
    monto: 0,
  });
  const [itemsDoc, setItemsDoc] = useState<
    { descripcion: string; naturaleza: string; categoriaEspecifica: string; monto: number }[]
  >([]);

  const [form, setForm] = useState({
    localId: "",
    naturaleza: "gasto_operativo",
    categoriaEspecifica: CATEGORIAS_POR_NATURALEZA.gasto_operativo[0],
    proveedorNombre: "",
    descripcion: "",
    tipoComprobante: "boleta",
    numeroComprobante: "",
    montoTotal: 0,
    fecha: hoyISO(),
    condicion: "contado",
    medioPago: "Efectivo",
    cuentaBancariaId: "",
    fechaVencimiento: "",
    montoInteres: 0,
  });

  async function cargar() {
    const [resGastos, resCatalogos] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/gastos`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/catalogos`).then((r) => r.json()),
    ]);
    setGastos(resGastos);
    setLocales(resCatalogos.locales ?? []);
    setCuentasBancarias(resCatalogos.cuentasBancarias ?? []);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const categoriasDisponibles = CATEGORIAS_POR_NATURALEZA[form.naturaleza] ?? [];

  function cambiarNaturaleza(naturaleza: string) {
    setForm({
      ...form,
      naturaleza,
      categoriaEspecifica: CATEGORIAS_POR_NATURALEZA[naturaleza]?.[0] ?? "",
      montoInteres: 0,
    });
  }

  const totalCostoVentas = gastos
    .filter((g) => g.naturaleza === "costo_directo" || g.naturaleza === "mano_obra_directa")
    .reduce((acc, g) => acc + Number(g.montoTotal), 0);
  const totalGastoOperativo = gastos
    .filter((g) => g.naturaleza === "gasto_operativo")
    .reduce((acc, g) => acc + Number(g.montoTotal), 0);
  const totalEgresoCaja = gastos.reduce((acc, g) => acc + Number(g.montoTotal), 0);

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
      setError(data.error?.toString() ?? "No se pudo registrar el egreso.");
      return;
    }

    setForm({ ...form, descripcion: "", montoTotal: 0, proveedorNombre: "", montoInteres: 0 });
    setMostrarForm(false);
    cargar();
  }

  function cambiarNaturalezaItem(naturaleza: string) {
    setItemActual({
      ...itemActual,
      naturaleza,
      categoriaEspecifica: CATEGORIAS_POR_NATURALEZA[naturaleza]?.[0] ?? "",
    });
  }

  function agregarItem() {
    setErrorDoc(null);
    if (!itemActual.descripcion.trim()) {
      setErrorDoc("Describe el ítem antes de agregarlo.");
      return;
    }
    if (itemActual.monto <= 0) {
      setErrorDoc("El monto del ítem debe ser mayor a 0.");
      return;
    }
    setItemsDoc([...itemsDoc, itemActual]);
    setItemActual({ ...itemActual, descripcion: "", monto: 0 });
  }

  function quitarItem(index: number) {
    setItemsDoc(itemsDoc.filter((_, i) => i !== index));
  }

  const totalDoc = itemsDoc.reduce((acc, i) => acc + i.monto, 0);

  async function handleRegistrarDocumento() {
    setErrorDoc(null);
    if (itemsDoc.length === 0) {
      setErrorDoc("Agrega al menos un ítem al documento.");
      return;
    }
    if (formDoc.condicion === "contado" && !formDoc.medioPago) {
      setErrorDoc("Indica el medio de pago.");
      return;
    }
    setGuardandoDoc(true);

    const res = await fetch(`/api/empresas/${empresaId}/documentos-compra`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...formDoc, items: itemsDoc }),
    });

    setGuardandoDoc(false);

    if (!res.ok) {
      const data = await res.json();
      setErrorDoc(data.error?.toString() ?? "No se pudo registrar el documento.");
      return;
    }

    setItemsDoc([]);
    setFormDoc({ ...formDoc, proveedorNombre: "", numeroComprobante: "" });
    setMostrarFormDocumento(false);
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
        Costo de ventas: S/ {totalCostoVentas.toFixed(2)} · Gasto operativo: S/ {totalGastoOperativo.toFixed(2)} ·
        Egreso de caja total: S/ {totalEgresoCaja.toFixed(2)}
      </p>

      {!mostrarForm && !mostrarFormDocumento ? (
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <button className="btn-primary" onClick={() => setMostrarForm(true)}>
            + Registrar egreso
          </button>
          <button className="btn-ghost" onClick={() => setMostrarFormDocumento(true)}>
            + Documento con varios ítems
          </button>
        </div>
      ) : mostrarForm ? (
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
              <label>N° de comprobante (opcional)</label>
              <input value={form.numeroComprobante} onChange={(e) => setForm({ ...form, numeroComprobante: e.target.value })} placeholder="Ej: F001-00234" />
            </div>
            <div className="field">
              <label>Monto total pagado (S/)</label>
              <input type="number" step="0.01" value={form.montoTotal} onChange={(e) => setForm({ ...form, montoTotal: Number(e.target.value) })} required />
            </div>
            <div className="field">
              <label>Fecha</label>
              <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
            </div>
          </div>

          {form.naturaleza === "deuda" && (
            <div className="field" style={{ background: "var(--stamp-bg, #f1e2c8)", padding: 12, borderRadius: 2 }}>
              <label>De ese monto, ¿cuánto es interés? (S/, opcional)</label>
              <input
                type="number"
                step="0.01"
                value={form.montoInteres}
                onChange={(e) => setForm({ ...form, montoInteres: Number(e.target.value) })}
              />
              <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 6 }}>
                El capital no afecta el Estado de Resultados; el interés sí, como gasto financiero. El sistema
                separa esto automáticamente en dos registros.
              </p>
            </div>
          )}

          {form.naturaleza === "activo" && (
            <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 12 }}>
              Este egreso se registra como salida de caja pero NO impacta el Estado de Resultados — es una compra
              de activo, no un gasto (su depreciación futura sí impactará, cuando el módulo de Activos Fijos esté
              disponible).
            </p>
          )}

          <div className="field">
            <label>¿Cómo se pagó?</label>
            <select value={form.condicion} onChange={(e) => setForm({ ...form, condicion: e.target.value })}>
              <option value="contado">Al contado (ya se pagó)</option>
              <option value="credito">Al crédito (genera cuenta por pagar)</option>
            </select>
          </div>

          {form.condicion === "contado" ? (
            <>
              <div className="field">
                <label>Medio de pago</label>
                <select value={form.medioPago} onChange={(e) => setForm({ ...form, medioPago: e.target.value })}>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Yape/Plin">Yape/Plin</option>
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Transferencia">Transferencia</option>
                </select>
              </div>
              {cuentasBancarias.length > 0 && (
                <div className="field">
                  <label>Cuenta de la que salió (opcional, para el flujo de caja)</label>
                  <select value={form.cuentaBancariaId} onChange={(e) => setForm({ ...form, cuentaBancariaId: e.target.value })}>
                    <option value="">No registrar en flujo de caja</option>
                    {cuentasBancarias.map((c) => (
                      <option key={c.id} value={c.id}>{c.bancoNombre} (S/ {Number(c.saldoActual).toFixed(2)})</option>
                    ))}
                  </select>
                </div>
              )}
            </>
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
      ) : (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Documento con varios ítems</h3>
          <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 16 }}>
            Para una factura/boleta que trae varios productos o conceptos distintos — agrega cada ítem con su propia
            naturaleza y monto, y al final registra el documento completo de una vez.
          </p>

          <div className="card" style={{ background: "var(--paper)", marginBottom: 14 }}>
            <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 10, textTransform: "uppercase" }}>
              Agregar ítem
            </p>
            <div className="field">
              <label>Descripción del ítem</label>
              <input
                value={itemActual.descripcion}
                onChange={(e) => setItemActual({ ...itemActual, descripcion: e.target.value })}
                placeholder="Ej: Harina 25kg"
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div className="field">
                <label>Naturaleza</label>
                <select value={itemActual.naturaleza} onChange={(e) => cambiarNaturalezaItem(e.target.value)}>
                  {NATURALEZAS_EGRESO.map((n) => (
                    <option key={n.value} value={n.value}>{n.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Categoría específica</label>
                <select value={itemActual.categoriaEspecifica} onChange={(e) => setItemActual({ ...itemActual, categoriaEspecifica: e.target.value })}>
                  {(CATEGORIAS_POR_NATURALEZA[itemActual.naturaleza] ?? []).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
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

          {itemsDoc.length > 0 && (
            <div className="card" style={{ marginBottom: 14 }}>
              {itemsDoc.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: i < itemsDoc.length - 1 ? "1px solid var(--line)" : "none" }}>
                  <span style={{ fontSize: 13 }}>
                    {item.descripcion} <span className="mono" style={{ fontSize: 10, color: "var(--ink-soft)" }}>({item.categoriaEspecifica})</span>
                  </span>
                  <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span className="mono" style={{ fontSize: 13 }}>S/ {item.monto.toFixed(2)}</span>
                    <button onClick={() => quitarItem(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-soft)" }}>×</button>
                  </span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTop: "2px solid var(--ink)" }}>
                <span style={{ fontWeight: 500, fontSize: 13 }}>Total del documento</span>
                <span className="mono" style={{ fontWeight: 500 }}>S/ {totalDoc.toFixed(2)}</span>
              </div>
            </div>
          )}

          <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 10, textTransform: "uppercase" }}>
            Datos del documento
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {locales.length > 0 && (
              <div className="field">
                <label>Local (opcional)</label>
                <select value={formDoc.localId} onChange={(e) => setFormDoc({ ...formDoc, localId: e.target.value })}>
                  <option value="">Consolidado (sin local específico)</option>
                  {locales.map((l) => (
                    <option key={l.id} value={l.id}>{l.nombre}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label>Proveedor</label>
              <input value={formDoc.proveedorNombre} onChange={(e) => setFormDoc({ ...formDoc, proveedorNombre: e.target.value })} />
            </div>
            <div className="field">
              <label>Tipo de comprobante</label>
              <select value={formDoc.tipoComprobante} onChange={(e) => setFormDoc({ ...formDoc, tipoComprobante: e.target.value })}>
                {TIPOS_COMPROBANTE.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>N° de comprobante</label>
              <input value={formDoc.numeroComprobante} onChange={(e) => setFormDoc({ ...formDoc, numeroComprobante: e.target.value })} placeholder="Ej: F001-00234" />
            </div>
            <div className="field">
              <label>Fecha</label>
              <input type="date" value={formDoc.fecha} onChange={(e) => setFormDoc({ ...formDoc, fecha: e.target.value })} />
            </div>
            <div className="field">
              <label>¿Cómo se pagó?</label>
              <select value={formDoc.condicion} onChange={(e) => setFormDoc({ ...formDoc, condicion: e.target.value })}>
                <option value="contado">Al contado (ya se pagó)</option>
                <option value="credito">Al crédito (genera una sola cuenta por pagar)</option>
              </select>
            </div>
          </div>

          {formDoc.condicion === "contado" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="field">
                <label>Medio de pago</label>
                <select value={formDoc.medioPago} onChange={(e) => setFormDoc({ ...formDoc, medioPago: e.target.value })}>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Yape/Plin">Yape/Plin</option>
                  <option value="Tarjeta">Tarjeta</option>
                  <option value="Transferencia">Transferencia</option>
                </select>
              </div>
              {cuentasBancarias.length > 0 && (
                <div className="field">
                  <label>Cuenta de la que salió (opcional)</label>
                  <select value={formDoc.cuentaBancariaId} onChange={(e) => setFormDoc({ ...formDoc, cuentaBancariaId: e.target.value })}>
                    <option value="">No registrar en flujo de caja</option>
                    {cuentasBancarias.map((c) => (
                      <option key={c.id} value={c.id}>{c.bancoNombre} (S/ {Number(c.saldoActual).toFixed(2)})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : (
            <div className="field">
              <label>Fecha de vencimiento (opcional)</label>
              <input type="date" value={formDoc.fechaVencimiento} onChange={(e) => setFormDoc({ ...formDoc, fechaVencimiento: e.target.value })} />
            </div>
          )}

          {errorDoc && <p className="field error">{errorDoc}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button className="btn-primary" disabled={guardandoDoc} onClick={handleRegistrarDocumento}>
              {guardandoDoc ? "Guardando..." : `Registrar documento — S/ ${totalDoc.toFixed(2)}`}
            </button>
            <button className="btn-ghost" onClick={() => { setMostrarFormDocumento(false); setItemsDoc([]); setErrorDoc(null); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {(() => {
          const sinClasificar = gastos.filter((g) => !g.naturaleza);
          if (sinClasificar.length === 0) return null;
          const totalSinClasificar = sinClasificar.reduce((acc, g) => acc + Number(g.montoTotal), 0);
          const abierto = naturalezasAbiertas["__sin_clasificar__"] ?? false;
          return (
            <div className="card" style={{ padding: 0, overflow: "hidden", borderColor: "var(--stamp)" }}>
              <button
                onClick={() => setNaturalezasAbiertas({ ...naturalezasAbiertas, __sin_clasificar__: !abierto })}
                style={{
                  width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: 14, background: "none", border: "none", cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--stamp)" }}>
                  {abierto ? "▾" : "▸"} Sin clasificar
                </span>
                <span className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {sinClasificar.length} ítem{sinClasificar.length !== 1 ? "s" : ""} · S/ {totalSinClasificar.toFixed(2)} · no afecta resultados todavía
                </span>
              </button>

              {abierto && (
                <div style={{ borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column" }}>
                  {sinClasificar.map((g) => (
                    <div key={g.id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div>
                          <p style={{ fontSize: 13.5 }}>{g.descripcion}</p>
                          <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                            {g.proveedorNombre ? `${g.proveedorNombre} · ` : ""}
                            {g.numeroComprobante ? `${g.numeroComprobante} · ` : ""}
                            {new Date(g.fecha).toLocaleDateString("es-PE", { timeZone: "UTC" })}
                          </p>
                        </div>
                        <p className="mono" style={{ fontSize: 13 }}>S/ {Number(g.montoTotal).toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                  <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", padding: "10px 14px" }}>
                    Clasifícalos desde Cuentas por Pagar (Naturaleza del egreso y Categoría específica) para que se
                    sumen correctamente al Estado de Resultados.
                  </p>
                </div>
              )}
            </div>
          );
        })()}
        {NATURALEZAS_EGRESO.map((n) => {
          const gastosGrupo = gastos.filter((g) => g.naturaleza === n.value);
          if (gastosGrupo.length === 0) return null;
          const totalGrupo = gastosGrupo.reduce((acc, g) => acc + Number(g.montoTotal), 0);
          const abierto = naturalezasAbiertas[n.value] ?? false;
          return (
            <div key={n.value} className="card" style={{ padding: 0, overflow: "hidden" }}>
              <button
                onClick={() => setNaturalezasAbiertas({ ...naturalezasAbiertas, [n.value]: !abierto })}
                style={{
                  width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: 14, background: "none", border: "none", cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 500 }}>
                  {abierto ? "▾" : "▸"} {n.label}
                </span>
                <span className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {gastosGrupo.length} egreso{gastosGrupo.length !== 1 ? "s" : ""} · S/ {totalGrupo.toFixed(2)}
                </span>
              </button>

              {abierto && (
                <div style={{ borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column" }}>
                  {gastosGrupo.map((g) => (
                    <div key={g.id} style={{ padding: "12px 14px", borderBottom: "1px solid var(--line)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div>
                          <p style={{ fontSize: 13.5 }}>{g.descripcion}</p>
                          <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                            {g.categoriaEspecifica ? `${g.categoriaEspecifica}` : ""}
                            {g.numeroComprobante ? ` · ${g.numeroComprobante}` : ""}
                            {g.local ? ` · ${g.local}` : ""} · {new Date(g.fecha).toLocaleDateString("es-PE", { timeZone: "UTC" })}
                            {!g.impactaResultados && " · no afecta resultados"}
                          </p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p className="mono" style={{ fontSize: 13 }}>S/ {Number(g.montoTotal).toFixed(2)}</p>
                          <p className="mono" style={{ fontSize: 10, textTransform: "uppercase", color: g.estadoPago === "pendiente" ? "var(--stamp)" : "var(--teal)" }}>
                            {g.condicion === "credito" ? g.estadoPago : "pagado"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {gastos.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no hay gastos registrados.</p>
        )}
      </div>
    </main>
  );
}
