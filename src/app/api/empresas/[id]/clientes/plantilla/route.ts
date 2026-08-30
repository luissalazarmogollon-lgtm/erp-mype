import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getUsuarioActual, verificarAccesoEmpresa } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/empresas/[id]/clientes/plantilla — genera un Excel para cargar
// clientes en bloque, con la ficha completa (razón social, RUC,
// representante legal, persona de contacto, dirección, teléfonos, rubro,
// redes sociales y logo).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const usuarioActual = await getUsuarioActual();
  if (!usuarioActual) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const empresaId = BigInt(params.id);
  try {
    await verificarAccesoEmpresa(usuarioActual.id, empresaId);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 });
  }

  const encabezados = [
    "nombre_comercial",
    "razon_social",
    "ruc",
    "representante_legal",
    "persona_contacto",
    "direccion",
    "telefono_1",
    "telefono_2",
    "email",
    "rubro",
    "pagina_web",
    "instagram",
    "tiktok",
    "logo_url",
  ];
  const filaEjemplo = [
    "El Fogón",
    "Inversiones El Fogón SAC",
    "20601234567",
    "Juan Pérez Ramírez",
    "María Gómez (administradora)",
    "Av. Los Álamos 123, Surco, Lima",
    "987654321",
    "014567890",
    "contacto@elfogon.pe",
    "Restaurante",
    "https://elfogon.pe",
    "@elfogonpe",
    "@elfogonpe",
    "https://i.imgur.com/abc1234.png",
  ];

  const hojaClientes = XLSX.utils.aoa_to_sheet([encabezados, filaEjemplo]);
  hojaClientes["!cols"] = encabezados.map(() => ({ wch: 22 }));

  const hojaAyuda = XLSX.utils.aoa_to_sheet([
    ["Cómo llenar esta plantilla"],
    [""],
    ["nombre_comercial", "Obligatorio. El nombre por el que conoces al cliente."],
    ["razon_social", "Opcional. Nombre legal completo, si es distinto del comercial."],
    ["ruc", "Opcional. RUC o DNI."],
    ["representante_legal", "Opcional."],
    ["persona_contacto", "Opcional. Quién responde normalmente por este cliente."],
    ["direccion", "Opcional."],
    ["telefono_1 / telefono_2", "Opcionales."],
    ["email", "Opcional."],
    ["rubro", "Opcional. A qué se dedica el cliente (ej. 'Restaurante', 'Estudio contable')."],
    ["pagina_web / instagram / tiktok", "Opcionales. Puedes pegar el link completo o el @usuario."],
    ["logo_url", "Opcional. Sube el logo a Imgur (u otro hosting) y pega aquí el link de la imagen."],
    [""],
    ["Si un cliente con el mismo nombre_comercial ya existe, esta fila actualiza sus datos en vez de duplicarlo."],
  ]);
  hojaAyuda["!cols"] = [{ wch: 34 }, { wch: 70 }];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaClientes, "Clientes");
  XLSX.utils.book_append_sheet(libro, hojaAyuda, "Ayuda");

  const buffer = XLSX.write(libro, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-clientes.xlsx"',
    },
  });
}
