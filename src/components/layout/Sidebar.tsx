"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { MODULOS_SOLO_PRODUCTOS, MODULOS_SOLO_SERVICIOS, type ModuloKey } from "@/lib/permisosModulo";

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
 * SEGREGACIÓN DE FUNCIONES: cada link lleva la lista de `modulos` (claves
 * de permisosModulo.ts) que dan acceso a esa pantalla — el MISMO criterio
 * que ya usa el panel de la empresa (ACCESOS_DIRECTOS en
 * src/app/empresas/[id]/page.tsx) para decidir qué accesos directos
 * mostrar, para que ambos lugares coincidan siempre. El componente pide
 * `/api/empresas/[id]/mi-acceso` y oculta: (a) cualquier link cuyos
 * módulos no calcen con los permisos de la persona (salvo accesoTotal o
 * superadmin de plataforma, que ven todo), y (b) un GRUPO completo si,
 * después de ese filtro, no le queda ningún link adentro — así nunca se ve
 * un grupo vacío ("Finanzas" sin nada debajo). Antes el menú mostraba
 * TODO a cualquiera; si la persona entraba a un módulo sin permiso, la
 * pantalla igual intentaba cargar datos que la API le negaba (403) y
 * varias de esas pantallas no manejaban ese caso — de ahí el
 * "Application error: a client-side exception" que se reportó. Ocultar el
 * link evita que la persona llegue ahí desde el menú.
 */

type NavLink = { label: string; segment: string; modulos: ModuloKey[] };
type NavGroup = { label: string; icon: JSX.Element; children: NavLink[] };

type MiAcceso = {
  esSuperadminPlataforma: boolean;
  accesoTotal: boolean;
  permisos: string[];
  esServicios: boolean;
};

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
// modulos = las mismas claves que ACCESOS_DIRECTOS usa en
// src/app/empresas/[id]/page.tsx para esa misma pantalla — si agregas o
// cambias una pantalla ahí, refleja el mismo cambio aquí.
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Comercial",
    icon: IconUsers,
    children: [
      { label: "Clientes", segment: "clientes", modulos: ["ventas_pos", "ventas_diarias", "creditos"] },
      { label: "Ventas", segment: "ventas", modulos: ["ventas_pos"] },
      { label: "Ventas diarias", segment: "ventas-diarias", modulos: ["ventas_diarias"] },
    ],
  },
  {
    label: "Compras",
    icon: IconBag,
    children: [
      { label: "Proveedores", segment: "proveedores", modulos: ["compras"] },
      {
        label: "Solicitudes de pedido",
        segment: "solicitudes-pedido",
        modulos: [
          "solicitudes_pedido",
          "aprobar_solicitudes_pedido",
          "despachar_solicitudes_pedido",
          "aprobar_solicitudes_almacen",
        ],
      },
      { label: "Compras", segment: "compras", modulos: ["compras", "recepcionar_compras_almacen"] },
    ],
  },
  {
    label: "Inventario",
    icon: IconBox,
    children: [
      { label: "Productos", segment: "productos", modulos: ["productos"] },
      { label: "Insumos", segment: "insumos", modulos: ["insumos"] },
      { label: "Locales", segment: "locales", modulos: ["locales"] },
      { label: "Mermas", segment: "mermas", modulos: ["mermas"] },
    ],
  },
  {
    label: "Finanzas",
    icon: IconWallet,
    children: [
      { label: "Caja chica", segment: "caja-chica", modulos: ["caja_chica"] },
      { label: "Flujo de caja", segment: "flujo-caja", modulos: ["flujo_caja"] },
      { label: "Créditos (cuentas por cobrar)", segment: "creditos", modulos: ["creditos"] },
      {
        label: "Cuentas por pagar",
        segment: "cuentas-por-pagar",
        modulos: ["cuentas_por_pagar", "cuentas_por_pagar_registrar"],
      },
      { label: "Gastos", segment: "gastos", modulos: ["gastos"] },
      { label: "Préstamos", segment: "prestamos", modulos: ["prestamos"] },
      // Alertas de costo no tiene un permiso propio — usa "compras", igual
      // que en ACCESOS_DIRECTOS (empresas/[id]/page.tsx no la lista como
      // acceso directo, pero la API de alertas-costo exige ese permiso).
      { label: "Alertas de costo", segment: "alertas-costo", modulos: ["compras"] },
      { label: "Estado de resultados", segment: "estado-resultados", modulos: ["estado_resultados"] },
    ],
  },
  {
    label: "Otros",
    icon: IconMore,
    children: [
      { label: "Actividades", segment: "actividades", modulos: ["actividades", "actividades_propias"] },
      { label: "RR.HH.", segment: "rrhh", modulos: ["rrhh"] },
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

  // Segregación de funciones: qué puede ver esta persona EN ESTA empresa.
  // null mientras carga — durante ese instante no se muestra ningún grupo
  // (mejor un menú vacío por medio segundo que mostrar de más y corregir).
  const [acceso, setAcceso] = useState<MiAcceso | null>(null);

  useEffect(() => {
    if (!empresaId) return;
    let cancelado = false;
    fetch(`/api/empresas/${empresaId}/mi-acceso`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelado || !data) return;
        setAcceso({
          esSuperadminPlataforma: Boolean(data.esSuperadminPlataforma),
          accesoTotal: Boolean(data.accesoTotal),
          permisos: (data.permisos as string[] | null) ?? [],
          esServicios: Boolean(data.esServicios),
        });
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [empresaId]);

  // Ve todo sin filtrar: el superadmin de plataforma, o quien tenga
  // "acceso total" asignado EN ESTA empresa (el "super usuario" de esa
  // empresa) — ver src/lib/auth.ts.
  const veTodo = !!(acceso?.esSuperadminPlataforma || acceso?.accesoTotal);

  // Un link exclusivo de un tipo de negocio (ver MODULOS_SOLO_PRODUCTOS /
  // MODULOS_SOLO_SERVICIOS) no aplica al tipo de ESTA empresa — mismo
  // criterio que ya usa el panel de la empresa (seOculta).
  function aplicaAlTipoDeNegocio(modulos: ModuloKey[]): boolean {
    if (!acceso) return false;
    const esSoloProductos = modulos.every((m) => (MODULOS_SOLO_PRODUCTOS as string[]).includes(m));
    const esSoloServicios = modulos.every((m) => (MODULOS_SOLO_SERVICIOS as string[]).includes(m));
    if (acceso.esServicios && esSoloProductos) return false;
    if (!acceso.esServicios && esSoloServicios) return false;
    return true;
  }

  function tienePermiso(modulos: ModuloKey[]): boolean {
    if (!acceso) return false;
    if (veTodo) return true;
    return modulos.some((m) => acceso.permisos.includes(m));
  }

  // El menú final: cada grupo, con solo los links a los que la persona
  // tiene acceso — y el grupo entero desaparece si no le queda ninguno
  // (ej. alguien de Cocina/Almacén sin ningún permiso de Finanzas no debe
  // ver un grupo "Finanzas" vacío).
  const gruposVisibles = NAV_GROUPS.map((grupo) => ({
    ...grupo,
    children: grupo.children.filter((c) => aplicaAlTipoDeNegocio(c.modulos) && tienePermiso(c.modulos)),
  })).filter((grupo) => grupo.children.length > 0);

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

        {acceso === null && !collapsed && (
          <p className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", padding: "10px 12px" }}>
            Cargando menú…
          </p>
        )}

        {gruposVisibles.map((group) => {
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
