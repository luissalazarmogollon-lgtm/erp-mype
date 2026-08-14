"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function EliminarEmpresaButton({ empresaId, nombreComercial }: { empresaId: string; nombreComercial: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [eliminando, setEliminando] = useState(false);

  async function handleEliminar() {
    setError(null);
    setEliminando(true);
    const res = await fetch(`/api/empresas/${empresaId}`, { method: "DELETE" });
    setEliminando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo eliminar la empresa.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  if (!abierto) {
    return (
      <button className="btn-ghost" style={{ borderColor: "var(--alert)", color: "var(--alert)" }} onClick={() => setAbierto(true)}>
        Eliminar empresa
      </button>
    );
  }

  return (
    <div className="card" style={{ borderColor: "var(--alert)", marginTop: 12 }}>
      <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
        Esto elimina <b>permanentemente</b> "{nombreComercial}" y todos sus datos: ventas, gastos, insumos,
        productos, créditos, equipo asignado. No se puede deshacer.
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
          style={{ background: "var(--alert)", borderColor: "var(--alert)" }}
          disabled={confirmacion !== nombreComercial || eliminando}
          onClick={handleEliminar}
        >
          {eliminando ? "Eliminando..." : "Eliminar definitivamente"}
        </button>
        <button className="btn-ghost" onClick={() => { setAbierto(false); setConfirmacion(""); setError(null); }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
