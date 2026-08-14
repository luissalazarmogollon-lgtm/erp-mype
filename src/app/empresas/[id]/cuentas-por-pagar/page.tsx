"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Cxp = {
  id: string;
  proveedorNombre: string | null;
  descripcionGasto: string;
  montoTotal: string;
  saldoPendiente: string;
  fechaEmision: string;
  estado: string;
};
type CuentaOpcion = { id: string; bancoNombre: string; saldoActual: string };

export default function CuentasPorPagarPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [cxps, setCxps] = useState<Cxp[]>([]);
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaOpcion[]>([]);
  const [pagando, setPagando] = useState<string | null>(null);
  const [montoPago, setMontoPago] = useState(0);
  const [cuentaPago, setCuentaPago] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    const [resCxp, resCatalogos] = await Promise.all([
      fetch(`/api/empresas/${empresaId}/cuentas-por-pagar`).then((r) => r.json()),
      fetch(`/api/empresas/${empresaId}/catalogos`).then((r) => r.json()),
    ]);
    setCxps(resCxp);
    setCuentasBancarias(resCatalogos.cuentasBancarias ?? []);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const totalPorPagar = cxps.filter((c) => c.estado !== "pagada").reduce((acc, c) => acc + Number(c.saldoPendiente), 0);

  async function handlePago(cxpId: string) {
    setError(null);
    const res = await fetch(`/api/empresas/${empresaId}/cuentas-por-pagar/${cxpId}/pago`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monto: montoPago, cuentaBancariaId: cuentaPago || undefined }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo registrar el pago.");
      return;
    }
    setPagando(null);
    setMontoPago(0);
    cargar();
  }

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>Cuentas por pagar</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Cuentas por pagar</h1>
      <p className="mono" style={{ fontSize: 12, color: "var(--alert)", marginBottom: 20 }}>
        Total por pagar: S/ {totalPorPagar.toFixed(2)}
      </p>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 20 }}>
        Estas cuentas se generan automáticamente al registrar un gasto "al crédito" en la pantalla de Gastos y Costos.
        Puedes pagarlas de una sola vez o en varios abonos.
      </p>

      {cxps.length === 0 ? (
        <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>No hay cuentas por pagar registradas.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cxps.map((c) => (
            <div key={c.id} className="card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500 }}>{c.proveedorNombre ?? "Proveedor sin nombre"}</p>
                  <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                    {c.descripcionGasto} · {new Date(c.fechaEmision).toLocaleDateString("es-PE")}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p className="mono" style={{ fontSize: 14 }}>
                    S/ {Number(c.saldoPendiente).toFixed(2)}{" "}
                    <span style={{ fontSize: 10, color: "var(--ink-soft)" }}>/ {Number(c.montoTotal).toFixed(2)}</span>
                  </p>
                  <p className="mono" style={{ fontSize: 10, textTransform: "uppercase", color: c.estado === "pagada" ? "var(--teal)" : "var(--stamp)" }}>
                    {c.estado}
                  </p>
                </div>
              </div>

              {c.estado !== "pagada" && (
                pagando === c.id ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: cuentasBancarias.length > 0 ? 8 : 0 }}>
                      <input
                        type="number"
                        step="0.01"
                        value={montoPago}
                        onChange={(e) => setMontoPago(Number(e.target.value))}
                        style={{ flex: 1, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 2 }}
                      />
                      <button className="btn-primary" style={{ padding: "8px 14px", fontSize: 12 }} onClick={() => handlePago(c.id)}>
                        Confirmar
                      </button>
                      <button className="btn-ghost" style={{ padding: "8px 14px", fontSize: 12 }} onClick={() => setPagando(null)}>
                        Cancelar
                      </button>
                    </div>
                    {cuentasBancarias.length > 0 && (
                      <select
                        value={cuentaPago}
                        onChange={(e) => setCuentaPago(e.target.value)}
                        style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 2, fontSize: 12 }}
                      >
                        <option value="">¿De qué cuenta sale? (opcional, para el flujo de caja)</option>
                        {cuentasBancarias.map((cb) => (
                          <option key={cb.id} value={cb.id}>{cb.bancoNombre} (S/ {Number(cb.saldoActual).toFixed(2)})</option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : (
                  <button
                    className="btn-ghost"
                    style={{ marginTop: 10, fontSize: 12, padding: "6px 12px" }}
                    onClick={() => { setPagando(c.id); setMontoPago(Number(c.saldoPendiente)); setCuentaPago(""); setError(null); }}
                  >
                    Registrar pago
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
      {error && <p className="field error" style={{ marginTop: 12 }}>{error}</p>}
    </main>
  );
}
