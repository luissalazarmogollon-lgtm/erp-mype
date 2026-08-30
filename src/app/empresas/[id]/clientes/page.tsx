"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Cliente = {
  id: string;
  nombre: string;
  docIdentidad: string | null;
  telefono: string | null;
  razonSocial: string | null;
  representanteLegal: string | null;
  personaContacto: string | null;
  direccion: string | null;
  telefono2: string | null;
  email: string | null;
  rubro: string | null;
  paginaWeb: string | null;
  instagram: string | null;
  tiktok: string | null;
  logoUrl: string | null;
  estado: string;
};

type FormCliente = {
  nombre: string;
  docIdentidad: string;
  telefono: string;
  razonSocial: string;
  representanteLegal: string;
  personaContacto: string;
  direccion: string;
  telefono2: string;
  email: string;
  rubro: string;
  paginaWeb: string;
  instagram: string;
  tiktok: string;
  logoUrl: string;
  estado: "activo" | "inactivo";
};

const FORM_VACIO: FormCliente = {
  nombre: "",
  docIdentidad: "",
  telefono: "",
  razonSocial: "",
  representanteLegal: "",
  personaContacto: "",
  direccion: "",
  telefono2: "",
  email: "",
  rubro: "",
  paginaWeb: "",
  instagram: "",
  tiktok: "",
  logoUrl: "",
  estado: "activo",
};

// Campos del formulario, compartidos entre "+ Nuevo cliente" y la edición
// inline de cada tarjeta — así no se duplica el layout de 13 campos dos
// veces.
function CamposCliente({ form, setForm }: { form: FormCliente; setForm: (f: FormCliente) => void }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="field">
          <label>Nombre comercial</label>
          <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
        </div>
        <div className="field">
          <label>Razón social (opcional)</label>
          <input value={form.razonSocial} onChange={(e) => setForm({ ...form, razonSocial: e.target.value })} />
        </div>
        <div className="field">
          <label>RUC / DNI (opcional)</label>
          <input value={form.docIdentidad} onChange={(e) => setForm({ ...form, docIdentidad: e.target.value })} />
        </div>
        <div className="field">
          <label>Rubro de la empresa (opcional)</label>
          <input
            value={form.rubro}
            onChange={(e) => setForm({ ...form, rubro: e.target.value })}
            placeholder="Ej: Restaurante, Estudio contable"
          />
        </div>
        <div className="field">
          <label>Representante legal (opcional)</label>
          <input value={form.representanteLegal} onChange={(e) => setForm({ ...form, representanteLegal: e.target.value })} />
        </div>
        <div className="field">
          <label>Persona de contacto (opcional)</label>
          <input value={form.personaContacto} onChange={(e) => setForm({ ...form, personaContacto: e.target.value })} />
        </div>
        <div className="field">
          <label>Teléfono de contacto 1 (opcional)</label>
          <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
        </div>
        <div className="field">
          <label>Teléfono de contacto 2 (opcional)</label>
          <input value={form.telefono2} onChange={(e) => setForm({ ...form, telefono2: e.target.value })} />
        </div>
        <div className="field">
          <label>Email (opcional)</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="contacto@empresa.pe"
          />
        </div>
        <div className="field">
          <label>Estado</label>
          <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as "activo" | "inactivo" })}>
            <option value="activo">Activo</option>
            <option value="inactivo">De baja</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Dirección (opcional)</label>
        <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div className="field">
          <label>Página web (opcional)</label>
          <input value={form.paginaWeb} onChange={(e) => setForm({ ...form, paginaWeb: e.target.value })} placeholder="https://..." />
        </div>
        <div className="field">
          <label>Instagram (opcional)</label>
          <input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} placeholder="@usuario" />
        </div>
        <div className="field">
          <label>TikTok (opcional)</label>
          <input value={form.tiktok} onChange={(e) => setForm({ ...form, tiktok: e.target.value })} placeholder="@usuario" />
        </div>
      </div>
      <div className="field">
        <label>Logo — link de Imgur (opcional)</label>
        <input
          value={form.logoUrl}
          onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
          placeholder="https://i.imgur.com/..."
        />
        <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 6 }}>
          Sube la imagen a imgur.com, copia el link directo de la imagen ("Copy image link") y pégalo aquí.
        </p>
      </div>
    </>
  );
}

function clienteAForm(c: Cliente): FormCliente {
  return {
    nombre: c.nombre,
    docIdentidad: c.docIdentidad ?? "",
    telefono: c.telefono ?? "",
    razonSocial: c.razonSocial ?? "",
    representanteLegal: c.representanteLegal ?? "",
    personaContacto: c.personaContacto ?? "",
    direccion: c.direccion ?? "",
    telefono2: c.telefono2 ?? "",
    email: c.email ?? "",
    rubro: c.rubro ?? "",
    paginaWeb: c.paginaWeb ?? "",
    instagram: c.instagram ?? "",
    tiktok: c.tiktok ?? "",
    logoUrl: c.logoUrl ?? "",
    estado: c.estado === "inactivo" ? "inactivo" : "activo",
  };
}

