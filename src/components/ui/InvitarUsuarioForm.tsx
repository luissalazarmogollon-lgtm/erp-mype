"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MODULOS_DISPONIBLES } from "@/lib/permisosModulo";

export function InvitarUsuarioForm({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [form, setForm] = useState({
    nombres: "",
    apellidos: "",
    email: "",
    password: "",
    tipoActor: "cliente",
    rolOperativoNombre: "Admin Local",
    accesoTotal: true,
    permisos: [] as string[],
  });

  function togglePermiso(clave: string) {
    setForm((f) => ({
      ...f,
      permisos: f.permisos.includes(clave) ? f.permisos.filter((p) => p !== clave) : [...f.permisos, clave],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    const res = await fetch(`/api/empresas/${empresaId}/usuarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setEnviando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo crear el usuario.");
      return;
    }

    setForm({
      nombres: "",
      apellidos: "",
      email: "",
      password: "",
      tipoActor: "cliente",
      rolOperativoNombre: "Admin Local",
      accesoTotal: true,
      permisos: [],
    });
    setAbierto(false);
    router.refresh();
  }

  if (!abierto) {
    return (
      <button className="btn-primary" onClick={() => setAbierto(true)}>
        + Asignar persona
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 15, marginBottom: 16 }}>Asignar nueva persona a esta empresa</h3>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field">
          <label>Nombres</label>
          <input value={form.nombres} onChange={(e) => setForm({ ...form, nombres: e.target.value })} required />
        </div>
        <div className="field">
          <label>Apellidos</label>
          <input value={form.apellidos} onChange={(e) => setForm({ ...form, apellidos: e.target.value })} required />
        </div>
      </div>

      <div className="field">
        <label>Correo</label>
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
      </div>

      <div className="field">
        <label>Contraseña temporal (mínimo 8 caracteres)</label>
        <input
          type="text"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="La persona la puede cambiar después"
          required
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field">
          <label>Tipo de actor</label>
          <select value={form.tipoActor} onChange={(e) => setForm({ ...form, tipoActor: e.target.value })}>
            <option value="cliente">Cliente (personal del negocio)</option>
            <option value="asesor">Asesor (tu equipo)</option>
            <option value="asistente">Asistente (tu equipo)</option>
          </select>
        </div>
        <div className="field">
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

      <div className="field">
        <label>Nivel de acceso en esta empresa</label>
        <select
          value={form.accesoTotal ? "total" : "limitado"}
          onChange={(e) => setForm({ ...form, accesoTotal: e.target.value === "total" })}
        >
          <option value="total">Acceso total (ve y hace todo en esta empresa)</option>
          <option value="limitado">Acceso limitado (elegir qué puede hacer)</option>
        </select>
      </div>

      {!form.accesoTotal && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 14 }}>
          {MODULOS_DISPONIBLES.map((m) => (
            <label key={m.key} className="checkbox-row" style={{ fontSize: 12 }}>
              <input type="checkbox" checked={form.permisos.includes(m.key)} onChange={() => togglePermiso(m.key)} />
              {m.label}
            </label>
          ))}
        </div>
      )}

      {error && <p className="field error">{error}</p>}

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando ? "Creando..." : "Crear y asignar"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
