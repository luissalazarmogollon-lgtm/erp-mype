import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InvitarUsuarioForm } from "@/components/ui/InvitarUsuarioForm";
import { EliminarEmpresaButton } from "@/components/ui/EliminarEmpresaButton";
import { EquipoAsignado } from "@/components/ui/EquipoAsignado";

// Pantalla de detalle de una empresa. Muestra los accesos directos al
// registro y control financiero (lo que se usa día a día) y la gestión
// del equipo asignado a esta empresa (HU-02).
export default async function EmpresaDetallePage({ params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) redirect("/login");

  const empresaId = BigInt(params.id);

  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch {
    notFound();
  }

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
          <Link href={`/empresas/${params.id}/estado-resultados`} className="btn-primary" style={{ textDecoration: "none" }}>
            Estado de Resultados
          </Link>
          <Link href={`/empresas/${params.id}/ventas-diarias`} className="btn-ghost" style={{ textDecoration: "none" }}>
            Ventas diarias
          </Link>
          <Link href={`/empresas/${params.id}/gastos`} className="btn-ghost" style={{ textDecoration: "none" }}>
            Gastos y Costos
          </Link>
          <Link href={`/empresas/${params.id}/creditos`} className="btn-ghost" style={{ textDecoration: "none" }}>
            Créditos (CxC)
          </Link>
          <Link href={`/empresas/${params.id}/cuentas-por-pagar`} className="btn-ghost" style={{ textDecoration: "none" }}>
            Cuentas por pagar
          </Link>
          <Link href={`/empresas/${params.id}/locales`} className="btn-ghost" style={{ textDecoration: "none" }}>
            Locales
          </Link>
        </div>
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Equipo asignado</h2>
      <InvitarUsuarioForm empresaId={params.id} />

      <EquipoAsignado
        empresaId={params.id}
        equipoInicial={equipo.map((a) => ({
          asignacionId: a.id.toString(),
          usuarioId: a.usuario.id,
          nombres: a.usuario.nombres,
          apellidos: a.usuario.apellidos,
          email: a.usuario.email,
          tipoActor: a.tipoActor,
          rolOperativo: a.rolOperativo.nombre,
        }))}
      />
    </main>
  );
}
