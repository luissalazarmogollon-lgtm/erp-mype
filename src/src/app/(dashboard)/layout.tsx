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
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar />
      <div style={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}
