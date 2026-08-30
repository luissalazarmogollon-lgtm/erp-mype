"use client";

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
