"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  codigo: string | null;
  nombre: string;
  categoriaId: string | null;
  categoriaNombre: string | null;
  unidadNombre: string;
  stockActual: string;
  costoPromedioActual: string;
};

type Catalogo = { insumos: Item[]; productos: Item[] };

type Tipo = "insumo" | "producto";

type EntradaConteo = { contado: string; costoExcedente: string };

function clave(tipo: Tipo, id: string) {
  return `${tipo}:${id}`;
}

// Agrupa una lista de ítems por su categoría (Insumo y Producto tienen
// tablas de categoría separadas en la base de datos — categoriaNombre ya
// viene resuelta desde la API para cada uno) — los que no tienen
// categoría asignada caen en "Sin categoría", al final.
function agruparPorCategoria(items: Item[]): [string, Item[]][] {
  const grupos = new Map<string, Item[]>();
  for (const it of items) {
    const nombreGrupo = it.categoriaNombre ?? "Sin categoría";
    if (!grupos.has(nombreGrupo)) grupos.set(nombreGrupo, []);
    grupos.get(nombreGrupo)!.push(it);
  }
  return Array.from(grupos.entries()).sort(([a], [b]) => {
    if (a === "Sin categoría") return 1;
    if (b === "Sin categoría") return -1;
    return a.localeCompare(b);
  });
}

