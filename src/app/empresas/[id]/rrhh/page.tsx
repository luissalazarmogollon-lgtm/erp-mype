"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Empleado = {
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
};
type Adelanto = { id: string; empleado: string; monto: string; fecha: string; motivo: string | null; estado: string };
type CuentaOpcion = { id: string; bancoNombre: string; saldoActual: string };

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function RrhhPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [adelantos, setAdelantos] = useState<Adelanto[]>([]);
  const [cuentas, setCuentas] = useState<CuentaOpcion[]>([]);
  const [mostrarFormEmpleado, setMostrarFormEmpleado] = useState(false);
  const [mostrarFormAdelanto, setMostrarFormAdelanto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formEmpleado, setFormEmpleado] = useState({
    nombres: "",
    apellidos: "",
    docIdentidad: "",
    cargo: "",
    fechaIngreso: hoyISO(),
    tipoContrato: "",
    sueldoBasico: 0,
    otrosIngresos: 0,
    cuentaBancaria: "",
  });
  const [formAdelanto, setFormAdelanto] = useState({
    empleadoId: "",
    monto: 0,
    fecha: hoyISO(),
    motivo: "",
    cuentaBancariaId: "",
  });

  async function cargar() {
    const [resEmpleados, resAdelantos, resCatalogos] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/empleados`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/adelantos`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/catalogos`).then((r) => r.json()),
    ]);
    setEmpleados(resEmpleados);
    setAdelantos(resAdelantos);
    setCuentas(resCatalogos.cuentasBancarias ?? []);
    if (resEmpleados.length > 0 && !formAdelanto.empleadoId) {
      setFormAdelanto((f) => ({ ...f, empleadoId: resEmpleados[0].id }));
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function handleCrearEmpleado(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/empresas/${empresaId}/empleados`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formEmpleado),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo registrar el trabajador.");
      return;
    }
    setFormEmpleado({
      nombres: "", apellidos: "", docIdentidad: "", cargo: "", fechaIngreso: hoyISO(),
      tipoContrato: "", sueldoBasico: 0, otrosIngresos: 0, cuentaBancaria: "",
    });
    setMostrarFormEmpleado(false);
    cargar();
  }

  async function handleCrearAdelanto(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!formAdelanto.empleadoId) {
      setError("Selecciona un trabajador.");
      return;
    }
    const res = await fetch(`/api/empresas/${empresaId}/adelantos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formAdelanto),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo registrar el adelanto.");
      return;
    }
    setFormAdelanto({ ...formAdelanto, monto: 0, motivo: "" });
    setMostrarFormAdelanto(false);
    cargar();
  }

  async function handleMarcarDescontado(adelantoId: string) {
    await fetch(`/api/empresas/${empresaId}/adelantos/${adelantoId}`, { method: "PATCH" });
    cargar();
  }

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>RRHH</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 20 }}>RRHH — Trabajadores y adelantos</h1>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Trabajadores</h2>
      {!mostrarFormEmpleado ? (
        <button className="btn-primary" onClick={() => setMostrarFormEmpleado(true)} style={{ marginBottom: 20 }}>
          + Registrar trabajador
        </button>
      ) : (
        <form onSubmit={handleCrearEmpleado} className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>Nombres</label>
              <input value={formEmpleado.nombres} onChange={(e) => setFormEmpleado({ ...formEmpleado, nombres: e.target.value })} required />
            </div>
            <div className="field">
              <label>Apellidos</label>
              <input value={formEmpleado.apellidos} onChange={(e) => setFormEmpleado({ ...formEmpleado, apellidos: e.target.value })} required />
            </div>
            <div className="field">
              <label>DNI / Carné de extranjería</label>
              <input value={formEmpleado.docIdentidad} onChange={(e) => setFormEmpleado({ ...formEmpleado, docIdentidad: e.target.value })} required />
            </div>
            <div className="field">
              <label>Cargo</label>
              <input value={formEmpleado.cargo} onChange={(e) => setFormEmpleado({ ...formEmpleado, cargo: e.target.value })} placeholder="Ej: Cocinero, Cajero" />
            </div>
            <div className="field">
              <label>Fecha de ingreso</label>
              <input type="date" value={formEmpleado.fechaIngreso} onChange={(e) => setFormEmpleado({ ...formEmpleado, fechaIngreso: e.target.value })} required />
            </div>
            <div className="field">
              <label>Tipo de contrato</label>
              <input value={formEmpleado.tipoContrato} onChange={(e) => setFormEmpleado({ ...formEmpleado, tipoContrato: e.target.value })} placeholder="Ej: Planilla, Recibo por honorarios" />
            </div>
            <div className="field">
              <label>Sueldo básico (S/)</label>
              <input type="number" step="0.01" value={formEmpleado.sueldoBasico} onChange={(e) => setFormEmpleado({ ...formEmpleado, sueldoBasico: Number(e.target.value) })} required />
            </div>
            <div className="field">
              <label>Otros ingresos fijos (S/, opcional)</label>
              <input type="number" step="0.01" value={formEmpleado.otrosIngresos} onChange={(e) => setFormEmpleado({ ...formEmpleado, otrosIngresos: Number(e.target.value) })} />
            </div>
            <div className="field" style={{ gridColumn: "span 2" }}>
              <label>Cuenta bancaria del trabajador (opcional, para transferencia de sueldo)</label>
              <input value={formEmpleado.cuentaBancaria} onChange={(e) => setFormEmpleado({ ...formEmpleado, cuentaBancaria: e.target.value })} />
            </div>
          </div>
          {error && <p className="field error">{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="btn-primary">Registrar</button>
            <button type="button" className="btn-ghost" onClick={() => setMostrarFormEmpleado(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 32 }}>
        {empleados.map((e) => (
          <div key={e.id} className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{e.nombres} {e.apellidos}</p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {e.cargo ?? "Sin cargo"} · {e.docIdentidad} · Ingreso: {new Date(e.fechaIngreso).toLocaleDateString("es-PE")}
                </p>
              </div>
              <p className="mono" style={{ fontSize: 13 }}>S/ {Number(e.sueldoBasico).toFixed(2)}</p>
            </div>
          </div>
        ))}
        {empleados.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no has registrado ningún trabajador.</p>
        )}
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Adelantos de sueldo</h2>
      {!mostrarFormAdelanto ? (
        <button className="btn-primary" onClick={() => setMostrarFormAdelanto(true)} style={{ marginBottom: 20 }} disabled={empleados.length === 0}>
          + Registrar adelanto
        </button>
      ) : (
        <form onSubmit={handleCrearAdelanto} className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>Trabajador</label>
              <select value={formAdelanto.empleadoId} onChange={(e) => setFormAdelanto({ ...formAdelanto, empleadoId: e.target.value })}>
                {empleados.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.nombres} {emp.apellidos}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Monto (S/)</label>
              <input type="number" step="0.01" value={formAdelanto.monto} onChange={(e) => setFormAdelanto({ ...formAdelanto, monto: Number(e.target.value) })} required />
            </div>
            <div className="field">
              <label>Fecha</label>
              <input type="date" value={formAdelanto.fecha} onChange={(e) => setFormAdelanto({ ...formAdelanto, fecha: e.target.value })} required />
            </div>
            {cuentas.length > 0 && (
              <div className="field">
                <label>Cuenta de origen (opcional)</label>
                <select value={formAdelanto.cuentaBancariaId} onChange={(e) => setFormAdelanto({ ...formAdelanto, cuentaBancariaId: e.target.value })}>
                  <option value="">No registrar en flujo de caja</option>
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>{c.bancoNombre} (S/ {Number(c.saldoActual).toFixed(2)})</option>
                  ))}
                </select>
              </div>
            )}
            <div className="field" style={{ gridColumn: "span 2" }}>
              <label>Motivo (opcional)</label>
              <input value={formAdelanto.motivo} onChange={(e) => setFormAdelanto({ ...formAdelanto, motivo: e.target.value })} />
            </div>
          </div>
          {error && <p className="field error">{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="btn-primary">Registrar</button>
            <button type="button" className="btn-ghost" onClick={() => setMostrarFormAdelanto(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {adelantos.map((a) => (
          <div key={a.id} className="card" style={{ display: "flex", justifyContent: "space-between", padding: 14 }}>
            <div>
              <p style={{ fontSize: 14 }}>{a.empleado}</p>
              <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                {a.motivo ?? "-"} · {new Date(a.fecha).toLocaleDateString("es-PE")}
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
        {adelantos.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no hay adelantos registrados.</p>
        )}
      </div>
    </main>
  );
}
