"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Sidebar compartido de erp-mype.
 *
 * IMPORTANTE: este sidebar vive dentro de src/app/empresas/[id]/layout.tsx,
 * o sea que TODAS sus rutas son relativas a la empresa que se está viendo
 * (/empresas/123/clientes, /empresas/123/creditos, etc.). Por eso usa
 * useParams() para leer el "id" de la URL actual y armar cada link.
 *
 * Los nombres de carpeta de abajo (clientes, creditos, cuentas-por-pagar,
 * solicitudes-pedido, etc.) son los reales que ya existen en
 * src/app/empresas/[id]/ — si creas o renombras una carpeta ahí, actualiza
 * también su entrada aquí.
 *
 * No toca tu lógica de permisos: si filtras el menú por
 * `UsuarioEmpresa.permisos`, hazlo donde importes este componente
 * (pasando una lista ya filtrada), no dentro de él.
 */

type NavLink = { label: string; segment: string };
type NavGroup = { label: string; icon: JSX.Element; children: NavLink[] };

const IconGrid = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="8" height="8" rx="2" />
    <rect x="13" y="3" width="8" height="8" rx="2" />
    <rect x="3" y="13" width="8" height="8" rx="2" />
    <rect x="13" y="13" width="8" height="8" rx="2" />
  </svg>
);
const IconUsers = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="9" cy="8" r="3" />
    <path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6" />
  </svg>
);
const IconBag = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 2l1.5 4h9L18 2" />
    <path d="M3.5 6h17l-1.5 12a2 2 0 0 1-2 1.7H7a2 2 0 0 1-2-1.7L3.5 6z" />
  </svg>
);
const IconBox = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 7l9-4 9 4-9 4-9-4z" />
    <path d="M3 7v10l9 4 9-4V7" />
  </svg>
);
const IconWallet = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="6" width="20" height="14" rx="2" />
    <path d="M2 10h20" />
  </svg>
);
const IconMore = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </svg>
);
const IconChevron = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 12, height: 12 }}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

// segment = nombre EXACTO de la carpeta real dentro de src/app/empresas/[id]/
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Comercial",
    icon: IconUsers,
    children: [
      { label: "Clientes", segment: "clientes" },
      { label: "Ventas", segment: "ventas" },
      { label: "Ventas diarias", segment: "ventas-diarias" },
    ],
  },
  {
    label: "Compras",
    icon: IconBag,
    children: [
      { label: "Proveedores", segment: "proveedores" },
      { label: "Solicitudes de pedido", segment: "solicitudes-pedido" },
      { label: "Compras", segment: "compras" },
    ],
  },
  {
    label: "Inventario",
    icon: IconBox,
    children: [
      { label: "Productos", segment: "productos" },
      { label: "Insumos", segment: "insumos" },
      { label: "Locales", segment: "locales" },
      { label: "Mermas", segment: "mermas" },
    ],
  },
  {
    label: "Finanzas",
    icon: IconWallet,
    children: [
      { label: "Caja chica", segment: "caja-chica" },
      { label: "Flujo de caja", segment: "flujo-caja" },
      { label: "Créditos (cuentas por cobrar)", segment: "creditos" },
      { label: "Cuentas por pagar", segment: "cuentas-por-pagar" },
      { label: "Gastos", segment: "gastos" },
      { label: "Préstamos", segment: "prestamos" },
      { label: "Alertas de costo", segment: "alertas-costo" },
      { label: "Estado de resultados", segment: "estado-resultados" },
    ],
  },
  {
    label: "Otros",
    icon: IconMore,
    children: [
      { label: "Actividades", segment: "actividades" },
      { label: "RR.HH.", segment: "rrhh" },
    ],
  },
];

export default function Sidebar({
  collapsed = false,
  userInitials = "A",
  userName = "Administrador",
  userSubtitle = "Cuenta principal",
  // En celular el sidebar deja de ocupar espacio fijo (ahí no entraba: el
  // contenido quedaba aplastado y cortado a los costados — ver
  // src/app/empresas/[id]/layout.tsx) y pasa a ser un panel que se abre
  // encima del contenido (off-canvas). `mobileOpen`/`onCloseMobile` los
  // controla ese layout; en desktop (donde el CSS ya no lo saca de flujo)
  // estas dos props no hacen nada.
  mobileOpen = false,
  onCloseMobile,
}: {
  collapsed?: boolean;
  userInitials?: string;
  userName?: string;
  userSubtitle?: string;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const empresaId = params?.id;
  const base = `/empresas/${empresaId}`;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    NAV_GROUPS.forEach((g) => {
      if (g.children.some((c) => pathname?.startsWith(`${base}/${c.segment}`))) initial[g.label] = true;
    });
    return initial;
  });

  const toggleGroup = (label: string) =>
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  const isActive = (segment: string) => pathname?.startsWith(`${base}/${segment}`);
  const isDashboardActive = pathname === base;

  // Al tocar un link del menú en celular, cierra el panel solo — si no,
  // se quedaría abierto tapando la pantalla nueva.
  useEffect(() => {
    onCloseMobile?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onCloseMobile} />}
      <aside className={`sidebar${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}>
      <div className="sidebar-brand" style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start" }}>
        {!collapsed && "ERP-MYPE"}
        {collapsed && (
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--stamp)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
            EM
          </div>
        )}
      </div>

      <nav style={{ flexGrow: 1, overflowY: "auto" }}>
        <Link
          href={base}
          className={`nav-item${isDashboardActive ? " active" : ""}`}
          style={{ justifyContent: collapsed ? "center" : "flex-start" }}
        >
          {IconGrid}
          {!collapsed && "Dashboard"}
        </Link>

        {NAV_GROUPS.map((group) => {
          const open = !!openGroups[group.label];
          return (
            <div key={group.label}>
              <div
                className="nav-item"
                onClick={() => !collapsed && toggleGroup(group.label)}
                style={{ justifyContent: collapsed ? "center" : "flex-start" }}
              >
                {group.icon}
                {!collapsed && (
                  <>
                    <span style={{ flexGrow: 1 }}>{group.label}</span>
                    <span style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .12s ease" }}>
                      {IconChevron}
                    </span>
                  </>
                )}
              </div>
              {!collapsed &&
                open &&
                group.children.map((child) => (
                  <Link
                    key={child.segment}
                    href={`${base}/${child.segment}`}
                    className={`nav-item child${isActive(child.segment) ? " active" : ""}`}
                  >
                    {child.label}
                  </Link>
                ))}
            </div>
          );
        })}
      </nav>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderTop: "1px solid rgba(255,255,255,0.12)", justifyContent: collapsed ? "center" : "flex-start" }}>
        <div style={{ width: 30, height: 30, borderRadius: 999, background: "var(--stamp-bg)", color: "var(--stamp)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flex: "none" }}>
          {userInitials}
        </div>
        {!collapsed && (
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", whiteSpace: "nowrap" }}>{userName}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", whiteSpace: "nowrap" }}>{userSubtitle}</div>
          </div>
        )}
      </div>
      </aside>
    </>
  );
}
