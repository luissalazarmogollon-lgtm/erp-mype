"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Producto = { id: string; nombre: string; precioVenta: string; requiereReceta: boolean };
type Catalogo = { id: string; nombre: string };

type LineaCarrito = { productoId: string; nombre: string; cantidad: number; precioUnitario: number };

export default function NuevaVentaPage({ params }: { params: { id: string } }) {
  const empresaId = params.id;
  const router = useRouter();

  const [productos, setProductos] = useState<Producto[]>([]);
  const [metodosPago, setMetodosPago] = useState<Catalogo[]>([]);
  const [clientes, setClientes] = useState<Catalogo[]>([]);

  const [productoSeleccionado, setProductoSeleccionado] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [metodoPagoId, setMetodoPagoId] = useState("");
  const [clienteId, setClienteId] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [stockInsuficiente, setStockInsuficiente] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    fetch(`/api/empresas/${empresaId}/catalogos`)
      .then((r) => r.json())
      .then((data) => {
        setProductos(data.productos ?? []);
        setMetodosPago(data.metodosPago ?? []);
        setClientes(data.clientes ?? []);
        if (data.productos?.length > 0) setProductoSeleccionado(data.productos[0].id);
      });
  }, [empresaId]);

  function agregarAlCarrito() {
    const producto = productos.find((p) => p.id === productoSeleccionado);
    if (!producto || cantidad <= 0) return;

    const existente = carrito.find((l) => l.productoId === producto.id);
    if (existente) {
      setCarrito(
        carrito.map((l) => (l.productoId === producto.id ? { ...l, cantidad: l.cantidad + cantidad } : l))
      );
    } else {
      setCarrito([
        ...carrito,
        { productoId: producto.id, nombre: producto.nombre, cantidad, precioUnitario: Number(producto.precioVenta) },
      ]);
    }
    setCantidad(1);
  }

  function quitarLinea(productoId: string) {
    setCarrito(carrito.filter((l) => l.productoId !== productoId));
  }

  const subtotal = carrito.reduce((acc, l) => acc + l.precioUnitario * l.cantidad, 0);

  async function confirmarVenta(forzarSinStock = false) {
    setError(null);
    setEnviando(true);

    const res = await fetch(`/api/empresas/${empresaId}/ventas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: carrito.map((l) => ({
          productoId: l.productoId,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario,
        })),
        metodoPagoId: metodoPagoId || undefined,
        clienteId: clienteId || undefined,
        forzarSinStock,
      }),
    });

    setEnviando(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.toString() ?? "No se pudo registrar la venta.");
      setStockInsuficiente(Boolean(data.stockInsuficiente));
      return;
    }

    router.push(`/empresas/${empresaId}/ventas`);
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}/ventas`} style={{ color: "inherit" }}>
          Ventas
        </Link>{" "}
        → <b>Nueva venta</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 20 }}>Registrar venta</h1>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 2, marginBottom: 0 }}>
            <label>Producto</label>
            <select value={productoSeleccionado} onChange={(e) => setProductoSeleccionado(e.target.value)}>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} — S/ {Number(p.precioVenta).toFixed(2)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label>Cantidad</label>
            <input type="number" min={1} value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} />
          </div>
          <button className="btn-primary" onClick={agregarAlCarrito} style={{ marginBottom: 18 }}>
            Agregar
          </button>
        </div>
      </div>

      {carrito.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          {carrito.map((l) => (
            <div key={l.productoId} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <span style={{ fontSize: 13 }}>
                {l.cantidad} × {l.nombre}
              </span>
              <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span className="mono" style={{ fontSize: 13 }}>S/ {(l.cantidad * l.precioUnitario).toFixed(2)}</span>
                <button onClick={() => quitarLinea(l.productoId)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-soft)" }}>
                  ×
                </button>
              </span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--line)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 500 }}>Subtotal</span>
            <span className="mono" style={{ fontWeight: 500 }}>S/ {subtotal.toFixed(2)}</span>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field">
            <label>Método de pago</label>
            <select value={metodoPagoId} onChange={(e) => setMetodoPagoId(e.target.value)}>
              <option value="">Seleccionar</option>
              {metodosPago.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Cliente (opcional)</label>
            <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Consumidor final</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="field error" style={{ marginBottom: 12 }}>
          <p>{error}</p>
          {stockInsuficiente && (
            <button
              className="btn-ghost"
              style={{ marginTop: 8, fontSize: 12 }}
              onClick={() => confirmarVenta(true)}
            >
              Registrar de todas formas (stock quedará en negativo)
            </button>
          )}
        </div>
      )}

      <button
        className="btn-primary"
        disabled={carrito.length === 0 || enviando}
        onClick={() => confirmarVenta(false)}
      >
        {enviando ? "Registrando..." : `Confirmar venta — S/ ${subtotal.toFixed(2)}`}
      </button>
    </main>
  );
}
