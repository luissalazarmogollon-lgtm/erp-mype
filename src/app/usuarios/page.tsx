"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MODULOS_DISPONIBLES } from "@/lib/permisosModulo";

type Asignacion = {
  asignacionId: string;
  empresaId: string;
  empresaNombre: string;
  tipoActor: string;
  rolOperativo: string;
  accesoTotal: boolean;
  permisos: string[];
};
type Usuario = {
  id: string;
  nombres: string;
  apellidos: string;
  email: string;
  tipoActorBase: string;
  asignaciones: Asignacion[];
};
type EmpresaOpcion = { id: string; nombreComercial: string };

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOpcion[]>([]);
  const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false);
  const [asignandoEn, setAsignandoEn] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ asignacionId: string; empresaNombre: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const [formNuevo, setFormNuevo] = useState({
    nombres: "",
    apellidos: "",
    email: "",
    password: "",
    tipoActorBase: "cliente",
  });
  const [formAsignar, setFormAsignar] = useState({
    empresaId: "",
    tipoActor: "cliente",
    rolOperativoNombre: "Admin Local",
    accesoTotal: true,
    permisos: [] as string[],
  });

  async function cargar() {
    setCargando(true);
    const [resUsuarios, resEmpresas] = await Promise.all([
      fetch("/api/usuarios").then((r) => r.json()),
      fetch("/api/empresas").then((r) => r.json()),
    ]);
    setUsuarios(resUsuarios);
    setEmpresas(resEmpresas);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function handleCrearUsuario(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formNuevo),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo crear el usuario.");
      return;
    }
    setFormNuevo({ nombres: "", apellidos: "", email: "", password: "", tipoActorBase: "cliente" });
    setMostrarFormNuevo(false);
    cargar();
  }

  async function handleAsignar(usuarioId: string) {
    setError(null);
    if (!formAsignar.empresaId) {
      setError("Elige una empresa.");
      return;
    }
    const res = await fetch(`/api/usuarios/${usuarioId}/asignaciones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formAsignar),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo asignar.");
      return;
    }
    setAsignandoEn(null);
    setEditando(null);
    setFormAsignar({ empresaId: "", tipoActor: "cliente", rolOperativoNombre: "Admin Local", accesoTotal: true, permisos: [] });
    cargar();
  }

  function abrirEdicion(usuarioId: string, a: Asignacion) {
    setFormAsignar({
      empresaId: a.empresaId,
      tipoActor: a.tipoActor,
      rolOperativoNombre: a.rolOperativo,
      accesoTotal: a.accesoTotal,
      permisos: a.permisos,
    });
    setEditando({ asignacionId: a.asignacionId, empresaNombre: a.empresaNombre });
    setAsignandoEn(usuarioId);
    setError(null);
  }

  function abrirNuevaAsignacion(usuarioId: string) {
    setFormAsignar({ empresaId: "", tipoActor: "cliente", rolOperativoNombre: "Admin Local", accesoTotal: true, permisos: [] });
    setEditando(null);
    setAsignandoEn(asignandoEn === usuarioId && !editando ? null : usuarioId);
    setError(null);
  }

  function togglePermiso(clave: string) {
    setFormAsignar((f) => ({
      ...f,
      permisos: f.permisos.includes(clave) ? f.permisos.filter((p) => p !== clave) : [...f.permisos, clave],
    }));
  }

  async function handleQuitarAcceso(usuarioId: string, asignacionId: string) {
    setError(null);
    const res = await fetch(`/api/usuarios/${usuarioId}/asignaciones/${asignacionId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo quitar el acceso.");
      return;
    }
    cargar();
  }

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href="/dashboard" style={{ color: "inherit" }}>
          Tus empresas
        </Link>{" "}
        → <b>Usuarios y accesos</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Usuarios y accesos</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 20 }}>
        Crea a tus consultores, asistentes, y al personal del negocio (dueños, encargados), y decide a qué empresas
        tiene acceso cada uno y con qué rol — esto es lo que controla quién puede ver y hacer qué (segregación de
        funciones).
      </p>

      {!mostrarFormNuevo ? (
        <button className="btn-primary" onClick={() => setMostrarFormNuevo(true)} style={{ marginBottom: 24 }}>
          + Crear nuevo usuario
        </button>
      ) : (
        <form onSubmit={handleCrearUsuario} className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Crear usuario</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>Nombres</label>
              <input value={formNuevo.nombres} onChange={(e) => setFormNuevo({ ...formNuevo, nombres: e.target.value })} required />
            </div>
            <div className="field">
              <label>Apellidos</label>
              <input value={formNuevo.apellidos} onChange={(e) => setFormNuevo({ ...formNuevo, apellidos: e.target.value })} required />
            </div>
            <div className="field">
              <label>Correo</label>
              <input type="email" value={formNuevo.email} onChange={(e) => setFormNuevo({ ...formNuevo, email: e.target.value })} required />
            </div>
            <div className="field">
              <label>Contraseña temporal</label>
              <input value={formNuevo.password} onChange={(e) => setFormNuevo({ ...formNuevo, password: e.target.value })} required />
            </div>
            <div className="field">
              <label>Tipo de actor</label>
              <select value={formNuevo.tipoActorBase} onChange={(e) => setFormNuevo({ ...formNuevo, tipoActorBase: e.target.value })}>
                <option value="cliente">Cliente (personal del negocio)</option>
                <option value="asesor">Asesor (tu equipo)</option>
                <option value="asistente">Asistente (tu equipo)</option>
              </select>
            </div>
          </div>
          {error && <p className="field error">{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" className="btn-primary">Crear</button>
            <button type="button" className="btn-ghost" onClick={() => setMostrarFormNuevo(false)}>Cancelar</button>
          </div>
          <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 10 }}>
            Después de crearlo, asígnalo a una o varias empresas desde la lista de abajo.
          </p>
        </form>
      )}

      {cargando ? (
        <p style={{ color: "var(--ink-soft)" }}>Cargando...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {usuarios.map((u) => (
            <div key={u.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500 }}>
                    {u.nombres} {u.apellidos}
                  </p>
                  <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                    {u.email} · {u.tipoActorBase}
                  </p>
                </div>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 12, padding: "6px 12px" }}
                  onClick={() => abrirNuevaAsignacion(u.id)}
                >
                  + Asignar a empresa
                </button>
              </div>

              {u.asignaciones.length > 0 && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {u.asignaciones.map((a) => (
                    <div key={a.asignacionId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <p className="mono" style={{ fontSize: 12 }}>
                          {a.empresaNombre} — {a.tipoActor} / {a.rolOperativo}
                        </p>
                        <p className="mono" style={{ fontSize: 10, color: "var(--ink-soft)" }}>
                          {a.accesoTotal
                            ? "Acceso total"
                            : a.permisos.length > 0
                            ? a.permisos.map((p) => MODULOS_DISPONIBLES.find((m) => m.key === p)?.label ?? p).join(", ")
                            : "Sin permisos asignados"}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <button
                          onClick={() => abrirEdicion(u.id, a)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--ink-soft)" }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleQuitarAcceso(u.id, a.asignacionId)}
                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--alert)" }}
                        >
                          Quitar acceso
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {asignandoEn === u.id && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 10, textTransform: "uppercase" }}>
                    {editando ? `Editando acceso — ${editando.empresaNombre}` : "Nueva asignación"}
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: editando ? "1fr 1fr" : "1fr 1fr 1fr", gap: 10 }}>
                    {!editando && (
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label>Empresa</label>
                        <select value={formAsignar.empresaId} onChange={(e) => setFormAsignar({ ...formAsignar, empresaId: e.target.value })}>
                          <option value="">Selecciona...</option>
                          {empresas.map((e) => (
                            <option key={e.id} value={e.id}>{e.nombreComercial}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Tipo de actor</label>
                      <select value={formAsignar.tipoActor} onChange={(e) => setFormAsignar({ ...formAsignar, tipoActor: e.target.value })}>
                        <option value="cliente">Cliente</option>
                        <option value="asesor">Asesor</option>
                        <option value="asistente">Asistente</option>
                      </select>
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Rol operativo</label>
                      <select value={formAsignar.rolOperativoNombre} onChange={(e) => setFormAsignar({ ...formAsignar, rolOperativoNombre: e.target.value })}>
                        <option value="Gerencial">Gerencial</option>
                        <option value="Admin Local">Admin Local</option>
                        <option value="Cajero">Cajero</option>
                        <option value="Almacén-Cocina">Almacén-Cocina</option>
                      </select>
                    </div>
                  </div>
                  {error && <p className="field error" style={{ marginTop: 10 }}>{error}</p>}

                  <div className="field" style={{ marginTop: 10 }}>
                    <label>Nivel de acceso en esta empresa</label>
                    <select
                      value={formAsignar.accesoTotal ? "total" : "limitado"}
                      onChange={(e) => setFormAsignar({ ...formAsignar, accesoTotal: e.target.value === "total" })}
                    >
                      <option value="total">Acceso total (ve y hace todo en esta empresa)</option>
                      <option value="limitado">Acceso limitado (elegir qué puede hacer)</option>
                    </select>
                  </div>

                  {!formAsignar.accesoTotal && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                      {MODULOS_DISPONIBLES.map((m) => (
                        <label key={m.key} className="checkbox-row" style={{ fontSize: 12 }}>
                          <input
                            type="checkbox"
                            checked={formAsignar.permisos.includes(m.key)}
                            onChange={() => togglePermiso(m.key)}
                          />
                          {m.label}
                        </label>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                    <button className="btn-primary" onClick={() => handleAsignar(u.id)}>
                      {editando ? "Guardar cambios" : "Confirmar asignación"}
                    </button>
                    <button className="btn-ghost" onClick={() => { setAsignandoEn(null); setEditando(null); }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {usuarios.length === 0 && (
            <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no has creado ningún usuario.</p>
          )}
        </div>
      )}
    </main>
  );
}
