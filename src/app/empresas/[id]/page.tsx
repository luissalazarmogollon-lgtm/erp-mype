import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InvitarUsuarioForm } from "@/components/ui/InvitarUsuarioForm";
import { EliminarEmpresaButton } from "@/components/ui/EliminarEmpresaButton";
import { EquipoAsignado } from "@/components/ui/EquipoAsignado";

// Pantalla de detalle de una empresa. Muestra los accesos directos al
// registro y control financiero — solo los módulos a los que el usuario
// actual tiene permiso (acceso total, o esa clave en su lista de
// permisos) — y la gestión del equipo asignado a esta empresa (HU-02).
export default async function EmpresaDetallePage({ params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) redirect("/login");

  const empresaId = BigInt(params.id);

  let acceso: Awaited<ReturnType<typeof verificarAccesoEmpresa>>;
  try {
    acceso = await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch {
    notFound();
  }

  const puedeVer = (modulo: string) => acceso.accesoTotal || acceso.permisos?.includes(modulo);

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    include: { rubro: true, tipoNegocio: true },
  });
  if (!empresa) notFound();

  const equipo = await prisma.usuarioEmpresa.findMany({
    where: { empresaId, estado: "activo" },
    include: { usuario: true, rolOperativo: true },
    orderBy: { fechaAsignacion: "asc" },
  });

  const ACCESOS_DIRECTOS = [
    { modulo: "estado_resultados", href: "estado-resultados", label: "Estado de Resultados", primario: true },
    { modulo: "flujo_caja", href: "flujo-caja", label: "Flujo de Caja" },
    { modulo: "ventas_diarias", href: "ventas-diarias", label: "Ventas diarias" },
    { modulo: "gastos", href: "gastos", label: "Gastos y Costos" },
    { modulo: "creditos", href: "creditos", label: "Créditos (CxC)" },
    { modulo: "cuentas_por_pagar", href: "cuentas-por-pagar", label: "Cuentas por pagar" },
    { modulo: "rrhh", href: "rrhh", label: "RRHH" },
    { modulo: "locales", href: "locales", label: "Locales" },
  ];

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href="/dashboard" style={{ color: "inherit" }}>
          Tus empresas
        </Link>{" "}
        → <b>{empresa.nombreComercial}</b>
      </p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <h1 style={{ fontSize: 26, marginBottom: 6 }}>{empresa.nombreComercial}</h1>
        {usuarioActual.esSuperadminPlataforma && (
          <EliminarEmpresaButton empresaId={params.id} nombreComercial={empresa.nombreComercial} />
        )}
      </div>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 28 }}>
        {empresa.rubro.nombre} · {empresa.tipoNegocio.nombre} · {empresa.monedaOperacion} ·{" "}
        {empresa.aplicaIgv ? `IGV ${empresa.tasaIgv}%` : "Sin IGV"}
      </p>

      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {ACCESOS_DIRECTOS.filter((a) => puedeVer(a.modulo)).map((a) => (
            <Link
              key={a.href}
              href={`/empresas/${params.id}/${a.href}`}
              className={a.primario ? "btn-primary" : "btn-ghost"}
              style={{ textDecoration: "none" }}
            >
              {a.label}
            </Link>
          ))}
        </div>
        {ACCESOS_DIRECTOS.filter((a) => puedeVer(a.modulo)).length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>
            No tienes acceso a ningún módulo de esta empresa todavía. Pídele al superadmin que te lo asigne.
          </p>
        )}
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Equipo asignado</h2>
      {usuarioActual.esSuperadminPlataforma && <InvitarUsuarioForm empresaId={params.id} />}

      <EquipoAsignado
        empresaId={params.id}
        puedeEditar={usuarioActual.esSuperadminPlataforma}
        equipoInicial={equipo.map((a) => ({
          asignacionId: a.id.toString(),
          usuarioId: a.usuario.id,
          nombres: a.usuario.nombres,
          apellidos: a.usuario.apellidos,
          email: a.usuario.email,
          tipoActor: a.tipoActor,
          rolOperativo: a.rolOperativo.nombre,
          accesoTotal: a.accesoTotal,
          permisos: (a.permisos as unknown as string[] | null) ?? [],
        }))}
      />
    </main>
  );
}
