import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InvitarUsuarioForm } from "@/components/ui/InvitarUsuarioForm";

// Pantalla de detalle de una empresa (HU-02 y verificación visual de RN-011).
// Por ahora muestra: datos generales, equipo asignado (usuario_empresa) y
// un resumen de los catálogos clonados desde el rubro. Los módulos
// operativos (Ventas, Inventario, Caja...) llegan en los próximos sprints
// como nuevas secciones/pestañas de esta misma pantalla.
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
    include: { rubro: true, tipoNegocio: true, modulos: { where: { activo: true } } },
  });
  if (!empresa) notFound();

  const [equipo, categoriasInsumo, categoriasProducto, tiposGasto, metodosPago] = await Promise.all([
    prisma.usuarioEmpresa.findMany({
      where: { empresaId, estado: "activo" },
      include: { usuario: true, rolOperativo: true },
      orderBy: { fechaAsignacion: "asc" },
    }),
    prisma.categoriaInsumo.findMany({ where: { empresaId } }),
    prisma.categoriaProducto.findMany({ where: { empresaId } }),
    prisma.tipoGasto.findMany({ where: { empresaId } }),
    prisma.metodoPago.findMany({ where: { empresaId } }),
  ]);

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href="/dashboard" style={{ color: "inherit" }}>
          Tus empresas
        </Link>{" "}
        → <b>{empresa.nombreComercial}</b>
      </p>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>{empresa.nombreComercial}</h1>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 28 }}>
        {empresa.rubro.nombre} · {empresa.tipoNegocio.nombre} · {empresa.monedaOperacion} ·{" "}
        {empresa.aplicaIgv ? `IGV ${empresa.tasaIgv}%` : "Sin IGV"}
      </p>

      <div className="card" style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>Módulos activos</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {empresa.modulos.map((m) => (
            <span
              key={m.id.toString()}
              className="mono"
              style={{
                fontSize: 11,
                padding: "4px 10px",
                background: "var(--teal-bg, #dceae6)",
                color: "var(--teal, #20554e)",
                borderRadius: 20,
              }}
            >
              {m.modulo}
            </span>
          ))}
        </div>
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Equipo asignado</h2>
      <InvitarUsuarioForm empresaId={params.id} />

      <div style={{ marginTop: 16, marginBottom: 32 }}>
        {equipo.length === 0 ? (
          <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
            Todavía no hay nadie asignado a esta empresa además de ti.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            {equipo.map((a) => (
              <div
                key={a.id.toString()}
                className="card"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 14 }}
              >
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500 }}>
                    {a.usuario.nombres} {a.usuario.apellidos}
                  </p>
                  <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                    {a.usuario.email}
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p className="mono" style={{ fontSize: 11, textTransform: "capitalize" }}>
                    {a.tipoActor}
                  </p>
                  <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                    {a.rolOperativo.nombre}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Catálogos (clonados desde el rubro)</h2>
      <div className="card">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 6 }}>
              CATEGORÍAS DE INSUMO
            </p>
            {categoriasInsumo.map((c) => (
              <p key={c.id.toString()} style={{ fontSize: 13 }}>
                {c.nombre}
              </p>
            ))}
          </div>
          <div>
            <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 6 }}>
              CATEGORÍAS DE PRODUCTO
            </p>
            {categoriasProducto.map((c) => (
              <p key={c.id.toString()} style={{ fontSize: 13 }}>
                {c.nombre}
              </p>
            ))}
          </div>
          <div>
            <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 6 }}>
              TIPOS DE GASTO
            </p>
            {tiposGasto.map((c) => (
              <p key={c.id.toString()} style={{ fontSize: 13 }}>
                {c.nombre}
              </p>
            ))}
          </div>
          <div>
            <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: 6 }}>
              MÉTODOS DE PAGO
            </p>
            {metodosPago.map((c) => (
              <p key={c.id.toString()} style={{ fontSize: 13 }}>
                {c.nombre}
              </p>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