export default function ClientesPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [form, setForm] = useState<FormCliente>(FORM_VACIO);
  const [editando, setEditando] = useState<string | null>(null);
  const [formEdicion, setFormEdicion] = useState<FormCliente>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    const res = await fetch(`/api/empresas/${empresaId}/clientes?todos=1`).then((r) => r.json());
    setClientes(Array.isArray(res) ? res : []);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const clientesVisibles = mostrarInactivos ? clientes : clientes.filter((c) => c.estado !== "inactivo");
  const cantidadInactivos = clientes.filter((c) => c.estado === "inactivo").length;

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.nombre.trim()) {
      setError("El nombre comercial es obligatorio.");
      return;
    }
    setGuardando(true);
    const res = await fetch(`/api/empresas/${empresaId}/clientes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setGuardando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo crear el cliente.");
      return;
    }

    setForm(FORM_VACIO);
    setMostrarForm(false);
    cargar();
  }

  function iniciarEdicion(c: Cliente) {
    setEditando(c.id);
    setFormEdicion(clienteAForm(c));
    setError(null);
  }

  async function handleGuardarEdicion(clienteId: string) {
    setError(null);
    if (!formEdicion.nombre.trim()) {
      setError("El nombre comercial es obligatorio.");
      return;
    }
    setGuardando(true);
    const res = await fetch(`/api/empresas/${empresaId}/clientes/${clienteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formEdicion),
    });
    setGuardando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo guardar el cliente.");
      return;
    }

    setEditando(null);
    cargar();
  }

  async function handleCambiarEstado(c: Cliente) {
    const nuevoEstado = c.estado === "inactivo" ? "activo" : "inactivo";
    if (nuevoEstado === "inactivo" && !confirm(`¿Dar de baja a "${c.nombre}"? Ya no aparecerá para elegirlo en Ventas o Facturación.`)) {
      return;
    }
    const res = await fetch(`/api/empresas/${empresaId}/clientes/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...clienteAForm(c), estado: nuevoEstado }),
    });
    if (res.ok) cargar();
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>Clientes</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Clientes</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 20 }}>
        La ficha completa de cada cliente: datos de la empresa, contacto, redes sociales y logo. Se usa en Ventas,
        Créditos y Facturación para elegir un cliente.
      </p>

      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        {!mostrarForm && (
          <button className="btn-primary" onClick={() => { setMostrarForm(true); setForm(FORM_VACIO); }}>
            + Nuevo cliente
          </button>
        )}
        <Link href={`/empresas/${empresaId}/clientes/importar`} className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
          Cargar por plantilla (Excel) →
        </Link>
      </div>

      {mostrarForm && (
        <form onSubmit={handleCrear} className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Nuevo cliente</h3>
          <CamposCliente form={form} setForm={setForm} />
          {error && <p className="field error">{error}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="submit" className="btn-primary" disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar cliente"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setMostrarForm(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {cantidadInactivos > 0 && (
        <label className="checkbox-row mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 20 }}>
          <input type="checkbox" checked={mostrarInactivos} onChange={(e) => setMostrarInactivos(e.target.checked)} />
          Mostrar también los {cantidadInactivos} clientes dados de baja
        </label>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {clientesVisibles.map((c) => (
          <div key={c.id} className="card" style={{ opacity: c.estado === "inactivo" ? 0.6 : 1 }}>
            {editando === c.id ? (
              <div>
                <h3 style={{ fontSize: 15, marginBottom: 14 }}>Editar cliente</h3>
                <CamposCliente form={formEdicion} setForm={setFormEdicion} />
                {error && <p className="field error">{error}</p>}
                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <button className="btn-primary" disabled={guardando} onClick={() => handleGuardarEdicion(c.id)}>
                    {guardando ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button className="btn-ghost" onClick={() => setEditando(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 14 }}>
                {c.logoUrl && (
                  // Logo del cliente, tal cual el link de Imgur que se pegó — sin
                  // procesar ni re-subir la imagen, así que si el link se cae, solo
                  // desaparece la miniatura (no rompe la tarjeta).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.logoUrl}
                    alt={c.nombre}
                    style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", border: "1px solid var(--line)", flexShrink: 0 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <div style={{ flex: 1, display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 500 }}>
                      {c.nombre}
                      {c.docIdentidad ? ` — RUC ${c.docIdentidad}` : ""}
                      {c.estado === "inactivo" && (
                        <span className="mono" style={{ fontSize: 10, color: "var(--alert)", marginLeft: 8, textTransform: "uppercase" }}>
                          De baja
                        </span>
                      )}
                    </p>
                    {c.razonSocial && c.razonSocial !== c.nombre && (
                      <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>{c.razonSocial}</p>
                    )}
                    <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>
                      {[c.rubro, c.personaContacto, c.telefono, c.telefono2, c.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}
                    </p>
                    {c.direccion && (
                      <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>{c.direccion}</p>
                    )}
                    {(c.paginaWeb || c.instagram || c.tiktok) && (
                      <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}>
                        {[c.paginaWeb, c.instagram, c.tiktok].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                    <button className="btn-ghost" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => iniciarEdicion(c)}>
                      Editar
                    </button>
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 11, padding: "5px 10px", color: c.estado === "inactivo" ? "var(--teal)" : "var(--alert)" }}
                      onClick={() => handleCambiarEstado(c)}
                    >
                      {c.estado === "inactivo" ? "Reactivar" : "Dar de baja"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        {clientesVisibles.length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no hay clientes registrados.</p>
        )}
      </div>
    </main>
  );
}
