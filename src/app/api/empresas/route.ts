import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeErrorZod } from "@/lib/zodError";
import { prisma } from "@/lib/prisma";
import { getUsuarioActual, requiereSuperadmin } from "@/lib/auth";

// Esta ruta lee sesión/usuario y consulta la base de datos en cada
// petición — no debe pre-generarse durante el build.
export const dynamic = "force-dynamic";

// Módulos que se activan por defecto según las banderas del rubro (RN-012).
// Los módulos que no dependen del rubro (compras, cxc, cxp, caja_bancos, gastos)
// se activan siempre; el resto depende de si el negocio maneja inventario/recetas.
const MODULOS_SIEMPRE_ACTIVOS = [
  "compras",
  "cxc",
  "cxp",
  "caja_bancos",
  "gastos",
  "activos_fijos",
  "prestamos_bancarios",
];

const altaEmpresaSchema = z.object({
  razonSocial: z.string().min(3, "La razón social es obligatoria"),
  nombreComercial: z.string().min(2, "El nombre comercial es obligatorio"),
  ruc: z.string().length(11).optional().or(z.literal("")),
  logoUrl: z.string().url().optional().or(z.literal("")),
  tipoNegocioId: z.number().int(),
  rubroId: z.number().int(),
  monedaOperacion: z.enum(["PEN", "USD"]),
  aplicaIgv: z.boolean(),
  tasaIgv: z.number().min(0).max(100).default(18.0),
  regimenTributario: z.enum(["NUEVO_RUS", "RER", "RMT", "GENERAL"]).optional(),
  capitalSocialInicial: z.number().min(0).default(0),
  asesorPrincipalId: z.string().uuid().optional(),
});

// POST /api/empresas — Alta de nueva empresa (HU-01, sección 0 de reglas_negocio_erp_mype.md)
// Solo el superadmin de plataforma puede ejecutar este flujo (RN-004).
export async function POST(request: Request) {
  const usuarioActual = await getUsuarioActual();

  try {
    requiereSuperadmin(usuarioActual);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const body = await request.json();
  const parsed = altaEmpresaSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: mensajeErrorZod(parsed.error) }, { status: 400 });
  }

  const datos = parsed.data;

  // RN-010: no se puede crear sin moneda, IGV, tipo de negocio y rubro —
  // ya garantizado por el schema de zod (campos requeridos).

  const rubro = await prisma.rubro.findUnique({ where: { id: datos.rubroId } });
  if (!rubro) {
    return NextResponse.json({ error: "El rubro seleccionado no existe" }, { status: 400 });
  }

  // Toda la creación ocurre en una transacción: si algo falla, no queda
  // una empresa a medio configurar (sin catálogos o sin módulos activos).
  const empresa = await prisma.$transaction(async (tx) => {
    const nuevaEmpresa = await tx.empresa.create({
      data: {
        razonSocial: datos.razonSocial,
        nombreComercial: datos.nombreComercial,
        ruc: datos.ruc || null,
        logoUrl: datos.logoUrl || null,
        tipoNegocioId: datos.tipoNegocioId,
        rubroId: datos.rubroId,
        monedaOperacion: datos.monedaOperacion,
        aplicaIgv: datos.aplicaIgv,
        tasaIgv: datos.tasaIgv,
        regimenTributario: datos.regimenTributario,
        capitalSocialInicial: datos.capitalSocialInicial,
        asesorPrincipalId: datos.asesorPrincipalId,
      },
    });

    // RN-012: pre-activar módulos según las banderas del rubro.
    const modulosAActivar = new Set(MODULOS_SIEMPRE_ACTIVOS);
    if (rubro.requiereInventario) modulosAActivar.add("inventario_insumos");
    if (rubro.requiereFichasTecnicas) modulosAActivar.add("fichas_tecnicas");
    modulosAActivar.add("planilla"); // siempre disponible; el cliente decide si lo usa

    await tx.empresaModulo.createMany({
      data: Array.from(modulosAActivar).map((modulo) => ({
        empresaId: nuevaEmpresa.id,
        modulo,
        activo: true,
      })),
    });

    // RN-011: clonar catálogos semilla del rubro hacia los catálogos propios
    // de la empresa recién creada.
    const plantillas = await tx.rubroPlantillaCatalogo.findMany({
      where: { rubroId: datos.rubroId },
    });

    const categoriasInsumo = plantillas.filter((p) => p.tipoCatalogo === "categoria_insumo");
    if (categoriasInsumo.length > 0) {
      await tx.categoriaInsumo.createMany({
        data: categoriasInsumo.map((p) => ({ empresaId: nuevaEmpresa.id, nombre: p.nombreItem })),
      });
    }

    const categoriasProducto = plantillas.filter((p) => p.tipoCatalogo === "categoria_producto");
    if (categoriasProducto.length > 0) {
      await tx.categoriaProducto.createMany({
        data: categoriasProducto.map((p) => ({ empresaId: nuevaEmpresa.id, nombre: p.nombreItem })),
      });
    }

    const tiposGasto = plantillas.filter((p) => p.tipoCatalogo === "tipo_gasto");
    if (tiposGasto.length > 0) {
      await tx.tipoGasto.createMany({
        data: tiposGasto.map((p) => ({ empresaId: nuevaEmpresa.id, nombre: p.nombreItem })),
      });
    }

    const unidadesMedida = plantillas.filter((p) => p.tipoCatalogo === "unidad_medida");
    if (unidadesMedida.length > 0) {
      await tx.unidadMedida.createMany({
        data: unidadesMedida.map((p) => ({
          empresaId: nuevaEmpresa.id,
          nombre: p.nombreItem,
          abreviatura: p.nombreItem.slice(0, 6),
        })),
      });
    }

    // Métodos de pago: set estándar igual para toda empresa, no depende
    // del rubro (sección 3 de la arquitectura).
    await tx.metodoPago.createMany({
      data: ["Efectivo", "Yape/Plin", "Tarjeta", "Transferencia"].map((nombre) => ({
        empresaId: nuevaEmpresa.id,
        nombre,
      })),
    });

    // RN-014: si hay capital social inicial, se registrará el asiento contable
    // de apertura cuando el motor contable (Sprint 6) esté implementado.
    // Por ahora queda guardado en empresa.capitalSocialInicial como fuente de verdad.

    // Auditoría de la creación (RN-005).
    await tx.auditoria.create({
      data: {
        usuarioId: usuarioActual!.id,
        empresaId: nuevaEmpresa.id,
        tablaAfectada: "empresas",
        registroId: nuevaEmpresa.id,
        accion: "crear",
        valorNuevo: JSON.parse(
          JSON.stringify({ ...nuevaEmpresa, id: nuevaEmpresa.id.toString() })
        ),
      },
    });

    return nuevaEmpresa;
  });

  return NextResponse.json(
    { ...empresa, id: empresa.id.toString() },
    { status: 201 }
  );
}

// GET /api/empresas — lista las empresas visibles para el usuario actual (HU-03).
export async function GET() {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const empresas = usuarioActual.esSuperadminPlataforma
    ? await prisma.empresa.findMany({ where: { estado: "activo" } })
    : usuarioActual.asignaciones.map((a) => a.empresa);

  return NextResponse.json(
    empresas.map((e) => ({ ...e, id: e.id.toString() }))
  );
}
