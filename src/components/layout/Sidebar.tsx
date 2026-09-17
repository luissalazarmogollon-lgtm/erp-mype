"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/**
 * Sidebar compartido de erp-mype.
 *
 * Cómo integrarlo:
 * 1. Copia este archivo a, por ejemplo, src/components/layout/Sidebar.tsx
 *    (ajusta la ruta de imports si tu alias "@/..." es distinto).
 * 2. Reemplaza los `href` de NAV_GROUPS por las rutas reales de tus
 *    páginas (hoy son un placeholder razonable según los módulos que
 *    ya definimos: Compras, Inventario, Finanzas...).
 * 3. Úsalo desde tu layout compartido (ver layout.tsx de este mismo
 *    paquete de archivos).
 *
 * No toca tu lógica de permisos: si ya filtras el menú por
 * `UsuarioEmpresa.permisos`, hazlo ANTES de pasar la lista de grupos
 * a este componente (o filtra NAV_GROUPS donde lo importes), este
 * componente solo se encarga de pintar y resaltar la ruta activa.
 */

type NavLink = { label: string; href: string };
type NavGroup = { label: string; icon: JSX.Element; href?: string; children?: NavLink[] };

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
const IconChevron = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 12, height: 12 }}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

const NAV_GROUPS: NavGroup[] = [
  { label: "Dashboard", icon: IconGrid, href: "/dashboard" },
  {
    label: "Comercial",
    icon: IconUsers,
    children: [
      { label: "Clientes", href: "/comercial/clientes" },
      { label: "Cotizaciones", href: "/comercial/cotizaciones" },
      { label: "Pedidos", href: "/comercial/pedidos" },
    ],
  },
  {
    label: "Compras",
    icon: IconBag,
    children: [
      { label: "Proveedores", href: "/compras/proveedores" },
      { label: "Solicitudes", href: "/compras/solicitudes" },
      { label: "Órdenes de compra", href: "/compras/ordenes" },
      { label: "Compras", href: "/compras" },
    ],
  },
  {
    label: "Inventario",
    icon: IconBox,
    children: [
      { label: "Productos", href: "/inventario/productos" },
      { label: "Almacenes", href: "/inventario/almacenes" },
      { label: "Movimientos", href: "/inventario/movimientos" },
      { label: "Kardex", href: "/inventario/kardex" },
    ],
  },
  {
    label: "Finanzas",
    icon: IconWallet,
    children: [
      { label: "Caja", href: "/finanzas/caja" },
      { label: "Bancos", href: "/finanzas/bancos" },
      { label: "Cuentas por cobrar", href: "/finanzas/cuentas-por-cobrar" },
      { label: "Cuentas por pagar", href: "/finanzas/cuentas-por-pagar" },
      { label: "Ingresos", href: "/finanzas/ingresos" },
      { label: "Gastos", href: "/finanzas/gastos" },
    ],
  },
];

const FLAT_ITEMS: NavLink[] = [
  { label: "Contabilidad", href: "/contabilidad" },
  { label: "RR.HH.", href: "/rrhh" },
  { label: "Reportes", href: "/reportes" },
  { label: "Configuración", href: "/configuracion" },
];

export default function Sidebar({
  collapsed = false,
  userInitials = "A",
  userName = "Administrador",
  userSubtitle = "Cuenta principal",
}: {
  collapsed?: boolean;
  userInitials?: string;
  userName?: string;
  userSubtitle?: string;
}) {
  const pathname = usePathname();

  // Grupo(s) abierto(s) por defecto: el que contiene la ruta activa.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    NAV_GROUPS.forEach((g) => {
      if (g.children?.some((c) => pathname?.startsWith(c.href))) initial[g.label] = true;
    });
    return initial;
  });

  const toggleGroup = (label: string) =>
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + "/");

  return (
    <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-brand" style={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start" }}>
        {!collapsed && "ERP-MYPE"}
        {collapsed && (
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--primary)", color: "var(--on-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>
            EM
          </div>
        )}
      </div>

      <nav style={{ flexGrow: 1, overflowY: "auto" }}>
        {NAV_GROUPS.map((group) => {
          if (!group.children) {
            // Ítem simple (p.ej. Dashboard)
            return (
              <Link
                key={group.label}
                href={group.href!}
                className={`nav-item${isActive(group.href!) ? " active" : ""}`}
                style={{ justifyContent: collapsed ? "center" : "flex-start" }}
              >
                {group.icon}
                {!collapsed && group.label}
              </Link>
            );
          }

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
                    key={child.href}
                    href={child.href}
                    className={`nav-item child${isActive(child.href) ? " active" : ""}`}
                  >
                    {child.label}
                  </Link>
                ))}
            </div>
          );
        })}

        <div style={{ borderTop: "1px solid var(--sidebar-border)", margin: "8px 6px" }} />

        {FLAT_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item${isActive(item.href) ? " active" : ""}`}
            style={{ justifyContent: collapsed ? "center" : "flex-start" }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderTop: "1px solid var(--sidebar-border)", justifyContent: collapsed ? "center" : "flex-start" }}>
        <div style={{ width: 30, height: 30, borderRadius: 999, background: "var(--primary-bg)", color: "var(--primary-hover)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flex: "none" }}>
          {userInitials}
        </div>
        {!collapsed && (
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--on-primary)", whiteSpace: "nowrap" }}>{userName}</div>
            <div style={{ fontSize: 11, color: "var(--sidebar-ink-muted)", whiteSpace: "nowrap" }}>{userSubtitle}</div>
          </div>
        )}
      </div>
    </aside>
  );
}
