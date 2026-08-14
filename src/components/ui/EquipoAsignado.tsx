"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type MiembroEquipo = {
  asignacionId: string;
  usuarioId: string;
  nombres: string;
  apellidos: string;
  email: string;
  tipoActor: string;
  rolOperativo: string;
};

export function EquipoAsignado({
  empresaId,
  equipoInicial,
}: {
  empresaId: string;
  equipoInicial: MiembroEquipo[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [form, setForm] = useState({
    nombres: "",
    apellidos: "",
    email: "",
    password: "",
    tipoActor: "cliente",
    rolOperativoNombre: "Admin Local",
  });

  function abrirEdicion(m: MiembroEquipo) {
    setEditando(m.usuarioId);
    setError(null);
    setForm({
      nombres: m.nombres,
      apellidos: m.apellidos,
      email: m.email,
      password: "",
      tipoActor: m.tipoActor,
      rolOperativoNombre: m.rolOperativo,
    });
  }

  async function guardarEdicion(usuarioId: string) {
    setError(null);
    setGuardando(true);

    const res = await fetch(`/api/empresas/${empresaId}/usuarios/${usuarioId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setGuardando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo guardar los cambios.");
      return;
    }

    setEditando(null);
    router.refresh();
  }

  if (equipoInicial.length === 0) {
    return (
      <p style={{ color: "var(--ink-soft)", fontSize: 14, marginTop: 16 }}>
        Todavía no hay nadie asignado a esta empresa además de ti.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 16, marginBottom: 32 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {equipoInicial.map((m) => (
          <div key={m.asignacionId} className="card" style={{ padding: 14 }}>
            {editando === m.usuarioId ? (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Nombres</label>
                    <input value={form.nombres} onChange={(e) => setForm({ ...form, nombres: e.target.value })} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Apellidos</label>
                    <input value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Correo (con el que inicia sesión)</label>
                    <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Nueva contraseña (opcional)</label>
                    <input
                      type="text"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="Dejar en blanco para no cambiarla"
                    />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Tipo de actor</label>
                    <select value={form.tipoActor} onChange={(e) => setForm({ ...form, tipoActor: e.target.value })}>
                      <option value="cliente">Cliente (personal del negocio)</option>
                      <option value="asesor">Asesor (tu equipo)</option>
                      <option value="asistente">Asistente (tu equipo)</option>
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Rol operativo</label>
                    <select
                      value={form.rolOperativoNombre}
                      onChange={(e) => setForm({ ...form, rolOperativoNombre: e.target.value })}
                    >
                      <option value="Gerencial">Gerencial</option>
                      <option value="Admin Local">Admin Local</option>
                      <option value="Cajero">Cajero</option>
                      <option value="Almacén-Cocina">Almacén-Cocina</option>
                    </select>
                  </div>
                </div>

                {error && <p className="field error" style={{ marginTop: 10 }}>{error}</p>}

                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button className="btn-primary" disabled={guardando} onClick={() => guardarEdicion(m.usuarioId)}>
                    {guardando ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button className="btn-ghost" onClick={() => setEditando(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500 }}>
                    {m.nombres} {m.apellidos}
                  </p>
                  <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                    {m.email}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ textAlign: "right" }}>
                    <p className="mono" style={{ fontSize: 11, textTransform: "capitalize" }}>
                      {m.tipoActor}
                    </p>
                    <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                      {m.rolOperativo}
                    </p>
                  </div>
                  <button className="btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => abrirEdicion(m)}>
                    Editar
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
