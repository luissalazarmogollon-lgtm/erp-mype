"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Empleado = { id: string; nombres: string; apellidos: string };
type Cliente = { id: string; nombre: string };
type EmpleadoAsignado = {
  empleadoId: string;
  nombres: string;
  apellidos: string;
  horasMensuales: number;
  costoHora: number;
  excedeCapacidad: boolean;
};
type Asignacion = {
  id: string;
  clienteId: string;
  clienteNombre: string;
  precioVentaMensual: number | null;
  costoMensual: number;
  precioSugerido: number;
  margenReal: number | null;
  margenEnRiesgo: boolean;
  empleados: EmpleadoAsignado[];
  algunEmpleadoExcedeCapacidad: boolean;
};

const FILA_VACIA = { empleadoId: "", horasMensuales: 10 };

export default function ServiciosPorClientePage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [precioVentaMensual, setPrecioVentaMensual] = useState<string>("");
  const [filas, setFilas] = useState([{ ...FILA_VACIA }]);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const [resAsignaciones, resEmpleados, resClientes] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/actividades/clientes`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/empleados`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/clientes`).then((r) => r.json()),
    ]);
    setAsignaciones(Array.isArray(resAsignaciones) ? resAsignaciones : []);
    setEmpleados(Array.isArray(resEmpleados) ? resEmpleados : []);
    setClientes(Array.isArray(resClientes) ? resClientes : []);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const clientesSinServicio = clientes.filter((c) => !asignaciones.some((a) => a.clienteId === c.id));

  function actualizarFila(i: number, campo: "empleadoId" | "horasMensuales", valor: string) {
    setFilas((fs) => fs.map((f, idx) => (idx === i ? { ...f, [campo]: campo === "horasMensuales" ? Number(valor) : valor } : f)));
  }

  // El costo/hora real depende del sueldo de cada trabajador y se calcula
  // en el servidor al guardar; acá solo mostramos el total de horas como
  // referencia rápida mientras se arma el equipo del servicio.
  const horasTotales = filas.reduce((acc, f) => acc + (f.horasMensuales || 0), 0);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAvisos([]);
    if (!clienteId) {
      setError("Elige el cliente.");
      return;
    }
    const empleadosValidos = filas.filter((f) => f.empleadoId && f.horasMensuales > 0);
    if (empleadosValidos.length === 0) {
      setError("Agrega al menos un trabajador con horas asignadas.");
      return;
    }
    setGuardando(true);
    const res = await fetch(`/api/empresas/${empresaId}/actividades/clientes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clienteId,
        precioVentaMensual: precioVentaMensual ? Number(precioVentaMensual) : undefined,
        empleados: empleadosValidos,
      }),
    });
    setGuardando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo guardar el servicio.");
      return;
    }

    const data = await res.json();
    if (data.advertenciasCapacidad?.length > 0) setAvisos(data.advertenciasCapacidad);

    setClienteId("");
    setPrecioVentaMensual("");
    setFilas([{ ...FILA_VACIA }]);
    setMostrarForm(false);
    cargar();
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}/actividades`} style={{ color: "inherit" }}>
          Gestión de Actividades
        </Link>{" "}
        → <b>Servicios por cliente</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Servicios por cliente</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 20 }}>
        Al iniciar un servicio, define qué trabajadores le dedican tiempo y cuántas horas al mes cada uno. Con eso se
        calcula el costo, el precio sugerido para una rentabilidad del 40%, y si algún trabajador queda sobrecargado.
      </p>

      {!mostrarForm ? (
        <button className="btn-primary" onClick={() => setMostrarForm(true)} style={{ marginBottom: 20 }}>
          + Configurar servicio para un cliente
        </button>
      ) : (
        <form onSubmit={handleCrear} className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Nuevo servicio</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>Cliente</label>
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} required>
                <option value="">Elige...</option>
                {clientesSinServicio.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Precio de venta mensual pactado (opcional)</label>
              <input
                type="number"
                step="0.01"
                value={precioVentaMensual}
                onChange={(e) => setPrecioVentaMensual(e.target.value)}
                placeholder="Si lo dejas vacío, se usa el precio sugerido (40% de margen)"
              />
            </div>
          </div>

          <p className="mono" style={{ fontSize: 12, marginTop: 14, marginBottom: 6, textTransform: "uppercase", color: "var(--ink-soft)" }}>
            Trabajadores asignados
          </p>
          {filas.map((f, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 10, marginBottom: 8, alignItems: "center" }}>
              <select value={f.empleadoId} onChange={(e) => actualizarFila(i, "empleadoId", e.target.value)}>
                <option value="">Elige trabajador...</option>
                {empleados.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.nombres} {emp.apellidos}</option>
                ))}
              </select>
              <input
                type="number"
                step="0.5"
                value={f.horasMensuales}
                onChange={(e) => actualizarFila(i, "horasMensuales", e.target.value)}
                placeholder="Horas/mes"
              />
              <button type="button" className="btn-ghost" onClick={() => setFilas((fs) => fs.filter((_, idx) => idx !== i))}>
                Quitar
              </button>
            </div>
          ))}
          <button type="button" className="btn-ghost" onClick={() => setFilas((fs) => [...fs, { ...FILA_VACIA }])} style={{ marginBottom: 10 }}>
            + Agregar trabajador
          </button>
          <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 10 }}>
            Total: {horasTotales}h/mes entre los trabajadores asignados.
          </p>

          {error && <p className="field error">{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar configuración"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setMostrarForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {avisos.length > 0 && (
        <div style={{ background: "var(--stamp)", color: "#fff", padding: 12, borderRadius: 6, marginBottom: 20 }}>
          {avisos.map((a, i) => (
            <p key={i} style={{ fontSize: 12, margin: 0 }}>⚠ {a}</p>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {asignaciones.map((a) => (
          <Link
            key={a.id}
            href={`/empresas/${empresaId}/actividades/clientes/${a.id}`}
            className="card"
            style={{ padding: 14, textDecoration: "none", color: "inherit", display: "block" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>
                  {a.clienteNombre}
                  {a.algunEmpleadoExcedeCapacidad && (
                    <span className="mono" style={{ fontSize: 10, color: "var(--alert)", marginLeft: 8, textTransform: "uppercase" }}>
                      Personal sobrecargado
                    </span>
                  )}
                  {a.margenEnRiesgo && (
                    <span className="mono" style={{ fontSize: 10, color: "var(--alert)", marginLeft: 8, textTransform: "uppercase" }}>
                      Rentabilidad en riesgo
                    </span>
                  )}
                </p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {a.empleados.map((e) => `${e.nombres} (${e.horasMensuales}h)`).join(" · ")}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p className="mono" style={{ fontSize: 13 }}>
                  Precio: S/ {(a.precioVentaMensual ?? a.precioSugerido).toFixed(2)}
                  {a.precioVentaMensual === null && " (sugerido)"}
                </p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  Costo: S/ {a.costoMensual.toFixed(2)} · Margen: {a.margenReal !== null ? `${(a.margenReal * 100).toFixed(0)}%` : "—"}
                </p>
              </div>
            </div>
          </Link>
        ))}
        {asignaciones.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no has configurado ningún servicio.</p>
        )}
      </div>
    </main>
  );
}
