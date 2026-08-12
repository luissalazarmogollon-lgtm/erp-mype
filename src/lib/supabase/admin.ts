import { createClient } from "@supabase/supabase-js";

// Cliente Supabase con privilegios de administrador — SOLO se usa en el
// servidor (API routes), nunca se importa en un componente de cliente.
// Necesario para crear usuarios de Auth directamente (invitar Asesores/
// Asistentes/Clientes) sin pasar por el flujo público de registro.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
