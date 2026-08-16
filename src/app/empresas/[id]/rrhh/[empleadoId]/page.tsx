"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type DetalleEmpleado = {
  id: string;
  nombres: string;
  apellidos: string;
  docIdentidad: string;
  cargo: string | null;
  fechaIngreso: string;
  tipoContrato: string | null;
  sueldoBasico: string;
  otrosIngresos: string;
  cuentaBancaria: string | null;
  sueldoTotal: number;
  totalAdelantosPendientes: number;
  saldoPorRecibir: number;
  adelantos: { id: string; monto: string; fecha: string; motivo: string | null; estado: string }[];
};
type CuentaOpcion = { id: string; bancoNombre: string; saldoActual: string };

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function DetalleTrabajadorPage({ params }: { params: { id: string; empleadoId: string } }) {
  const empresaId = params.id;
  const empleadoId = params.empleadoId;
  const [empleado, setEmpleado] = useState<DetalleEmpleado | null>(null);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaOpcion[]>([]);
  const [editando, setEditando] = useState(false);
  const [mostrarFormAdelanto, setMostrarFormAdelanto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorAdelanto, setErrorAdelanto] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [formEdit, setFormEdit] = useState({
    nombres: "", apellidos: "", docIdentidad: "", cargo: "", fechaIngreso: hoyISO(),
    tipoContrato: "", sueldoBasico: 0, otrosIngresos: 0, cuentaBancaria: "",
  });
  const [formAdelanto, setFormAdelanto] = useState({ monto: 0, fecha: hoyISO(), motivo: "", cuentaBancariaId: "" });

  async function cargar() {
    const [resEmpleado, resCatalogos] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/empleados/${empleadoId}`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/catalogos`).then((r) => r.json()),
    ]);
    setEmpleado(resEmpleado);
    setCuentasBancarias(resCatalogos.cuentasBancarias ?? []);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, empleadoId]);

  function abrirEdicion() {
    if (!empleado) return;
    setFormEdit({
      nombres: empleado.nombres,
      apellidos: empleado.apellidos,
      docIdentidad: empleado.docIdentidad,
      cargo: empleado.cargo ?? "",
      fechaIngreso: empleado.fechaIngreso.slice(0, 10),
      tipoContrato: empleado.tipoContrato ?? "",
      sueldoBasico: Number(empleado.sueldoBasico),
      otrosIngresos: Number(empleado.otrosIngresos),
      cuentaBancaria: empleado.cuentaBancaria ?? "",
    });
    setEditando(true);
    setError(null);
  }

  async function guardarEdicion(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardando(true);
    const res = await fetch(`/api/empresas/${empresaId}/empleados/${empleadoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formEdit),
    });
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo guardar los cambios.");
      return;
    }
    setEditando(false);
    cargar();
  }

  async function handleRegistrarAdelanto(e: React.FormEvent) {
    e.preventDefault();
    setErrorAdelanto(null);
    const res = await fetch(`/api/empresas/${empresaId}/adelantos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...formAdelanto, empleadoId }),
    });
    if (!res.ok) {
      const data = await res.json();
      setErrorAdelanto(data.error?.toString() ?? "No se pudo registrar el adelanto.");
      return;
    }
    setFormAdelanto({ monto: 0, fecha: hoyISO(), motivo: "", cuentaBancariaId: "" });
    setMostrarFormAdelanto(false);
    cargar();
  }

  async function handleMarcarDescontado(adelantoId: string) {
    await fetch(`/api/empresas/${empresaId}/adelantos/${adelantoId}`, { method: "PATCH" });
    cargar();
  }

  if (!empleado) {
    return (
      <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px" }}>
        <p style={{ color: "var(--ink-soft)" }}>Cargando...</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}/rrhh`} style={{ color: "inherit" }}>
          RRHH
        </Link>{" "}
        → <b>{empleado.nombres} {empleado.apellidos}</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>{empleado.nombres} {empleado.apellidos}</h1>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 20 }}>
        {empleado.cargo ?? "Sin cargo"} · {empleado.docIdentidad} · Ingreso: {new Date(empleado.fechaIngreso).toLocaleDateString("es-PE", { timeZone: "UTC" })}
      </p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13 }}>Sueldo básico + otros ingresos</span>
          <span className="mono" style={{ fontSize: 13 }}>S/ {empleado.sueldoTotal.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13 }}>(−) Adelantos pendientes de descontar</span>
          <span className="mono" style={{ fontSize: 13, color: "var(--alert)" }}>S/ {empleado.totalAdelantosPendientes.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "2px solid var(--ink)" }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Saldo pendiente por recibir</span>
          <span className="mono" style={{ fontWeight: 600, fontSize: 15, color: "var(--teal)" }}>S/ {empleado.saldoPorRecibir.toFixed(2)}</span>
        </div>
      </div>

      {!editando ? (
        <button className="btn-ghost" onClick={abrirEdicion} style={{ marginBottom: 20 }}>
          Editar datos del trabajador
        </button>
      ) : (
        <form onSubmit={guardarEdicion} className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Editar trabajador</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>Nombres</label>
              <input value={formEdit.nombres} onChange={(e) => setFormEdit({ ...formEdit, nombres: e.target.value })} required />
            </div>
            <div className="field">
              <label>Apellidos</label>
              <input value={formEdit.apellidos} onChange={(e) => setFormEdit({ ...formEdit, apellidos: e.target.value })} required />
            </div>
            <div className="field">
              <label>DNI / Carné de extranjería</label>
              <input value={formEdit.docIdentidad} onChange={(e) => setFormEdit({ ...formEdit, docIdentidad: e.target.value })} required />
            </div>
            <div className="field">
              <label>Cargo</label>
              <input value={formEdit.cargo} onChange={(e) => setFormEdit({ ...formEdit, cargo: e.target.value })} />
            </div>
            <div className="field">
              <label>Fecha de ingreso</label>
              <input type="date" value={formEdit.fechaIngreso} onChange={(e) => setFormEdit({ ...formEdit, fechaIngreso: e.target.value })} required />
            </div>
            <div className="field">
              <label>Tipo de contrato</label>
              <input value={formEdit.tipoContrato} onChange={(e) => setFormEdit({ ...formEdit, tipoContrato: e.target.value })} />
            </div>
            <div className="field">
              <label>Sueldo básico (S/)</label>
              <input type="number" step="0.01" value={formEdit.sueldoBasico} onChange={(e) => setFormEdit({ ...formEdit, sueldoBasico: Number(e.target.value) })} required />
            </div>
            <div className="field">
              <label>Otros ingresos fijos (S/)</label>
              <input type="number" step="0.01" value={formEdit.otrosIngresos} onChange={(e) => setFormEdit({ ...formEdit, otrosIngresos: Number(e.target.value) })} />
            </div>
            <div className="field" style={{ gridColumn: "span 2" }}>
              <label>Cuenta bancaria del trabajador</label>
              <input value={formEdit.cuentaBancaria} onChange={(e) => setFormEdit({ ...formEdit, cuentaBancaria: e.target.value })} />
            </div>
          </div>
          {error && <p className="field error">{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar cambios"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setEditando(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Adelantos de sueldo</h2>
      {!mostrarFormAdelanto ? (
        <button className="btn-primary" onClick={() => setMostrarFormAdelanto(true)} style={{ marginBottom: 20 }}>
          + Registrar adelanto
        </button>
      ) : (
        <form onSubmit={handleRegistrarAdelanto} className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>Monto (S/)</label>
              <input type="number" step="0.01" value={formAdelanto.monto} onChange={(e) => setFormAdelanto({ ...formAdelanto, monto: Number(e.target.value) })} required />
            </div>
            <div className="field">
              <label>Fecha</label>
              <input type="date" value={formAdelanto.fecha} onChange={(e) => setFormAdelanto({ ...formAdelanto, fecha: e.target.value })} required />
            </div>
            {cuentasBancarias.length > 0 && (
              <div className="field">
                <label>Cuenta de origen (opcional)</label>
                <select value={formAdelanto.cuentaBancariaId} onChange={(e) => setFormAdelanto({ ...formAdelanto, cuentaBancariaId: e.target.value })}>
                  <option value="">No registrar en flujo de caja</option>
                  {cuentasBancarias.map((c) => (
                    <option key={c.id} value={c.id}>{c.bancoNombre} (S/ {Number(c.saldoActual).toFixed(2)})</option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label>Motivo (opcional)</label>
              <input value={formAdelanto.motivo} onChange={(e) => setFormAdelanto({ ...formAdelanto, motivo: e.target.value })} />
            </div>
          </div>
          {errorAdelanto && <p className="field error">{errorAdelanto}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="btn-primary">Registrar</button>
            <button type="button" className="btn-ghost" onClick={() => setMostrarFormAdelanto(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {empleado.adelantos.map((a) => (
          <div key={a.id} className="card" style={{ display: "flex", justifyContent: "space-between", padding: 14 }}>
            <div>
              <p style={{ fontSize: 14 }}>{a.motivo ?? "Adelanto de sueldo"}</p>
              <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                {new Date(a.fecha).toLocaleDateString("es-PE", { timeZone: "UTC" })}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p className="mono" style={{ fontSize: 13 }}>S/ {Number(a.monto).toFixed(2)}</p>
              {a.estado === "pendiente" ? (
                <button
                  onClick={() => handleMarcarDescontado(a.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: "var(--stamp)", textTransform: "uppercase" }}
                >
                  Pendiente · marcar descontado
                </button>
              ) : (
                <p className="mono" style={{ fontSize: 10, color: "var(--teal)", textTransform: "uppercase" }}>Descontado</p>
              )}
            </div>
          </div>
        ))}
        {empleado.adelantos.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Este trabajador no tiene adelantos registrados.</p>
        )}
      </div>
    </main>
  );
}
