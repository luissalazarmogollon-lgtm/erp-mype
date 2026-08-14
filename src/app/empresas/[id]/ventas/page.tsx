"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Venta = {
  id: string;
  numero: string;
  fecha: string;
  cliente: string;
  metodoPago: string;
  subtotal: string;
  igv: string;
  total: string;
  estado: string;
};

export default function VentasPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [ventas, setVentas] = useState<Venta[]>([]);

  useEffect(() => {
    fetch(`/api/empresas/${empresaId}/ventas`)
      .then((r) => r.json())
      .then(setVentas);
  }, [empresaId]);

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}`} style={{ color: "inherit" }}>
          Empresa
        </Link>{" "}
        → <b>Ventas</b>
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 26 }}>Ventas</h1>
        <Link href={`/empresas/${empresaId}/ventas/nueva`} className="btn-primary" style={{ textDecoration: "none" }}>
          + Nueva venta
        </Link>
      </div>

      {ventas.length === 0 ? (
        <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>Todavía no hay ventas registradas.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ventas.map((v) => (
            <div key={v.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 14 }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>
                  {v.numero} <span className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>· {v.cliente}</span>
                </p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {new Date(v.fecha).toLocaleString("es-PE")} · {v.metodoPago}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p className="mono" style={{ fontSize: 15, fontWeight: 500 }}>S/ {Number(v.total).toFixed(2)}</p>
                <p className="mono" style={{ fontSize: 10, color: "var(--ink-soft)", textTransform: "uppercase" }}>{v.estado}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
