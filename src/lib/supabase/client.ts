import { createBrowserClient } from "@supabase/ssr";

// Cliente Supabase para usar en componentes de cliente ("use client").
// Solo maneja autenticación (login/logout/sesión) — el resto de los datos
// (empresas, ventas, etc.) se leen/escriben vía nuestras API routes con Prisma,
// nunca directo desde el navegador, para mantener el control de permisos
// centralizado en el servidor (ver sección 2 de la arquitectura: matriz de permisos).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
