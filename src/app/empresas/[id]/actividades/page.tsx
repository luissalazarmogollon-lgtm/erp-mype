"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Empleado = { id: string; nombres: string; apellidos: string; telefono: string | null };
type Cliente = { id: string; nombre: string };
type TipoActividad = { id: string; nombre: string; tiempoEstimadoMin: number | null };
type Tarea = {
  id: string;
  empleadoId: string;
  empleadoNombre: string;
  empleadoCargo: string | null;
  empleadoTelefono: string | null;
  clienteId: string | null;
  clienteNombre: string | null;
  tipoActividadNombre: string | null;
  titulo: string;
  fecha: string;
  horasEstimadas: number;
  horasReales: number | null;
  estado: string;
  atrasada: boolean;
  whatsappEnviadoEn: string | null;
};
type AlertaVencimiento = "atrasada" | "hoy" | "manana" | null;
type MiTarea = {
  id: string;
  titulo: string;
  clienteNombre: string | null;
  tipoActividadNombre: string | null;
  fecha: string;
  horasEstimadas: number;
  estado: string;
  recibidoEn: string | null;
  alertaVencimiento: AlertaVencimiento;
};

function textoAlerta(a: AlertaVencimiento) {
  if (a === "atrasada") return "⚠ atrasada";
  if (a === "hoy") return "⏰ vence hoy";
  if (a === "manana") return "⏰ vence mañana";
  return null;
}

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function fechaCorta(f: string) {
  return new Date(f).toLocaleDateString("es-PE", { timeZone: "UTC", day: "2-digit", month: "short" });
}

const FORM_VACIO = {
  empleadoId: "",
  clienteId: "",
  tipoActividadId: "",
  titulo: "",
  descripcion: "",
  fecha: hoyISO(),
  horasEstimadas: 1,
};

// Paleta funcional para el "cargo" del trabajador (Mantenimiento,
// Supervisión, Gerencia, etc.) — solo sirve para distinguir grupos de un
// vistazo, no tiene significado de marca. Se elige por hash del texto
// para que el mismo cargo siempre caiga en el mismo color.
const PALETA_CARGO = [
  { bg: "var(--brand-bg)", fg: "var(--brand-dark)" },
  { bg: "var(--stamp-bg)", fg: "var(--stamp)" },
  { bg: "var(--teal-bg)", fg: "var(--teal)" },
  { bg: "#e7e4fa", fg: "#5b4fb0" },
  { bg: "#f5e1ee", fg: "#99417c" },
  { bg: "#ece0d1", fg: "#7a5230" },
];

function colorCargo(cargo: string | null) {
  if (!cargo) return PALETA_CARGO[0];
  let h = 0;
  for (let i = 0; i < cargo.length; i++) h = (h * 31 + cargo.charCodeAt(i)) % PALETA_CARGO.length;
  return PALETA_CARGO[h];
}

const FILTROS_ESTADO = [
  { value: "", label: "Todos los estados" },
  { value: "atrasada", label: "Atrasadas" },
  { value: "pendiente", label: "Pendientes" },
  { value: "en_progreso", label: "En progreso" },
  { value: "completada", label: "Completadas" },
];

