"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setCargando(false);

    if (authError) {
      setError(
        authError.message === "Invalid login credentials"
          ? "Correo o contraseña incorrectos."
          : `${authError.message} (código: ${authError.status ?? "sin código"})`
      );
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex" }}>
      {/* Panel de marca — se oculta en pantallas angostas (ver globals.css),
          donde solo queda el formulario centrado. */}
      <aside
        className="login-aside"
        style={{
          flex: "0 0 42%",
          background: "linear-gradient(155deg, var(--brand) 0%, var(--brand-dark) 100%)",
          color: "#fff",
          padding: "56px 48px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            aria-hidden
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 8,
              background: "var(--stamp)",
              color: "var(--ink)",
              fontFamily: "IBM Plex Mono, monospace",
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            EM
          </span>
          <span style={{ fontWeight: 700, fontSize: 19, letterSpacing: "-0.01em" }}>ERP MYPE</span>
        </div>

        <div>
          <h1 style={{ fontSize: 32, lineHeight: 1.25, marginBottom: 16, color: "#fff" }}>
            Control financiero claro, para tu negocio y los que asesoras.
          </h1>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "rgba(255,255,255,0.82)", maxWidth: 380 }}>
            Estado de resultados en tiempo real, cuentas por pagar y por cobrar, inventario y flujo de caja —
            todo en un solo lugar, para cada empresa que gestionas.
          </p>
        </div>

        <p className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", letterSpacing: "0.04em" }}>
          PLATAFORMA DE GESTIÓN Y CONTROL EMPRESARIAL
        </p>
      </aside>

      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "var(--paper-bg)",
        }}
      >
        <div style={{ maxWidth: 380, width: "100%" }}>
          <h1 style={{ fontSize: 22, marginBottom: 6 }}>Ingresa a tu cuenta</h1>
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 28 }}>
            Usa el correo y la contraseña que te asignaron para acceder al sistema.
          </p>

          <form onSubmit={handleSubmit} className="card">
            <div className="field">
              <label htmlFor="email">Correo</label>
              <input
                id="email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
              />
            </div>

            <div className="field" style={{ marginBottom: error ? 8 : 22 }}>
              <label htmlFor="password">Contraseña</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && <p className="field error" style={{ marginBottom: 14 }}>{error}</p>}

            <button type="submit" className="btn-primary" style={{ width: "100%" }} disabled={cargando}>
              {cargando ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
