import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MODULOS_SOLO_PRODUCTOS, MODULOS_SOLO_SERVICIOS, esEmpresaDeServicios, type ModuloKey } from "@/lib/permisosModulo";
import { InvitarUsuarioForm } from "@/components/ui/InvitarUsuarioForm";
import { EliminarEmpresaButton } from "@/components/ui/EliminarEmpresaButton";
import { VaciarDatosButton } from "@/components/ui/VaciarDatosButton";
import { EquipoAsignado } from "@/components/ui/EquipoAsignado";
import { CambiarTipoNegocio } from "@/components/ui/CambiarTipoNegocio";

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

  const tiposNegocio = await prisma.tipoNegocio.findMany({ orderBy: { id: "asc" } });

  const esServicios = esEmpresaDeServicios(empresa.tipoNegocio.nombre);
  // Una empresa de Servicios no maneja inventario: estos accesos directos
  // no aplican a su modelo de negocio y se ocultan del panel (además del
  // bloqueo a nivel de API en verificarAccesoEmpresa/verificarAccesoAlguno).
  const esSoloDeProductos = (modulos: string[]) => modulos.every((m) => MODULOS_SOLO_PRODUCTOS.includes(m as ModuloKey));
  // Simétrico: una empresa de Productos no ve accesos exclusivos de
  // Servicios (ej. Gestión de Actividades).
  const esSoloDeServicios = (modulos: string[]) => modulos.every((m) => MODULOS_SOLO_SERVICIOS.includes(m as ModuloKey));
  const seOculta = (modulos: string[]) => (esServicios && esSoloDeProductos(modulos)) || (!esServicios && esSoloDeServicios(modulos));

  const puedeVerAlguno = (modulos: string[]) => modulos.some((m) => puedeVer(m));

  const ACCESOS_DIRECTOS: { modulos: string[]; href: string; label: string; primario?: boolean }[] = [
    { modulos: ["estado_resultados"], href: "estado-resultados", label: "Estado de Resultados", primario: true },
    { modulos: ["flujo_caja"], href: "flujo-caja", label: "Flujo de Caja" },
    { modulos: ["ventas_diarias"], href: "ventas-diarias", label: esServicios ? "Facturación" : "Ventas diarias" },
    { modulos: ["ventas_pos"], href: "ventas", label: "Ventas (POS)" },
    { modulos: ["productos"], href: "productos", label: "Productos" },
    { modulos: ["insumos"], href: "insumos", label: "Insumos" },
    { modulos: ["mermas"], href: "mermas", label: "Mermas" },
    { modulos: ["gastos"], href: "gastos", label: "Gastos y Costos" },
    { modulos: ["creditos"], href: "creditos", label: esServicios ? "Cuentas por Cobrar" : "Créditos (CxC)" },
    { modulos: ["ventas_pos", "ventas_diarias", "creditos"], href: "clientes", label: "Clientes" },
    { modulos: ["cuentas_por_pagar", "cuentas_por_pagar_registrar"], href: "cuentas-por-pagar", label: "Cuentas por pagar" },
    { modulos: ["rrhh"], href: "rrhh", label: "RRHH" },
    { modulos: ["caja_chica"], href: "caja-chica", label: "Caja Chica" },
    { modulos: ["locales"], href: "locales", label: "Locales" },
    {
      modulos: ["solicitudes_pedido", "aprobar_solicitudes_pedido", "despachar_solicitudes_pedido"],
      href: "solicitudes-pedido",
      label: "Solicitudes de Pedido",
    },
    { modulos: ["compras"], href: "compras", label: "Compras" },
    { modulos: ["compras"], href: "proveedores", label: "Proveedores" },
    { modulos: ["actividades", "actividades_propias"], href: "actividades", label: "Gestión de Actividades" },
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
          <div style={{ display: "flex", gap: 10 }}>
            <VaciarDatosButton empresaId={params.id} nombreComercial={empresa.nombreComercial} />
            <EliminarEmpresaButton empresaId={params.id} nombreComercial={empresa.nombreComercial} />
          </div>
        )}
      </div>
      {/* La ficha técnica (rubro, tipo de negocio, moneda, IGV) es
          información de configuración del negocio — sin utilidad para
          alguien con acceso recortado (ej. auto-servicio de Actividades),
          así que solo se muestra a quien tiene acceso completo. */}
      {acceso.accesoTotal && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
          <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>
            {empresa.rubro.nombre} · {empresa.tipoNegocio.nombre} · {empresa.monedaOperacion} ·{" "}
            {empresa.aplicaIgv ? `IGV ${empresa.tasaIgv}%` : "Sin IGV"}
          </p>
          {usuarioActual.esSuperadminPlataforma && (
            <CambiarTipoNegocio
              empresaId={params.id}
              tipoNegocioActualId={empresa.tipoNegocioId}
              tiposNegocio={tiposNegocio.map((t) => ({ id: t.id, nombre: t.nombre }))}
            />
          )}
        </div>
      )}

      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {ACCESOS_DIRECTOS.filter(
            (a) => puedeVerAlguno(a.modulos) && !seOculta(a.modulos)
          ).map((a) => (
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
        {ACCESOS_DIRECTOS.filter(
            (a) => puedeVerAlguno(a.modulos) && !seOculta(a.modulos)
          ).length === 0 && (
          <p style={{ color: "var(--ink-soft)", fontSize: 13 }}>
            No tienes acceso a ningún módulo de esta empresa todavía. Pídele al superadmin que te lo asigne.
          </p>
        )}
        {esServicios && acceso.accesoTotal && (
          <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 10 }}>
            Esta empresa es de tipo Servicios: Insumos, Mermas, Productos y recetas, Ventas por producto (POS),
            Compras, Proveedores y Solicitudes de Pedido están ocultos porque no maneja inventario. En su lugar
            factura a sus clientes desde "Facturación", que registra directamente en Cuentas por Cobrar.
          </p>
        )}
      </div>

      {/* "Equipo asignado" expone correos y niveles de acceso de TODAS las
          personas asignadas a esta empresa — es información de gestión, no
          algo que deba ver cualquier asesor/asistente con acceso recortado
          (ej. alguien con solo "actividades_propias"), ni un cliente. Se
          exige accesoTotal además de no ser "cliente" — antes solo se
          exigía el tipoActor, así que un asesor con permisos limitados
          también la veía. */}
      {acceso.tipoActor !== "cliente" && acceso.accesoTotal && (
        <>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Equipo asignado</h2>
          {usuarioActual.esSuperadminPlataforma && <InvitarUsuarioForm empresaId={params.id} esServicios={esServicios} />}

          <EquipoAsignado
            empresaId={params.id}
            puedeEditar={usuarioActual.esSuperadminPlataforma}
            esServicios={esServicios}
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
        </>
      )}
    </main>
  );
}
