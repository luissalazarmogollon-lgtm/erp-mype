"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// `style` es opcional — solo lo usa AppChrome para que el botón se vea bien
// sobre la barra superior azul (fondo blanco en vez del fondo transparente
// normal de btn-ghost). Sin la prop se comporta exactamente igual que antes.
export function LogoutButton({ style }: { style?: React.CSSProperties } = {}) {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button onClick={handleLogout} className="btn-ghost" style={style}>
      Cerrar sesión
    </button>
  );
}
