"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VaciarDatosButton({ empresaId, nombreComercial }: { empresaId: string; nombreComercial: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [vaciando, setVaciando] = useState(false);
  const [listo, setListo] = useState(false);

  async function handleVaciar() {
    setError(null);
    setVaciando(true);
    const res = await fetch(`/api/empresas/${empresaId}/vaciar-datos`, { method: "POST" });
    setVaciando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo vaciar la empresa.");
      return;
    }

    setListo(true);
    setAbierto(false);
    router.refresh();
  }

  if (!abierto) {
    return (
      <div>
        <button className="btn-ghost" style={{ borderColor: "var(--stamp)", color: "var(--stamp)" }} onClick={() => setAbierto(true)}>
          Vaciar datos de prueba
        </button>
        {listo && (
          <p className="mono" style={{ fontSize: 11, color: "var(--teal)", marginTop: 6 }}>
            Datos vaciados. La empresa quedó lista para empezar desde cero.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="card" style={{ borderColor: "var(--stamp)", marginTop: 12 }}>
      <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
        Esto borra <b>permanentemente</b> todos los registros operativos de "{nombreComercial}": ventas, gastos,
        créditos, cuentas por pagar, caja chica, trabajadores/adelantos, insumos, productos, clientes, y el
        historial de movimientos bancarios. No se puede deshacer.
      </p>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 8 }}>
        Se <b>conserva</b>: la configuración de la empresa, los catálogos, los locales, las cuentas bancarias
        (con su saldo en S/ 0), y el equipo ya asignado.
      </p>
      <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 6 }}>
        Escribe <b>{nombreComercial}</b> para confirmar:
      </p>
      <input
        value={confirmacion}
        onChange={(e) => setConfirmacion(e.target.value)}
        style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 2, marginBottom: 12 }}
      />
      {error && <p className="field error">{error}</p>}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          className="btn-primary"
          style={{ background: "var(--stamp)", borderColor: "var(--stamp)" }}
          disabled={confirmacion !== nombreComercial || vaciando}
          onClick={handleVaciar}
        >
          {vaciando ? "Vaciando..." : "Vaciar datos definitivamente"}
        </button>
        <button className="btn-ghost" onClick={() => { setAbierto(false); setConfirmacion(""); setError(null); }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
