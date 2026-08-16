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
type Adelanto = { id: string; empleadoId: string; monto: string; estado: string };

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function RrhhPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [adelantos, setAdelantos] = useState<Adelanto[]>([]);
  const [mostrarFormEmpleado, setMostrarFormEmpleado] = useState(false);
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

  async function cargar() {
    const [resEmpleados, resAdelantos] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/empleados`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/adelantos`).then((r) => r.json()),
    ]);
    setEmpleados(resEmpleados);
    setAdelantos(resAdelantos);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  function saldoPorRecibir(e: Empleado) {
    const pendientes = adelantos
      .filter((a) => a.empleadoId === e.id && a.estado === "pendiente")
      .reduce((acc, a) => acc + Number(a.monto), 0);
    return Number(e.sueldoBasico) + Number(e.otrosIngresos) - pendientes;
  }

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

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>RRHH</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>RRHH — Trabajadores</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 20 }}>
        Entra a cada trabajador para editar sus datos, registrar adelantos, y ver su saldo pendiente por recibir.
      </p>

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

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {empleados.map((e) => (
          <Link
            key={e.id}
            href={`/empresas/${empresaId}/rrhh/${e.id}`}
            className="card"
            style={{ padding: 14, textDecoration: "none", color: "inherit", display: "block" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>{e.nombres} {e.apellidos}</p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {e.cargo ?? "Sin cargo"} · {e.docIdentidad} · Ingreso: {new Date(e.fechaIngreso).toLocaleDateString("es-PE", { timeZone: "UTC" })}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p className="mono" style={{ fontSize: 13 }}>Sueldo: S/ {Number(e.sueldoBasico).toFixed(2)}</p>
                <p className="mono" style={{ fontSize: 11, color: "var(--teal)" }}>
                  Por recibir: S/ {saldoPorRecibir(e).toFixed(2)}
                </p>
              </div>
            </div>
          </Link>
        ))}
        {empleados.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no has registrado ningún trabajador.</p>
        )}
      </div>
    </main>
  );
}
