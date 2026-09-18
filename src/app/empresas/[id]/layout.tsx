"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
// Ajusta este import a donde termines copiando Sidebar.tsx.
// Si tu proyecto no usa el alias "@/", usa una ruta relativa
// (p. ej. "../../components/layout/Sidebar").

/**
 * Layout compartido para todas las pantallas internas del ERP
 * (todo lo que va DENTRO del sidebar: Dashboard, Compras, Inventario,
 * Finanzas, etc.). En App Router esto normalmente vive en un route
 * group, p. ej.:
 *
 *   src/app/(dashboard)/layout.tsx   ← este archivo
 *   src/app/(dashboard)/dashboard/page.tsx
 *   src/app/(dashboard)/compras/solicitudes/page.tsx
 *   ...
 *
 * El login NO debe usar este layout (va fuera del route group
 * "(dashboard)", en su propio src/app/login/page.tsx), porque no
 * lleva sidebar ni topbar.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // En celular el sidebar de 240px no cabe (aplastaba el contenido contra
  // el borde — ver captura del reporte) así que ahí deja de ocupar espacio
  // fijo y pasa a ser un panel que se abre encima del contenido (CSS en
  // globals.css, sección "Sidebar / mobile"). Este estado es el que
  // controla si ese panel está abierto; en desktop no hace nada (el CSS
  // solo aplica el comportamiento "off-canvas" bajo el breakpoint móvil).
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      {/* El sidebar tiene su propio scroll interno (ver nav en Sidebar.tsx)
          y por eso este contenedor fija su altura al viewport con
          overflow:hidden. Pero el contenido de cada pantalla (los distintos
          page.tsx) es un <main> normal sin su propio scroll — con
          overflow:hidden aquí también, cualquier pantalla más alta que la
          ventana quedaba recortada y sin forma de bajar (el bug reportado:
          "no me deja escrolear"). El fix es que ESTE contenedor sea el que
          scrollea verticalmente, no el sidebar. */}
      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", overflowY: "auto", overflowX: "hidden" }}>
        {/* Botón de menú — solo visible en celular (CSS lo oculta en
            desktop, donde el sidebar ya está siempre visible al costado).
            Va pegado arriba del contenido de cada pantalla, no flotando
            sobre la barra superior de AppChrome, para no taparla ni
            depender de que cada pantalla tenga su propio encabezado. */}
        <button
          type="button"
          className="sidebar-mobile-toggle"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}>
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
          <span>Menú</span>
        </button>
        {children}
      </div>
    </div>
  );
}