export default function InventarioPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const [datos, setDatos] = useState<Catalogo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [entradas, setEntradas] = useState<Record<string, EntradaConteo>>({});
  const [errores, setErrores] = useState<string[]>([]);
  const [resultado, setResultado] = useState<string | null>(null);
  const [grabando, setGrabando] = useState(false);

  async function cargar() {
    setCargando(true);
    setErrorCarga(null);
    const res = await fetch(`/api/empresas/${empresaId}/inventario`);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setErrorCarga(data?.error?.toString() ?? "No se pudo cargar el inventario.");
      setDatos(null);
      setCargando(false);
      return;
    }
    const data = await res.json();
    setDatos(data);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const gruposInsumos = useMemo(() => (datos ? agruparPorCategoria(datos.insumos) : []), [datos]);
  const gruposProductos = useMemo(() => (datos ? agruparPorCategoria(datos.productos) : []), [datos]);

  function actualizarContado(tipo: Tipo, id: string, valor: string) {
    setEntradas((prev) => ({
      ...prev,
      [clave(tipo, id)]: { contado: valor, costoExcedente: prev[clave(tipo, id)]?.costoExcedente ?? "" },
    }));
  }
  function actualizarCosto(tipo: Tipo, id: string, valor: string) {
    setEntradas((prev) => ({
      ...prev,
      [clave(tipo, id)]: { contado: prev[clave(tipo, id)]?.contado ?? "", costoExcedente: valor },
    }));
  }

  const totalContados = Object.values(entradas).filter((e) => e.contado.trim() !== "").length;

  async function handleGrabar() {
    setErrores([]);
    setResultado(null);
    if (!datos) return;

    const items: { tipo: Tipo; id: string; cantidadContada: number; costoUnitarioExcedente?: number }[] = [];
    const erroresLocal: string[] = [];

    function procesar(tipo: Tipo, lista: Item[]) {
      for (const it of lista) {
        const entrada = entradas[clave(tipo, it.id)];
        if (!entrada || entrada.contado.trim() === "") continue; // no se contó — se omite, no se toca

        const contado = Number(entrada.contado);
        if (!Number.isFinite(contado) || contado < 0) {
          erroresLocal.push(`"${it.nombre}": la cantidad contada no es válida.`);
          continue;
        }

        const stockActual = Number(it.stockActual);
        let costoUnitarioExcedente: number | undefined;

        if (contado > stockActual) {
          const costoTxt = entrada.costoExcedente.trim();
          if (costoTxt === "") {
            erroresLocal.push(
              `"${it.nombre}": contaste ${contado} y el sistema tenía ${stockActual} — indica el costo unitario del excedente.`
            );
            continue;
          }
          const costo = Number(costoTxt);
          if (!Number.isFinite(costo) || costo < 0) {
            erroresLocal.push(`"${it.nombre}": el costo del excedente no es válido.`);
            continue;
          }
          costoUnitarioExcedente = costo;
        }

        items.push({ tipo, id: it.id, cantidadContada: contado, costoUnitarioExcedente });
      }
    }

    procesar("insumo", datos.insumos);
    procesar("producto", datos.productos);

    if (erroresLocal.length > 0) {
      setErrores(erroresLocal);
      return;
    }
    if (items.length === 0) {
      setErrores(["No ingresaste ninguna cantidad contada todavía."]);
      return;
    }

    if (
      !window.confirm(
        `¿Grabar el conteo de ${items.length} ítem(s)? Esto actualiza el stock y el costo donde corresponda, y no se puede deshacer.`
      )
    ) {
      return;
    }

    setGrabando(true);
    const res = await fetch(`/api/empresas/${empresaId}/inventario`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    setGrabando(false);

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setErrores(data?.detalles ?? [data?.error?.toString() ?? "No se pudo grabar el conteo."]);
      return;
    }

    const data = await res.json();
    setResultado(`Conteo grabado: se ajustaron ${data.itemsAjustados} ítem(s). El resto coincidía con lo registrado.`);
    setEntradas({});
    cargar();
  }

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <b>Inventario</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>Conteo físico de inventario</h1>
      <p style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: 20 }}>
        Cuenta lo que tienes en almacén insumo por insumo y producto por producto, organizado por categoría. Escribe
        la cantidad que encontraste solo en los ítems que cuentes — los que dejes en blanco no se tocan. Al final,
        graba todo de una sola vez.
      </p>

      {cargando && <p style={{ color: "var(--ink-soft)" }}>Cargando inventario…</p>}
      {errorCarga && <p className="field error">{errorCarga}</p>}

      {datos && (
        <>
          {gruposInsumos.length === 0 && gruposProductos.length === 0 && (
            <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>No hay insumos ni productos activos para contar.</p>
          )}

          {gruposInsumos.length > 0 && (
            <>
              <h2 style={{ fontSize: 16, marginTop: 24, marginBottom: 10 }}>Insumos</h2>
              {gruposInsumos.map(([categoria, items]) => (
                <TablaCategoria
                  key={`insumo-${categoria}`}
                  tipo="insumo"
                  categoria={categoria}
                  items={items}
                  entradas={entradas}
                  onContado={actualizarContado}
                  onCosto={actualizarCosto}
                />
              ))}
            </>
          )}

          {gruposProductos.length > 0 && (
            <>
              <h2 style={{ fontSize: 16, marginTop: 24, marginBottom: 10 }}>Productos</h2>
              {gruposProductos.map(([categoria, items]) => (
                <TablaCategoria
                  key={`producto-${categoria}`}
                  tipo="producto"
                  categoria={categoria}
                  items={items}
                  entradas={entradas}
                  onContado={actualizarContado}
                  onCosto={actualizarCosto}
                />
              ))}
            </>
          )}

          {(gruposInsumos.length > 0 || gruposProductos.length > 0) && (
            <div
              className="card"
              style={{
                position: "sticky",
                bottom: 16,
                marginTop: 24,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>
                {totalContados} ítem(s) con cantidad ingresada
              </p>
              <button className="btn-primary" onClick={handleGrabar} disabled={grabando}>
                {grabando ? "Grabando..." : "Grabar conteo"}
              </button>
            </div>
          )}

          {errores.length > 0 && (
            <div className="card" style={{ marginTop: 16, borderColor: "var(--alert)" }}>
              <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--alert)" }}>
                No se grabó nada — corrige lo siguiente:
              </p>
              {errores.map((e, idx) => (
                <p key={idx} style={{ fontSize: 12.5, margin: "4px 0" }}>
                  {e}
                </p>
              ))}
            </div>
          )}

          {resultado && (
            <div className="card" style={{ marginTop: 16, borderColor: "var(--teal)" }}>
              <p style={{ fontSize: 13, color: "var(--teal)" }}>{resultado}</p>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function TablaCategoria({
  tipo,
  categoria,
  items,
  entradas,
  onContado,
  onCosto,
}: {
  tipo: Tipo;
  categoria: string;
  items: Item[];
  entradas: Record<string, EntradaConteo>;
  onContado: (tipo: Tipo, id: string, valor: string) => void;
  onCosto: (tipo: Tipo, id: string, valor: string) => void;
}) {
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 10, textTransform: "uppercase" }}>
        {categoria}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((it) => {
          const entrada = entradas[clave(tipo, it.id)];
          const contadoNum = entrada?.contado.trim() !== "" ? Number(entrada?.contado) : null;
          const stockActual = Number(it.stockActual);
          const esExcedente = contadoNum !== null && Number.isFinite(contadoNum) && contadoNum > stockActual;

          return (
            <div
              key={it.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                borderTop: "1px solid var(--line)",
                paddingTop: 10,
              }}
            >
              <div style={{ flex: "1 1 220px", minWidth: 180 }}>
                <p style={{ fontSize: 13.5, fontWeight: 500 }}>{it.nombre}</p>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                  {it.codigo ? `${it.codigo} · ` : ""}
                  {it.unidadNombre}
                </p>
              </div>

              <div style={{ flex: "0 0 auto", textAlign: "right", minWidth: 90 }}>
                <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>Registrado</p>
                <p className="mono" style={{ fontSize: 13 }}>
                  {stockActual} {it.unidadNombre}
                </p>
              </div>

              <div className="field" style={{ marginBottom: 0, flex: "0 0 130px" }}>
                <label style={{ fontSize: 11 }}>Cantidad contada</label>
                <input
                  type="number"
                  step="0.001"
                  min={0}
                  placeholder="—"
                  value={entrada?.contado ?? ""}
                  onChange={(e) => onContado(tipo, it.id, e.target.value)}
                />
              </div>

              {esExcedente && (
                <div className="field" style={{ marginBottom: 0, flex: "0 0 160px" }}>
                  <label style={{ fontSize: 11, color: "var(--alert)" }}>Costo unit. del excedente</label>
                  <input
                    type="number"
                    step="0.0001"
                    min={0}
                    placeholder="S/ 0.00"
                    value={entrada?.costoExcedente ?? ""}
                    onChange={(e) => onCosto(tipo, it.id, e.target.value)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
