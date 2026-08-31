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
  empleadoTelefono: string | null;
  clienteId: string | null;
  clienteNombre: string | null;
  tipoActividadNombre: string | null;
  titulo: string;
  fecha: string;
  horasEstimadas: number;
  horasReales: number | null;
  estado: string;
  whatsappEnviadoEn: string | null;
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
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

export default function ActividadesPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tipos, setTipos] = useState<TipoActividad[]>([]);
  const [tareasHoy, setTareasHoy] = useState<Tarea[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarNuevoTipo, setMostrarNuevoTipo] = useState(false);
  const [nuevoTipoNombre, setNuevoTipoNombre] = useState("");
  const [form, setForm] = useState(FORM_VACIO);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [fechaVista, setFechaVista] = useState(hoyISO());

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

  async function cargarTareas(fecha: string) {
    const res = await fetch(`/api/empresas/${empresaId}/actividades/tareas?fecha=${fecha}`).then((r) => r.json());
    setTareasHoy(Array.isArray(res) ? res : []);
  }

  useEffect(() => {
    cargarCatalogos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  useEffect(() => {
    cargarTareas(fechaVista);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, fechaVista]);

  const empleadosPorId = useMemo(() => new Map(empleados.map((e) => [e.id, e])), [empleados]);

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

    setForm({ ...FORM_VACIO, fecha: form.fecha });
    setMostrarForm(false);
    cargarTareas(fechaVista);
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
      `: "${t.titulo}" — ${t.horasEstimadas}h estimadas, fecha ${new Date(t.fecha).toLocaleDateString("es-PE", { timeZone: "UTC" })}.\n\nVer detalle: ${link}`;
    const numero = t.empleadoTelefono.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, "_blank");
    fetch(`/api/empresas/${empresaId}/actividades/tareas/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marcarWhatsappEnviado: true }),
    }).then(() => cargarTareas(fechaVista));
  }

  const totalHorasVista = tareasHoy.reduce((acc, t) => acc + t.horasEstimadas, 0);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>Gestión de Actividades</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Gestión de Actividades</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 20 }}>
        Asigna tareas a tu equipo por cliente y fecha, sin superar su capacidad diaria, y avisa por WhatsApp.
      </p>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <Link href={`/empresas/${empresaId}/actividades/carga-trabajo`} className="btn-ghost" style={{ textDecoration: "none" }}>
          Ver carga de trabajo por trabajador
        </Link>
        <Link href={`/empresas/${empresaId}/actividades/clientes`} className="btn-ghost" style={{ textDecoration: "none" }}>
          Servicios por cliente (precio y rentabilidad)
        </Link>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Ver tareas del día</label>
          <input type="date" value={fechaVista} onChange={(e) => setFechaVista(e.target.value)} />
        </div>
        {!mostrarForm && (
          <button className="btn-primary" onClick={() => { setForm({ ...FORM_VACIO, fecha: fechaVista }); setMostrarForm(true); }}>
            + Asignar tarea
          </button>
        )}
        <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          {tareasHoy.length} tarea(s) · {totalHorasVista.toFixed(1)}h en total ese día
        </p>
      </div>

      {aviso && (
        <p className="field error" style={{ background: "var(--stamp)", color: "#fff", padding: 10, borderRadius: 6 }}>
          ⚠ {aviso}
        </p>
      )}

      {mostrarForm && (
        <form onSubmit={handleCrear} className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Asignar tarea</h3>
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

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tareasHoy.map((t) => (
          <div key={t.id} className="card" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>
                  <Link href={`/empresas/${empresaId}/actividades/tareas/${t.id}`} style={{ color: "inherit" }}>
                    {t.titulo}
                  </Link>
                </p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {t.empleadoNombre} · {t.clienteNombre ?? "Sin cliente"} · {t.horasEstimadas}h
                  {t.tipoActividadNombre ? ` · ${t.tipoActividadNombre}` : ""}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="mono" style={{ fontSize: 10, textTransform: "uppercase", color: t.estado === "completada" ? "var(--teal)" : "var(--ink-soft)" }}>
                  {t.estado.replace("_", " ")}
                </span>
                <button className="btn-ghost" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => enviarWhatsapp(t)}>
                  {t.whatsappEnviadoEn ? "Reenviar WhatsApp" : "Enviar por WhatsApp"}
                </button>
              </div>
            </div>
          </div>
        ))}
        {tareasHoy.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>No hay tareas asignadas ese día.</p>
        )}
      </div>
    </main>
  );
}
