"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type EmpleadoDetalle = {
  empleadoId: string;
  nombres: string;
  apellidos: string;
  horasMensuales: number;
  costoHora: number;
  capacidadMensualHoras: number;
  horasRealesMes: number;
  excedeHorasPresupuestadas: boolean;
};
type TareaResumen = {
  id: string;
  titulo: string;
  fecha: string;
  empleadoNombre: string;
  tipoActividad: string | null;
  horasEstimadas: number;
  horasReales: number | null;
  estado: string;
};
type Detalle = {
  id: string;
  clienteId: string;
  clienteNombre: string;
  fechaInicio: string;
  estado: string;
  precioVentaMensual: number | null;
  costoMensual: number;
  precioSugerido: number;
  margenReal: number | null;
  margenEnRiesgo: boolean;
  empleados: EmpleadoDetalle[];
  tareasDelMes: TareaResumen[];
};
type EmpleadoOpcion = { id: string; nombres: string; apellidos: string };

export default function ServicioClienteDetallePage({ params }: { params: { id: string; asignacionId: string } }) {
  const empresaId = params.id;
  const asignacionId = params.asignacionId;
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [empleadosDisponibles, setEmpleadosDisponibles] = useState<EmpleadoOpcion[]>([]);
  const [editandoPrecio, setEditandoPrecio] = useState(false);
  const [precio, setPrecio] = useState("");
  const [editandoEquipo, setEditandoEquipo] = useState(false);
  const [filasEquipo, setFilasEquipo] = useState<{ empleadoId: string; horasMensuales: number }[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  async function cargar() {
    const [resDetalle, resEmpleados] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/actividades/clientes/${asignacionId}`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/empleados`).then((r) => r.json()),
    ]);
    setDetalle(resDetalle);
    setEmpleadosDisponibles(Array.isArray(resEmpleados) ? resEmpleados : []);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, asignacionId]);

  function abrirEdicionEquipo() {
    if (!detalle) return;
    setFilasEquipo(detalle.empleados.map((e) => ({ empleadoId: e.empleadoId, horasMensuales: e.horasMensuales })));
    setAvisos([]);
    setError(null);
    setEditandoEquipo(true);
  }

  async function guardarEquipo() {
    const validas = filasEquipo.filter((f) => f.empleadoId && f.horasMensuales > 0);
    if (validas.length === 0) {
      setError("Agrega al menos un trabajador con horas asignadas.");
      return;
    }
    setError(null);
    setGuardando(true);
    const res = await fetch(`/api/empresas/${empresaId}/actividades/clientes/${asignacionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empleados: validas }),
    });
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo guardar.");
      return;
    }
    const data = await res.json();
    setAvisos(data.advertenciasCapacidad ?? []);
    setEditandoEquipo(false);
    cargar();
  }

  async function guardarPrecio() {
    setError(null);
    setGuardando(true);
    const res = await fetch(`/api/empresas/${empresaId}/actividades/clientes/${asignacionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ precioVentaMensual: precio ? Number(precio) : undefined }),
    });
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo guardar.");
      return;
    }
    setEditandoPrecio(false);
    cargar();
  }

  async function finalizarServicio() {
    if (!confirm("¿Finalizar este servicio? Dejará de contar en la carga y capacidad de los trabajadores asignados.")) return;
    await fetch(`/api/empresas/${empresaId}/actividades/clientes/${asignacionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "inactivo" }),
    });
    cargar();
  }

  if (!detalle) {
    return (
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
        <p style={{ color: "var(--ink-soft)" }}>Cargando...</p>
      </main>
    );
  }

  const precioMostrado = detalle.precioVentaMensual ?? detalle.precioSugerido;

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}/actividades/clientes`} style={{ color: "inherit" }}>
          Servicios por cliente
        </Link>{" "}
        → <b>{detalle.clienteNombre}</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>{detalle.clienteNombre}</h1>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 20 }}>
        Servicio desde {new Date(detalle.fechaInicio).toLocaleDateString("es-PE", { timeZone: "UTC" })}
        {detalle.estado === "inactivo" && " · FINALIZADO"}
      </p>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13 }}>Costo mensual (horas × costo/hora de cada trabajador)</span>
          <span className="mono" style={{ fontSize: 13 }}>S/ {detalle.costoMensual.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 13 }}>Precio sugerido (40% de rentabilidad)</span>
          <span className="mono" style={{ fontSize: 13 }}>S/ {detalle.precioSugerido.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "2px solid var(--ink)" }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Precio pactado con el cliente</span>
          {!editandoPrecio ? (
            <span
              className="mono"
              style={{ fontWeight: 600, fontSize: 15, cursor: "pointer" }}
              onClick={() => { setPrecio(detalle.precioVentaMensual?.toString() ?? ""); setEditandoPrecio(true); }}
            >
              S/ {precioMostrado.toFixed(2)} {detalle.precioVentaMensual === null && "(sugerido, click para fijar)"}
            </span>
          ) : (
            <span style={{ display: "flex", gap: 6 }}>
              <input type="number" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} style={{ width: 120 }} />
              <button className="btn-primary" style={{ fontSize: 11, padding: "4px 10px" }} onClick={guardarPrecio} disabled={guardando}>
                Guardar
              </button>
              <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setEditandoPrecio(false)}>
                Cancelar
              </button>
            </span>
          )}
        </div>
        {error && <p className="field error">{error}</p>}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
          <span style={{ fontSize: 13 }}>Margen real</span>
          <span className="mono" style={{ fontSize: 13, color: detalle.margenEnRiesgo ? "var(--alert)" : "var(--teal)" }}>
            {detalle.margenReal !== null ? `${(detalle.margenReal * 100).toFixed(1)}%` : "— (sin precio pactado)"}
          </span>
        </div>
        {detalle.margenEnRiesgo && (
          <p className="mono" style={{ fontSize: 11, color: "var(--alert)", marginTop: 8 }}>
            ⚠ El margen real está por debajo del 40% objetivo — revisa las horas asignadas o el precio pactado.
          </p>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>Distribución de recursos</h2>
        {!editandoEquipo && detalle.estado === "activo" && (
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={abrirEdicionEquipo}>
            Editar equipo asignado
          </button>
        )}
      </div>

      {avisos.length > 0 && (
        <div style={{ background: "var(--stamp)", color: "#fff", padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {avisos.map((a, i) => (
            <p key={i} style={{ fontSize: 12, margin: 0 }}>⚠ {a}</p>
          ))}
        </div>
      )}

      {editandoEquipo ? (
        <div className="card" style={{ marginBottom: 24 }}>
          {filasEquipo.map((f, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 10, marginBottom: 8, alignItems: "center" }}>
              <select
                value={f.empleadoId}
                onChange={(e) => setFilasEquipo((fs) => fs.map((x, idx) => (idx === i ? { ...x, empleadoId: e.target.value } : x)))}
              >
                <option value="">Elige trabajador...</option>
                {empleadosDisponibles.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.nombres} {emp.apellidos}</option>
                ))}
              </select>
              <input
                type="number"
                step="0.5"
                value={f.horasMensuales}
                onChange={(e) => setFilasEquipo((fs) => fs.map((x, idx) => (idx === i ? { ...x, horasMensuales: Number(e.target.value) } : x)))}
                placeholder="Horas/mes"
              />
              <button type="button" className="btn-ghost" onClick={() => setFilasEquipo((fs) => fs.filter((_, idx) => idx !== i))}>
                Quitar
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setFilasEquipo((fs) => [...fs, { empleadoId: "", horasMensuales: 10 }])}
            style={{ marginBottom: 10 }}
          >
            + Agregar trabajador
          </button>
          {error && <p className="field error">{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-primary" disabled={guardando} onClick={guardarEquipo}>
              {guardando ? "Guardando..." : "Guardar equipo"}
            </button>
            <button className="btn-ghost" onClick={() => setEditandoEquipo(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {detalle.empleados.map((e) => (
            <div key={e.empleadoId} className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500 }}>
                    {e.nombres} {e.apellidos}
                    {e.excedeHorasPresupuestadas && (
                      <span className="mono" style={{ fontSize: 10, color: "var(--alert)", marginLeft: 8, textTransform: "uppercase" }}>
                        Excede lo presupuestado
                      </span>
                    )}
                  </p>
                  <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                    Presupuesto: {e.horasMensuales}h/mes · Costo/hora: S/ {e.costoHora.toFixed(2)} · Capacidad total: {e.capacidadMensualHoras}h/mes
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p className="mono" style={{ fontSize: 13 }}>Real este mes: {e.horasRealesMes}h</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Tareas de este mes</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
        {detalle.tareasDelMes.map((t) => (
          <Link
            key={t.id}
            href={`/empresas/${empresaId}/actividades/tareas/${t.id}`}
            className="card"
            style={{ padding: 12, textDecoration: "none", color: "inherit", display: "flex", justifyContent: "space-between" }}
          >
            <span style={{ fontSize: 13 }}>{t.titulo} · {t.empleadoNombre}</span>
            <span className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
              {new Date(t.fecha).toLocaleDateString("es-PE", { timeZone: "UTC" })} · {t.horasReales ?? t.horasEstimadas}h
            </span>
          </Link>
        ))}
        {detalle.tareasDelMes.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>Sin tareas registradas este mes.</p>
        )}
      </div>

      {detalle.estado === "activo" && (
        <button className="btn-ghost" style={{ color: "var(--alert)" }} onClick={finalizarServicio}>
          Finalizar servicio
        </button>
      )}
    </main>
  );
}
