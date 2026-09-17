"use client";

import { useState } from "react";
import Link from "next/link";

type Resultado = {
  creados: number;
  actualizados: number;
  totalFilas: number;
  errores: { fila: number; motivo: string }[];
};

export default function ImportarProductosPage({ params }: { params: { id: string } }) {
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
    const res = await fetch(`/api/empresas/${empresaId}/productos/importar`, { method: "POST", body: formData });
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
        <Link href={`/empresas/${empresaId}/productos`} style={{ color: "inherit" }}>
          ← Productos
        </Link>
      </p>
      <h1 style={{ fontSize: 24, marginBottom: 6 }}>Cargar productos por plantilla</h1>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 20 }}>
        Descarga la plantilla, complétala en Excel o Google Sheets, y súbela de vuelta aquí. Si escribes una
        categoría o unidad de medida que todavía no existe, se crea automáticamente. Si una fila coincide con un
        producto que ya tienes registrado (mismo código, o si no pones código, mismo nombre), se{" "}
        <strong>sobrescriben todos sus datos</strong> (nombre, código, categoría, tipo, precio de venta, unidad de
        medida y stock mínimo) con lo que traiga la plantilla — el stock actual y el costo del producto no se tocan,
        esos siguen viniendo de "Ajustar stock" o de las ventas ya registradas.
      </p>
      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 20 }}>
        Las columnas <strong>stock_inicial</strong> y <strong>costo_unitario_inicial</strong> solo aplican al crear
        un producto nuevo (se ignoran si la fila sobrescribe uno que ya existe): si pones stock inicial mayor a 0,
        también debes poner su costo unitario, y se crea el mismo respaldo de lote que si lo cargaras a mano con
        "Ajustar stock".
      </p>

      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ fontWeight: 500, marginBottom: 10 }}>1. Descarga la plantilla</p>
        <a
          href={`/api/empresas/${empresaId}/productos/plantilla`}
          className="btn-ghost"
          style={{ textDecoration: "none", fontSize: 13 }}
        >
          Descargar plantilla-productos.xlsx
        </a>
        <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 8 }}>
          Trae una hoja "Productos" y una hoja "Ayuda" con las categorías y unidades de medida que ya tienes
          registradas en esta empresa.
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
              <span style={{ color: "var(--teal)", fontWeight: 500 }}>{resultado.creados}</span> producto
              {resultado.creados !== 1 ? "s" : ""} nuevo{resultado.creados !== 1 ? "s" : ""} creado
              {resultado.creados !== 1 ? "s" : ""} y{" "}
              <span style={{ color: "var(--teal)", fontWeight: 500 }}>{resultado.actualizados}</span> sobrescrito
              {resultado.actualizados !== 1 ? "s" : ""}, de {resultado.totalFilas} fila
              {resultado.totalFilas !== 1 ? "s" : ""} en total.
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
