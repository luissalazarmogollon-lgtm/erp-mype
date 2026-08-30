"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type TipoNegocioOpcion = { id: number; nombre: string };

// Control para que el superadmin reclasifique el tipo de negocio de una
// empresa ya creada (Productos / Servicios / Productos y Servicios). Solo
// cambia qué módulos se muestran/permiten — nunca borra datos existentes
// de Insumos, Productos, Mermas o Ventas, aunque queden ocultos.
export function CambiarTipoNegocio({
  empresaId,
  tipoNegocioActualId,
  tiposNegocio,
}: {
  empresaId: string;
  tipoNegocioActualId: number;
  tiposNegocio: TipoNegocioOpcion[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(tipoNegocioActualId);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setError(null);

    const res = await fetch(`/api/empresas/${empresaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipoNegocioId: valor }),
    });

    setGuardando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo cambiar el tipo de negocio.");
      return;
    }

    setEditando(false);
    router.refresh();
  }

  if (!editando) {
    return (
      <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setEditando(true)}>
        Cambiar tipo de negocio
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <select
        value={valor}
        onChange={(e) => setValor(Number(e.target.value))}
        style={{ fontSize: 12, padding: "4px 6px" }}
      >
        {tiposNegocio.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nombre}
          </option>
        ))}
      </select>
      <button className="btn-primary" style={{ fontSize: 11, padding: "4px 10px" }} disabled={guardando} onClick={guardar}>
        {guardando ? "Guardando..." : "Guardar"}
      </button>
      <button className="btn-ghost" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => { setEditando(false); setError(null); }}>
        Cancelar
      </button>
      {error && <span style={{ fontSize: 11, color: "var(--alert)" }}>{error}</span>}
    </div>
  );
}
