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
      setError(`${authError.message} (código: ${authError.status ?? "sin código"})`);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div className="card" style={{ maxWidth: 380, width: "100%" }}>
        <h1 style={{ fontSize: 24, marginBottom: 6 }}>ERP MYPE</h1>
        <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 28 }}>
          Control financiero multiempresa
        </p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Correo</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
            />
          </div>

          <div className="field">
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

          {error && <p className="field error">{error}</p>}

          <button type="submit" className="btn-primary" style={{ width: "100%" }} disabled={cargando}>
            {cargando ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </main>
  );
}