export default function ActividadesPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tipos, setTipos] = useState<TipoActividad[]>([]);
  const [tareasEquipo, setTareasEquipo] = useState<Tarea[]>([]);
  const [misTareas, setMisTareas] = useState<{ vinculado: boolean; tareas: MiTarea[] }>({ vinculado: false, tareas: [] });
  // null mientras se resuelve — evita parpadear la vista completa antes de
  // saber si el usuario solo tiene acceso de auto-servicio ("actividades_propias").
  const [tieneAccesoCompleto, setTieneAccesoCompleto] = useState<boolean | null>(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarNuevoTipo, setMostrarNuevoTipo] = useState(false);
  const [nuevoTipoNombre, setNuevoTipoNombre] = useState("");
  const [form, setForm] = useState(FORM_VACIO);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [limpiando, setLimpiando] = useState(false);

  const [filtroTrabajador, setFiltroTrabajador] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  async function cargarCatalogos() {
    const [resEmpleados, resClientes, resTipos] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/empleados`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/clientes`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/actividades/tipos`).then((r) => r.json()),
    ]);
    setEmpleados(Array.isArray(resEmpleados) ? resEmpleados : []);
    setClientes(Array.isArray(resClientes) ? resClientes : []);
    setTipos(Array.isArray(resTipos) ? resTipos : []);
  }

  async function cargarTareasEquipo() {
    const res = await fetch(`/api/empresas/${empresaId}/actividades/tareas`).then((r) => r.json());
    setTareasEquipo(Array.isArray(res) ? res : []);
  }

  async function cargarMisTareas() {
    const res = await fetch(`/api/empresas/${empresaId}/actividades/tareas/mias`).then((r) => r.json());
    setMisTareas(res && Array.isArray(res.tareas) ? res : { vinculado: false, tareas: [] });
  }

  useEffect(() => {
    // "Mis actividades" es lo único a lo que puede entrar alguien con
    // acceso de auto-servicio ("actividades_propias") — el resto del
    // tablero (catálogos, tareas de todo el equipo) es solo para quien
    // tiene el permiso completo "actividades".
    fetch(`/api/empresas/${empresaId}/mi-acceso`)
      .then((r) => r.json())
      .then((res) => {
        const completo = !!(res.esSuperadminPlataforma || res.accesoTotal || (res.permisos ?? []).includes("actividades"));
        setTieneAccesoCompleto(completo);
        if (completo) {
          cargarCatalogos();
          cargarTareasEquipo();
        }
      });
    cargarMisTareas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  async function handleCrearTipo() {
    if (!nuevoTipoNombre.trim()) return;
    const res = await fetch(`/api/empresas/${empresaId}/actividades/tipos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: nuevoTipoNombre }),
    });
    if (res.ok) {
      const nuevo = await res.json();
      setTipos((t) => [...t, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setForm((f) => ({ ...f, tipoActividadId: nuevo.id }));
      setNuevoTipoNombre("");
      setMostrarNuevoTipo(false);
    }
  }

  function elegirTipo(tipoId: string) {
    const tipo = tipos.find((t) => t.id === tipoId);
    setForm((f) => ({
      ...f,
      tipoActividadId: tipoId,
      titulo: f.titulo || tipo?.nombre || "",
      horasEstimadas: tipo?.tiempoEstimadoMin ? Number((tipo.tiempoEstimadoMin / 60).toFixed(2)) : f.horasEstimadas,
    }));
  }

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setGuardando(true);
    const res = await fetch(`/api/empresas/${empresaId}/actividades/tareas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setGuardando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo crear la tarea.");
      return;
    }

    const data = await res.json();
    if (data.advertenciaCapacidad) setAviso(data.advertenciaCapacidad);

    setForm({ ...FORM_VACIO });
    setMostrarForm(false);
    cargarTareasEquipo();
    cargarMisTareas();
  }

  function enviarWhatsapp(t: Tarea) {
    if (!t.empleadoTelefono) {
      alert("Este trabajador no tiene un número de WhatsApp registrado en RRHH.");
      return;
    }
    const link = `${window.location.origin}/empresas/${empresaId}/actividades/tareas/${t.id}`;
    const primerNombre = t.empleadoNombre.split(" ")[0];
    const mensaje =
      `Hola ${primerNombre}, tienes una tarea asignada` +
      (t.clienteNombre ? ` para ${t.clienteNombre}` : "") +
      `: "${t.titulo}" — ${t.horasEstimadas}h estimadas, fecha ${fechaCorta(t.fecha)}.\n\nVer detalle: ${link}`;
    const numero = t.empleadoTelefono.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, "_blank");
    fetch(`/api/empresas/${empresaId}/actividades/tareas/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marcarWhatsappEnviado: true }),
    }).then(() => cargarTareasEquipo());
  }

  function toggleExpandir(empleadoId: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(empleadoId)) next.delete(empleadoId);
      else next.add(empleadoId);
      return next;
    });
  }

  const totalCompletadas = useMemo(() => tareasEquipo.filter((t) => t.estado === "completada").length, [tareasEquipo]);

  async function handleLimpiarCompletadas() {
    if (totalCompletadas === 0) return;
    const ok = window.confirm(
      `¿Archivar las ${totalCompletadas} tarea(s) completada(s)? Se quitan de esta vista pero se conservan para historial y reportes.`
    );
    if (!ok) return;
    setLimpiando(true);
    await fetch(`/api/empresas/${empresaId}/actividades/tareas/limpiar-completadas`, { method: "POST" });
    setLimpiando(false);
    cargarTareasEquipo();
  }

  // Agrupa TODAS las tareas no archivadas por trabajador, para calcular
  // los indicadores del encabezado de cada fila (atrasadas/pendientes/al
  // día) siempre sobre el estado real — los filtros de abajo solo acotan
  // qué tareas se listan al expandir, no esos indicadores.
  const gruposPorEmpleado = useMemo(() => {
    const mapa = new Map<string, { empleadoId: string; nombre: string; cargo: string | null; tareas: Tarea[] }>();
    for (const t of tareasEquipo) {
      if (!mapa.has(t.empleadoId)) {
        mapa.set(t.empleadoId, { empleadoId: t.empleadoId, nombre: t.empleadoNombre, cargo: t.empleadoCargo, tareas: [] });
      }
      mapa.get(t.empleadoId)!.tareas.push(t);
    }
    return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [tareasEquipo]);

  const grupos = useMemo(() => {
    return gruposPorEmpleado
      .filter((g) => !filtroTrabajador || g.empleadoId === filtroTrabajador)
      .map((g) => {
        const atrasadas = g.tareas.filter((t) => t.atrasada).length;
        const pendientes = g.tareas.filter((t) => !t.atrasada && (t.estado === "pendiente" || t.estado === "en_progreso")).length;
        const completadas = g.tareas.filter((t) => t.estado === "completada").length;
        const total = g.tareas.length;
        const sinIniciarPct = total ? Math.round((100 * g.tareas.filter((t) => t.estado === "pendiente").length) / total) : 0;
        const sinCompletarPct = total ? Math.round((100 * g.tareas.filter((t) => t.estado !== "completada").length) / total) : 0;

        const visibles = g.tareas
          .filter((t) => {
            if (!filtroEstado) return true;
            if (filtroEstado === "atrasada") return t.atrasada;
            if (filtroEstado === "pendiente") return t.estado === "pendiente" && !t.atrasada;
            if (filtroEstado === "en_progreso") return t.estado === "en_progreso" && !t.atrasada;
            return t.estado === filtroEstado;
          })
          .sort((a, b) => a.fecha.localeCompare(b.fecha));

        return { ...g, atrasadas, pendientes, completadas, total, sinIniciarPct, sinCompletarPct, visibles };
      });
  }, [gruposPorEmpleado, filtroTrabajador, filtroEstado]);

  const scopeTareas = useMemo(
    () => (filtroTrabajador ? tareasEquipo.filter((t) => t.empleadoId === filtroTrabajador) : tareasEquipo),
    [tareasEquipo, filtroTrabajador]
  );
  const completadasScope = scopeTareas.filter((t) => t.estado === "completada").length;
  const pctCompletadoScope = scopeTareas.length ? Math.round((100 * completadasScope) / scopeTareas.length) : 0;

  return (
    <main style={{ maxWidth: 980, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>Actividades</b>
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 26, marginBottom: 4 }}>Actividades</h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>
            {tieneAccesoCompleto
              ? "Asigna actividades al equipo y sigue su cumplimiento."
              : "Tus actividades asignadas."}
          </p>
        </div>
        {tieneAccesoCompleto && (
          <button
            className="btn-primary"
            onClick={() => {
              setForm({ ...FORM_VACIO });
              setError(null);
              setMostrarForm(true);
            }}
          >
            + Nueva actividad
          </button>
        )}
      </div>

      {tieneAccesoCompleto && (
        <p style={{ marginBottom: 24 }}>
          <Link href={`/empresas/${empresaId}/actividades/clientes`} style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
            Servicios por cliente (precio y rentabilidad) →
          </Link>
        </p>
      )}

      {aviso && (
        <p className="field error" style={{ background: "var(--stamp)", color: "#fff", padding: 10, borderRadius: 6 }}>
          ⚠ {aviso}
        </p>
      )}

      {mostrarForm && (
        <form onSubmit={handleCrear} className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Nueva actividad</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>Trabajador</label>
              <select value={form.empleadoId} onChange={(e) => setForm({ ...form, empleadoId: e.target.value })} required>
                <option value="">Elige...</option>
                {empleados.map((e) => (
                  <option key={e.id} value={e.id}>{e.nombres} {e.apellidos}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Cliente (opcional — vacío = tarea interna)</label>
              <select value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
                <option value="">Sin cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ gridColumn: "span 2" }}>
              <label>Tipo de actividad (opcional, para llenar tiempo estimado automáticamente)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <select value={form.tipoActividadId} onChange={(e) => elegirTipo(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Sin tipo / otro</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}{t.tiempoEstimadoMin ? ` (${(t.tiempoEstimadoMin / 60).toFixed(1)}h)` : ""}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-ghost" onClick={() => setMostrarNuevoTipo((v) => !v)}>
                  + Nuevo tipo
                </button>
              </div>
              {mostrarNuevoTipo && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input
                    value={nuevoTipoNombre}
                    onChange={(e) => setNuevoTipoNombre(e.target.value)}
                    placeholder="Ej: Editar reel"
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="btn-primary" onClick={handleCrearTipo}>Agregar</button>
                </div>
              )}
            </div>
            <div className="field" style={{ gridColumn: "span 2" }}>
              <label>Título de la tarea</label>
              <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} required />
            </div>
            <div className="field">
              <label>Fecha</label>
              <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
            </div>
            <div className="field">
              <label>Horas estimadas</label>
              <input
                type="number"
                step="0.25"
                value={form.horasEstimadas}
                onChange={(e) => setForm({ ...form, horasEstimadas: Number(e.target.value) })}
                required
              />
            </div>
            <div className="field" style={{ gridColumn: "span 2" }}>
              <label>Descripción (opcional)</label>
              <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </div>
          </div>
          {error && <p className="field error">{error}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? "Guardando..." : "Asignar"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setMostrarForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {/* Mis actividades */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>Mis actividades</h2>
        {misTareas.tareas.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>No tienes actividades asignadas por ahora.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {misTareas.tareas.map((t) => (
              <Link
                key={t.id}
                href={`/empresas/${empresaId}/actividades/tareas/${t.id}`}
                className="card"
                style={{ padding: 12, display: "flex", justifyContent: "space-between", gap: 10, textDecoration: "none", color: "inherit" }}
              >
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500 }}>{t.titulo}</p>
                  <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                    {t.clienteNombre ?? "Sin cliente"} · {fechaCorta(t.fecha)} · {t.horasEstimadas}h
                    {t.recibidoEn ? " · visto" : ""}
                  </p>
                </div>
                <span
                  className="mono"
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    alignSelf: "center",
                    color: t.alertaVencimiento === "atrasada" ? "var(--alert)" : t.alertaVencimiento ? "var(--stamp)" : "var(--ink-soft)",
                  }}
                >
                  {textoAlerta(t.alertaVencimiento) ?? t.estado.replace("_", " ")}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Actividades del equipo — solo para quien gestiona el equipo completo */}
      {tieneAccesoCompleto && (
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ fontSize: 16 }}>Actividades del equipo</h2>
          <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
            {completadasScope}/{scopeTareas.length} completadas ({pctCompletadoScope}%)
          </span>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <Link href={`/empresas/${empresaId}/actividades/carga-trabajo`} className="btn-ghost" style={{ textDecoration: "none" }}>
            📊 Reporte de carga
          </Link>
          <button className="btn-ghost" onClick={handleLimpiarCompletadas} disabled={limpiando || totalCompletadas === 0}>
            🧹 {limpiando ? "Archivando..." : `Limpiar completadas (${totalCompletadas})`}
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <select value={filtroTrabajador} onChange={(e) => setFiltroTrabajador(e.target.value)} style={{ padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--line)" }}>
            <option value="">Todos los trabajadores</option>
            {empleados.map((e) => (
              <option key={e.id} value={e.id}>{e.nombres} {e.apellidos}</option>
            ))}
          </select>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ padding: "8px 10px", borderRadius: "var(--radius)", border: "1px solid var(--line)" }}>
            {FILTROS_ESTADO.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {grupos.map((g) => {
            const color = colorCargo(g.cargo);
            const expandido = expandidos.has(g.empleadoId);
            return (
              <div key={g.empleadoId} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <button
                  onClick={() => toggleExpandir(g.empleadoId)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 14,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>{g.nombre}</span>
                    {g.cargo && (
                      <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", padding: "3px 8px", borderRadius: 999, background: color.bg, color: color.fg }}>
                        {g.cargo}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {g.atrasadas > 0 && (
                      <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", padding: "3px 8px", borderRadius: 999, background: "var(--alert-bg)", color: "var(--alert)" }}>
                        ⚠ {g.atrasadas} atrasada{g.atrasadas === 1 ? "" : "s"}
                      </span>
                    )}
                    {g.pendientes > 0 && (
                      <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", padding: "3px 8px", borderRadius: 999, background: "#ece4fa", color: "#6b3fa0" }}>
                        {g.pendientes} pendiente{g.pendientes === 1 ? "" : "s"}
                      </span>
                    )}
                    {g.atrasadas === 0 && g.pendientes === 0 && (
                      <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", padding: "3px 8px", borderRadius: 999, background: "var(--teal-bg)", color: "var(--teal)" }}>
                        Al día
                      </span>
                    )}
                    <span style={{ fontSize: 12 }}>{expandido ? "▲" : "▼"}</span>
                  </div>
                </button>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", padding: "0 14px 14px" }}>
                  {g.total} asignada{g.total === 1 ? "" : "s"} · {g.sinIniciarPct}% sin iniciar · {g.sinCompletarPct}% sin completar
                </p>

                {expandido && (
                  <div style={{ borderTop: "1px solid var(--line)", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                    {g.visibles.length === 0 && (
                      <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>No hay tareas que coincidan con el filtro.</p>
                    )}
                    {g.visibles.map((t) => (
                      <div key={t.id} className="card" style={{ padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <div>
                            <p style={{ fontSize: 13.5, fontWeight: 500 }}>
                              <Link href={`/empresas/${empresaId}/actividades/tareas/${t.id}`} style={{ color: "inherit" }}>
                                {t.titulo}
                              </Link>
                            </p>
                            <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                              {t.clienteNombre ?? "Sin cliente"} · {fechaCorta(t.fecha)} · {t.horasEstimadas}h
                              {t.tipoActividadNombre ? ` · ${t.tipoActividadNombre}` : ""}
                            </p>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span
                              className="mono"
                              style={{
                                fontSize: 10,
                                textTransform: "uppercase",
                                color: t.atrasada ? "var(--alert)" : t.estado === "completada" ? "var(--teal)" : "var(--ink-soft)",
                              }}
                            >
                              {t.atrasada ? "⚠ atrasada" : t.estado.replace("_", " ")}
                            </span>
                            <button className="btn-ghost" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => enviarWhatsapp(t)}>
                              {t.whatsappEnviadoEn ? "Reenviar WhatsApp" : "Enviar por WhatsApp"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {grupos.length === 0 && (
            <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no hay actividades asignadas al equipo.</p>
          )}
        </div>
      </div>
      )}
    </main>
  );
}
