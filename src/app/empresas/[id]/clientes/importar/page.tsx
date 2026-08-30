"use client";

import { useState } from "react";
import Link from "next/link";

type Resultado = {
  creados: number;
  actualizados: number;
  totalFilas: number;
  errores: { fila: number; motivo: string }[];
};

export default function ImportarClientesPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImportar() {
    setError(null);
    setResultado(null);
    if (!archivo) {
      setError("Elige el archivo Excel que llenaste.");
      return;
    }
    setSubiendo(true);
    const formData = new FormData();
    formData.append("archivo", archivo);
    const res = await fetch(`/api/empresas/${empresaId}/clientes/importar`, { method: "POST", body: formData });
    setSubiendo(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo importar el archivo.");
      return;
    }
    const json: Resultado = await res.json();
    setResultado(json);
    setArchivo(null);
  }

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}/clientes`} style={{ color: "inherit" }}>
          ← Clientes
        </Link>
      </p>
      <h1 style={{ fontSize: 24, marginBottom: 6 }}>Cargar clientes por plantilla</h1>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 20 }}>
        Descarga la plantilla, complétala con los datos que ya tienes en Excel o Google Sheets, y súbela de vuelta
        aquí. Si el nombre comercial de una fila ya existe como cliente, se actualiza su ficha en vez de crear un
        duplicado — puedes usar el mismo archivo para cargar todo de una vez y luego mantenerlo al día.
      </p>

      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontWeight: 500, marginBottom: 10 }}>1. Descarga la plantilla</p>
        <a
          href={`/api/empresas/${empresaId}/clientes/plantilla`}
          className="btn-ghost"
          style={{ textDecoration: "none", fontSize: 13 }}
        >
          Descargar plantilla-clientes.xlsx
        </a>
        <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 8 }}>
          Trae una fila de ejemplo y una segunda hoja "Ayuda" con el detalle de cada columna (razón social, RUC,
          representante legal, persona de contacto, dirección, teléfonos, rubro, redes sociales y el link del logo).
        </p>
      </div>

      <div className="card">
        <p style={{ fontWeight: 500, marginBottom: 10 }}>2. Sube el archivo lleno</p>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          style={{ marginBottom: 12 }}
        />
        {error && <p className="field error">{error}</p>}
        <div>
          <button className="btn-primary" disabled={subiendo} onClick={handleImportar}>
            {subiendo ? "Importando..." : "Importar"}
          </button>
        </div>

        {resultado && (
          <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <p style={{ fontSize: 14 }}>
              <span style={{ color: "var(--teal)", fontWeight: 500 }}>{resultado.creados}</span> cliente
              {resultado.creados !== 1 ? "s" : ""} nuevo{resultado.creados !== 1 ? "s" : ""} y{" "}
              <span style={{ color: "var(--teal)", fontWeight: 500 }}>{resultado.actualizados}</span> actualizado
              {resultado.actualizados !== 1 ? "s" : ""}, de {resultado.totalFilas} fila
              {resultado.totalFilas !== 1 ? "s" : ""} en el archivo.
            </p>
            {resultado.errores.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <p className="mono" style={{ fontSize: 11, color: "var(--alert)", textTransform: "uppercase" }}>
                  {resultado.errores.length} fila{resultado.errores.length !== 1 ? "s" : ""} con error
                </p>
                {resultado.errores.map((e, i) => (
                  <p key={i} className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 4 }}>
                    Fila {e.fila}: {e.motivo}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
