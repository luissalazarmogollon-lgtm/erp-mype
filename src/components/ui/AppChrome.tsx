"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "./LogoutButton";

// Antes cada pantalla era una isla suelta: no había ningún marco visual
// compartido, y una vez dentro de una empresa la única forma de cerrar
// sesión o volver a "Tus empresas" era el botón "atrás" del navegador (el
// botón de Cerrar sesión solo vivía en /dashboard). Esta barra superior
// persistente le da a todo el sistema un mismo encabezado — como el
// encabezado fijo de SAP Business One — con la marca a la izquierda
// (que lleva de vuelta a "Tus empresas") y Cerrar sesión siempre visible
// a la derecha.
//
// Se oculta solo en /login, que tiene su propia pantalla de bienvenida a
// pantalla completa sin encabezado.
export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sinChrome = pathname === "/login";

  // Bug conocido de los navegadores basados en Chromium (Chrome, Edge) y
  // también de Firefox: si el mouse queda sobre un <input type="number">
  // que tiene el foco y la persona hace scroll para bajar/subir la
  // página, el navegador interpreta la rueda como "sube/baja el valor" y
  // cambia el monto EN SILENCIO, de a "step" (0.01 en todos los campos de
  // montos de este sistema) por cada click de rueda — así es como una
  // factura de S/ 1,000.00 puede terminar guardándose como S/ 999.97 (3
  // clicks de rueda hacia abajo) sin que nadie haya tocado el teclado ni
  // se haya dado cuenta, porque el campo sigue mostrando el cursor ahí
  // mismo. Se desactiva ese comportamiento a nivel de toda la aplicación:
  // cualquier scroll mientras un campo numérico tiene el foco simplemente
  // le quita el foco (blur) en vez de cambiarle el valor — igual de
  // cómodo para seguir bajando la página, pero ya no toca el monto.
  useEffect(() => {
    function evitarScrollCambieNumero(e: WheelEvent) {
      const activo = document.activeElement;
      if (activo instanceof HTMLInputElement && activo.type === "number") {
        activo.blur();
      }
    }
    document.addEventListener("wheel", evitarScrollCambieNumero, { passive: true });
    return () => document.removeEventListener("wheel", evitarScrollCambieNumero);
  }, []);

  if (sinChrome) return <>{children}</>;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "12px 24px",
          background: "var(--brand)",
          borderBottom: "3px solid var(--stamp)",
        }}
      >
        <Link
          href="/dashboard"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
          }}
        >
          <span
            aria-hidden
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              borderRadius: 6,
              background: "var(--stamp)",
              color: "var(--ink)",
              fontFamily: "IBM Plex Mono, monospace",
              fontWeight: 700,
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            EM
          </span>
          <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em", color: "#fff" }}>
            ERP MYPE
          </span>
        </Link>
        <LogoutButton style={{ background: "#fff", borderColor: "#fff", color: "var(--brand-dark)" }} />
      </header>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}
