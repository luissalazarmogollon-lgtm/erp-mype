"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CuentaResumen = {
  id: string;
  cliente: string;
  clienteRuc: string | null;
  numeroFactura: string | null;
  descripcion: string | null;
  montoTotal: string;
  saldoPendiente: string;
  fechaEmision: string;
  fechaVencimiento: string | null;
  estado: string;
};
type GrupoEmpresa = {
  empresaId: string;
  nombreComercial: string;
  totalPorCobrar: string;
  cantidadPendientes: number;
  cuentas: CuentaResumen[];
};

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

function estaVencida(c: CuentaResumen) {
  if (!c.fechaVencimiento) return false;
  return c.fechaVencimiento.slice(0, 10) < hoyISO();
}

// Vista consolidada de Cuentas por Cobrar de TODAS las empresas, agrupada
// por empresa — para que el superadmin (que gestiona varias empresas a la
// vez) vea de un vistazo cuánto le deben en total y quién le debe más,
// sin entrar empresa por empresa. Es de solo lectura: cobrar o eliminar
// una cuenta se sigue haciendo desde la pantalla de Créditos de esa
// empresa específica (enlace incluido en cada grupo).
export default function CuentasPorCobrarConsolidadoPage() {
  const [grupos, setGrupos] = useState<GrupoEmpresa[]>([]);
  const [totalGeneral, setTotalGeneral] = useState("0.00");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cuentas-por-cobrar")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "No se pudo cargar el resumen.");
        return data;
      })
      .then((data) => {
        setGrupos(data.empresas ?? []);
        setTotalGeneral(data.totalPorCobrar ?? "0.00");
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href="/dashboard" style={{ color: "inherit" }}>
          Tus empresas
        </Link>{" "}
        → <b>Cuentas por Cobrar</b>
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 6, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 26 }}>Cuentas por Cobrar — todas las empresas</h1>
        <div style={{ textAlign: "right" }}>
          <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", textTransform: "uppercase" }}>
            Total por cobrar
          </p>
          <p className="mono" style={{ fontSize: 26, fontWeight: 600, color: "var(--alert)" }}>
            S/ {Number(totalGeneral).toFixed(2)}
          </p>
        </div>
      </div>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 24 }}>
        Agrupado por empresa, de mayor a menor deuda pendiente. Para cobrar o eliminar una cuenta, entra a la empresa
        correspondiente.
      </p>

      {cargando ? (
        <p style={{ color: "var(--ink-soft)" }}>Cargando...</p>
      ) : error ? (
        <div className="card">
          <p className="field error" style={{ margin: 0 }}>{error}</p>
        </div>
      ) : grupos.length === 0 ? (
        <div className="card">
          <p style={{ color: "var(--ink-soft)" }}>No hay cuentas por cobrar pendientes en ninguna empresa. 🎉</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {grupos.map((g) => (
            <div key={g.empresaId} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <Link href={`/empresas/${g.empresaId}/creditos`} style={{ color: "inherit", textDecoration: "none" }}>
                  <h3 style={{ fontSize: 16 }}>{g.nombreComercial} →</h3>
                </Link>
                <div style={{ textAlign: "right" }}>
                  <p className="mono" style={{ fontSize: 15, fontWeight: 500 }}>S/ {Number(g.totalPorCobrar).toFixed(2)}</p>
                  <p className="mono" style={{ fontSize: 10, color: "var(--ink-soft)" }}>
                    {g.cantidadPendientes} cuenta{g.cantidadPendientes !== 1 ? "s" : ""} pendiente{g.cantidadPendientes !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column" }}>
                {g.cuentas.map((c) => {
                  const vencida = estaVencida(c);
                  return (
                    <div key={c.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <div>
                          <p style={{ fontSize: 13 }}>
                            {c.cliente}{c.clienteRuc ? ` — RUC ${c.clienteRuc}` : ""}
                          </p>
                          <p className="mono" style={{ fontSize: 10.5, color: vencida ? "var(--alert)" : "var(--ink-soft)" }}>
                            {c.numeroFactura ? `Factura ${c.numeroFactura} · ` : ""}
                            {new Date(c.fechaEmision).toLocaleDateString("es-PE", { timeZone: "UTC" })}
                            {c.fechaVencimiento && (
                              <> · vence {new Date(c.fechaVencimiento).toLocaleDateString("es-PE", { timeZone: "UTC" })}{vencida ? " (vencida)" : ""}</>
                            )}
                          </p>
                        </div>
                        <p className="mono" style={{ fontSize: 13 }}>
                          S/ {Number(c.saldoPendiente).toFixed(2)}{" "}
                          <span style={{ fontSize: 10, color: "var(--ink-soft)" }}>/ {Number(c.montoTotal).toFixed(2)}</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
