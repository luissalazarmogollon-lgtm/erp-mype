"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type DiaCarga = { fecha: string; horas: number; capacidadDiaria: number; excede: boolean };
type EmpleadoCarga = { empleadoId: string; nombre: string; capacidadDiaria: number; porDia: DiaCarga[]; totalPeriodo: number };
type Reporte = { desde: string; hasta: string; dias: string[]; empleados: EmpleadoCarga[] };

function formatoDiaCorto(fechaISO: string) {
  const d = new Date(fechaISO + "T00:00:00Z");
  return d.toLocaleDateString("es-PE", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

export default function CargaTrabajoPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [desde, setDesde] = useState("");

  async function cargar(desdeParam?: string) {
    const url = desdeParam
      ? `/api/empresas/${empresaId}/actividades/carga-trabajo?desde=${desdeParam}`
      : `/api/empresas/${empresaId}/actividades/carga-trabajo`;
    const res = await fetch(url).then((r) => r.json());
    setReporte(res);
    setDesde(res.desde);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  function semanaAnterior() {
    if (!reporte) return;
    const d = new Date(reporte.desde + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 7);
    cargar(d.toISOString().slice(0, 10));
  }

  function semanaSiguiente() {
    if (!reporte) return;
    const d = new Date(reporte.desde + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 7);
    cargar(d.toISOString().slice(0, 10));
  }

  function colorCelda(d: DiaCarga) {
    if (d.horas === 0) return "transparent";
    if (d.excede) return "var(--alert)";
    if (d.horas >= d.capacidadDiaria * 0.85) return "var(--stamp)";
    return "var(--teal)";
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}/actividades`} style={{ color: "inherit" }}>
          Gestión de Actividades
        </Link>{" "}
        → <b>Carga de trabajo</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Carga de trabajo por trabajador</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 20 }}>
        Horas asignadas por día frente a la capacidad diaria de cada trabajador. En rojo, los días donde se le
        asignó más tiempo del que puede cubrir.
      </p>

      {reporte && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <button className="btn-ghost" onClick={semanaAnterior}>← Semana anterior</button>
            <p className="mono" style={{ fontSize: 12 }}>
              {formatoDiaCorto(reporte.desde)} — {formatoDiaCorto(reporte.hasta)}
            </p>
            <button className="btn-ghost" onClick={semanaSiguiente}>Semana siguiente →</button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: 8, borderBottom: "2px solid var(--ink)" }}>Trabajador</th>
                  {reporte.dias.map((d) => (
                    <th key={d} className="mono" style={{ padding: 8, borderBottom: "2px solid var(--ink)", textAlign: "center" }}>
                      {formatoDiaCorto(d)}
                    </th>
                  ))}
                  <th className="mono" style={{ padding: 8, borderBottom: "2px solid var(--ink)", textAlign: "center" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {reporte.empleados.map((e) => (
                  <tr key={e.empleadoId}>
                    <td style={{ padding: 8, borderBottom: "1px solid var(--line)" }}>
                      {e.nombre}
                      <span className="mono" style={{ color: "var(--ink-soft)", marginLeft: 6, fontSize: 10 }}>
                        (cap. {e.capacidadDiaria}h/día)
                      </span>
                    </td>
                    {e.porDia.map((d) => (
                      <td key={d.fecha} style={{ padding: 8, borderBottom: "1px solid var(--line)", textAlign: "center" }}>
                        <span
                          className="mono"
                          style={{
                            display: "inline-block",
                            minWidth: 36,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: colorCelda(d),
                            color: d.horas === 0 ? "var(--ink-soft)" : "#fff",
                          }}
                        >
                          {d.horas > 0 ? d.horas : "–"}
                        </span>
                      </td>
                    ))}
                    <td className="mono" style={{ padding: 8, borderBottom: "1px solid var(--line)", textAlign: "center", fontWeight: 600 }}>
                      {e.totalPeriodo}h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {reporte.empleados.length === 0 && (
              <p style={{ color: "var(--ink-soft)", fontSize: 14, marginTop: 12 }}>No hay trabajadores registrados en RRHH.</p>
            )}
          </div>
        </>
      )}
    </main>
  );
}
