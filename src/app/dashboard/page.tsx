import { redirect } from "next/navigation";
import Link from "next/link";
import { getUsuarioActual, getEmpresasVisibles } from "@/lib/auth";
import { LogoutButton } from "@/components/ui/LogoutButton";

// Selector de empresa activa (HU-03). Un Asesor/Asistente ve aquí solo
// las empresas donde tiene una fila activa en usuario_empresa (RN-001);
// el superadmin ve todas.
export default async function DashboardPage() {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");

  const empresas = await getEmpresasVisibles(usuario.id);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24 }}>Tus empresas</h1>
          <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            {usuario.nombres} {usuario.apellidos} ·{" "}
            {usuario.esSuperadminPlataforma ? "Superadmin" : usuario.tipoActorBase}
          </p>
        </div>
        <LogoutButton />
      </div>

      {usuario.esSuperadminPlataforma && (
        <div style={{ margin: "24px 0" }}>
          <Link href="/onboarding/empresa" className="btn-primary" style={{ textDecoration: "none" }}>
            + Dar de alta nueva empresa
          </Link>
        </div>
      )}

      {empresas.length === 0 ? (
        <div className="card" style={{ marginTop: 24 }}>
          <p>Todavía no tienes empresas asignadas. Pídele al superadmin que te asigne una.</p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 16,
            marginTop: 24,
          }}
        >
          {empresas.map((empresa) => (
            <Link
              key={empresa.id.toString()}
              href={`/empresas/${empresa.id}`}
              className="card"
              style={{ textDecoration: "none", color: "var(--ink)", display: "block" }}
            >
              <h3 style={{ fontSize: 16, marginBottom: 6 }}>{empresa.nombreComercial}</h3>
              <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                {empresa.monedaOperacion} · {empresa.aplicaIgv ? `IGV ${empresa.tasaIgv}%` : "Sin IGV"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
