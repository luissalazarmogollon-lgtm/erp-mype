"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Rubro = {
  id: number;
  nombre: string;
  requiereInventario: boolean;
  requiereFichasTecnicas: boolean;
  tipoNegocioSugerido?: { id: number; nombre: string } | null;
};

// Wizard de alta de empresa — HU-01 de especificacion_mvp_erp_mype.md.
// Cubre el paso 1 (datos generales), 2 (tipo de negocio/rubro) y 3
// (configuración financiera) del flujo 0 de la arquitectura. Los pasos 4
// (asignación de responsables) y 5 (primer usuario cliente) se agregan en
// el Sprint 2, cuando exista la pantalla de gestión de usuarios.
export default function AltaEmpresaPage() {
  const router = useRouter();
  const [rubros, setRubros] = useState<Rubro[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [form, setForm] = useState({
    razonSocial: "",
    nombreComercial: "",
    ruc: "",
    rubroId: "",
    monedaOperacion: "PEN",
    aplicaIgv: true,
    tasaIgv: 18,
    regimenTributario: "",
    capitalSocialInicial: 0,
  });

  useEffect(() => {
    fetch("/api/rubros")
      .then((r) => r.json())
      .then(setRubros)
      .catch(() => setError("No se pudieron cargar los rubros"));
  }, []);

  const rubroSeleccionado = rubros.find((r) => r.id === Number(form.rubroId));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.razonSocial || !form.nombreComercial || !form.rubroId) {
      setError("Completa razón social, nombre comercial y rubro.");
      return;
    }

    setEnviando(true);

    const res = await fetch("/api/empresas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razonSocial: form.razonSocial,
        nombreComercial: form.nombreComercial,
        ruc: form.ruc || undefined,
        tipoNegocioId: rubroSeleccionado?.tipoNegocioSugerido?.id,
        rubroId: Number(form.rubroId),
        monedaOperacion: form.monedaOperacion,
        aplicaIgv: form.aplicaIgv,
        tasaIgv: Number(form.tasaIgv),
        regimenTributario: form.regimenTributario || undefined,
        capitalSocialInicial: Number(form.capitalSocialInicial),
      }),
    });

    setEnviando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo crear la empresa.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        Configuración → <b>Alta de nueva empresa</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Dar de alta un nuevo cliente</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 14, marginBottom: 28 }}>
        Estos datos configuran cómo se comporta el sistema para esta empresa desde el primer día.
      </p>

      <form onSubmit={handleSubmit} className="card">
        <h2 style={{ fontSize: 15, marginBottom: 16 }}>1. Datos generales</h2>

        <div className="field">
          <label>Razón social</label>
          <input
            value={form.razonSocial}
            onChange={(e) => setForm({ ...form, razonSocial: e.target.value })}
            placeholder="Inversiones El Fogón SAC"
          />
        </div>

        <div className="field">
          <label>Nombre comercial</label>
          <input
            value={form.nombreComercial}
            onChange={(e) => setForm({ ...form, nombreComercial: e.target.value })}
            placeholder="El Fogón"
          />
        </div>

        <div className="field">
          <label>RUC (opcional)</label>
          <input
            value={form.ruc}
            onChange={(e) => setForm({ ...form, ruc: e.target.value })}
            placeholder="20601234567"
            maxLength={11}
          />
        </div>

        <h2 style={{ fontSize: 15, margin: "28px 0 16px" }}>2. Tipo de negocio y rubro</h2>

        <div className="field">
          <label>Rubro</label>
          <select value={form.rubroId} onChange={(e) => setForm({ ...form, rubroId: e.target.value })}>
            <option value="">Selecciona un rubro...</option>
            {rubros.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </div>

        {rubroSeleccionado && (
          <p className="mono" style={{ fontSize: 11, color: "var(--teal)", marginTop: -10, marginBottom: 18 }}>
            Se activarán automáticamente: {rubroSeleccionado.requiereInventario ? "Inventario, " : ""}
            {rubroSeleccionado.requiereFichasTecnicas ? "Fichas técnicas, " : ""}
            Compras, CxC/CxP, Caja y Bancos, Gastos, Activos fijos, Préstamos.
          </p>
        )}

        <h2 style={{ fontSize: 15, margin: "28px 0 16px" }}>3. Configuración financiera</h2>

        <div className="field">
          <label>Moneda de operación</label>
          <select
            value={form.monedaOperacion}
            onChange={(e) => setForm({ ...form, monedaOperacion: e.target.value })}
          >
            <option value="PEN">Soles (PEN)</option>
            <option value="USD">Dólares (USD)</option>
          </select>
        </div>

        <div className="field checkbox-row">
          <input
            type="checkbox"
            id="aplicaIgv"
            checked={form.aplicaIgv}
            onChange={(e) => setForm({ ...form, aplicaIgv: e.target.checked })}
          />
          <label htmlFor="aplicaIgv" style={{ marginBottom: 0 }}>
            Esta empresa aplica IGV
          </label>
        </div>

        {form.aplicaIgv && (
          <div className="field">
            <label>Tasa de IGV (%)</label>
            <input
              type="number"
              step="0.01"
              value={form.tasaIgv}
              onChange={(e) => setForm({ ...form, tasaIgv: Number(e.target.value) })}
            />
          </div>
        )}

        <div className="field">
          <label>Régimen tributario</label>
          <select
            value={form.regimenTributario}
            onChange={(e) => setForm({ ...form, regimenTributario: e.target.value })}
          >
            <option value="">No especificado</option>
            <option value="NUEVO_RUS">Nuevo RUS</option>
            <option value="RER">Régimen Especial (RER)</option>
            <option value="RMT">Régimen MYPE Tributario (RMT)</option>
            <option value="GENERAL">Régimen General</option>
          </select>
        </div>

        <div className="field">
          <label>Capital social inicial (opcional)</label>
          <input
            type="number"
            step="0.01"
            value={form.capitalSocialInicial}
            onChange={(e) => setForm({ ...form, capitalSocialInicial: Number(e.target.value) })}
          />
        </div>

        {error && <p className="field error">{error}</p>}

        <button type="submit" className="btn-primary" disabled={enviando} style={{ marginTop: 8 }}>
          {enviando ? "Creando..." : "Crear empresa"}
        </button>
      </form>
    </main>
  );
}
