"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Lote = {
  id: string;
  origen: string;
  fechaIngreso: string;
  cantidadInicial: string;
  cantidadDisponible: string;
  costoUnitario: string;
  agotado: boolean;
};
type Movimiento = {
  id: string;
  tipo: string;
  cantidad: string;
  costoUnitario: string;
  fecha: string;
  loteOrigen: string | null;
  loteFechaIngreso: string | null;
};

const TIPO_LABEL: Record<string, string> = {
  entrada_compra: "Entrada por compra",
  salida_venta: "Salida por venta",
  salida_solicitud: "Salida por despacho",
  merma: "Merma",
  ajuste_manual: "Ajuste manual",
};

const ORIGEN_LABEL: Record<string, string> = {
  apertura: "Apertura (migración)",
  ajuste_manual: "Ajuste manual",
  compra: "Compra",
};

export default function KardexInsumoPage({ params }: { params: { id: string; insumoId: string } }) {
  const empresaId = params.id;
  const insumoId = params.insumoId;

  const [insumo, setInsumo] = useState<{ nombre: string; stockActual: string; costoPromedioActual: string } | null>(null);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);

  useEffect(() => {
    fetch(`/api/empresas/${empresaId}/insumos/${insumoId}/kardex`)
      .then((r) => r.json())
      .then((data) => {
        setInsumo(data.insumo ?? null);
        setLotes(data.lotes ?? []);
        setMovimientos(data.movimientos ?? []);
      });
  }, [empresaId, insumoId]);

  if (!insumo) return null;

  const lotesVigentes = lotes.filter((l) => !l.agotado);

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}/insumos`} style={{ color: "inherit" }}>
          ← Insumos
        </Link>
      </p>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>{insumo.nombre}</h1>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 24 }}>
        Stock actual: {Number(insumo.stockActual).toFixed(2)} · Costo promedio: S/ {Number(insumo.costoPromedioActual).toFixed(4)}
      </p>

      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Lotes vigentes (orden PEPS — el primero se consume primero)</h2>
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 28 }}>
        {lotesVigentes.map((l, i) => (
          <div
            key={l.id}
            style={{
              display: "flex", justifyContent: "space-between", padding: "10px 14px",
              borderBottom: i < lotesVigentes.length - 1 ? "1px solid var(--line)" : "none",
            }}
          >
            <div>
              <span className="mono" style={{ fontSize: 11, textTransform: "uppercase", color: "var(--ink-soft)" }}>
                {ORIGEN_LABEL[l.origen] ?? l.origen}
              </span>
              <p style={{ fontSize: 13 }}>{new Date(l.fechaIngreso).toLocaleDateString("es-PE")}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p className="mono" style={{ fontSize: 13 }}>
                {Number(l.cantidadDisponible).toFixed(2)} / {Number(l.cantidadInicial).toFixed(2)}
              </p>
              <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>S/ {Number(l.costoUnitario).toFixed(4)} c/u</p>
            </div>
          </div>
        ))}
        {lotesVigentes.length === 0 && (
          <p style={{ padding: 14, color: "var(--ink-soft)", fontSize: 13 }}>No hay lotes con stock disponible.</p>
        )}
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Kardex (últimos movimientos)</h2>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {movimientos.map((m, i) => (
          <div
            key={m.id}
            style={{
              display: "flex", justifyContent: "space-between", padding: "10px 14px",
              borderBottom: i < movimientos.length - 1 ? "1px solid var(--line)" : "none",
            }}
          >
            <div>
              <p style={{ fontSize: 13 }}>{TIPO_LABEL[m.tipo] ?? m.tipo}</p>
              <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                {new Date(m.fecha).toLocaleString("es-PE")}
                {m.loteFechaIngreso ? ` · lote ${new Date(m.loteFechaIngreso).toLocaleDateString("es-PE")}` : ""}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p className="mono" style={{ fontSize: 13, color: Number(m.cantidad) < 0 ? "var(--alert)" : "var(--teal)" }}>
                {Number(m.cantidad) > 0 ? "+" : ""}{Number(m.cantidad).toFixed(2)}
              </p>
              <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>S/ {Number(m.costoUnitario).toFixed(4)}</p>
            </div>
          </div>
        ))}
        {movimientos.length === 0 && (
          <p style={{ padding: 14, color: "var(--ink-soft)", fontSize: 13 }}>Todavía no hay movimientos.</p>
        )}
      </div>
    </main>
  );
}
