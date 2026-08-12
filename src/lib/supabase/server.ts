import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente Supabase para Server Components y API routes.
// Lee la sesión del usuario desde las cookies de la petición, para poder
// resolver "quién es" antes de consultar usuario_empresa (RN-001).
export function createServerSupabaseClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Se ignora: ocurre cuando esta función se llama desde un
            // Server Component (no una Route Handler/Server Action).
            // Next.js no permite escribir cookies ahí; la sesión sigue
            // funcionando porque el middleware (siguiente sprint) la refresca.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // Ver nota arriba.
          }
        },
      },
    }
  );
}
