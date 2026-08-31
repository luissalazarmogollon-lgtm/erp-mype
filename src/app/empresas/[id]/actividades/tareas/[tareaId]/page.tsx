"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AlertaVencimiento = "atrasada" | "hoy" | "manana" | null;
type Tarea = {
  id: string;
  empleadoId: string;
  empleadoNombre: string;
  empleadoTelefono: string | null;
  clienteId: string | null;
  clienteNombre: string | null;
  tipoActividadNombre: string | null;
  titulo: string;
  descripcion: string | null;
  fecha: string;
  horasEstimadas: number;
  horasReales: number | null;
  estado: string;
  whatsappEnviadoEn: string | null;
  recibidoEn: string | null;
  alertaVencimiento: AlertaVencimiento;
};

export default function TareaDetallePage({ params }: { params: { id: string; tareaId: string } }) {
  const empresaId = params.id;
  const tareaId = params.tareaId;
  const [tarea, setTarea] = useState<Tarea | null>(null);
  const [horasReales, setHorasReales] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const res = await fetch(`/api/empresas/${empresaId}/actividades/tareas/${tareaId}`).then((r) => r.json());
    setTarea(res);
    if (res.horasReales) setHorasReales(res.horasReales.toString());
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, tareaId]);

  async function cambiarEstado(estado: string) {
    setGuardando(true);
    await fetch(`/api/empresas/${empresaId}/actividades/tareas/${tareaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        estado,
        ...(estado === "completada" && horasReales ? { horasReales: Number(horasReales) } : {}),
      }),
    });
    setGuardando(false);
    cargar();
  }

  async function marcarRecibido() {
    setGuardando(true);
    await fetch(`/api/empresas/${empresaId}/actividades/tareas/${tareaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marcarRecibido: true }),
    });
    setGuardando(false);
    cargar();
  }

  function enviarWhatsapp() {
    if (!tarea?.empleadoTelefono) {
      alert("Este trabajador no tiene un número de WhatsApp registrado en RRHH.");
      return;
    }
    const link = window.location.href;
    const primerNombre = tarea.empleadoNombre.split(" ")[0];
    const mensaje =
      `Hola ${primerNombre}, tienes una tarea asignada` +
      (tarea.clienteNombre ? ` para ${tarea.clienteNombre}` : "") +
      `: "${tarea.titulo}" — ${tarea.horasEstimadas}h estimadas, fecha ${new Date(tarea.fecha).toLocaleDateString("es-PE", { timeZone: "UTC" })}.\n\nVer detalle: ${link}`;
    const numero = tarea.empleadoTelefono.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, "_blank");
    fetch(`/api/empresas/${empresaId}/actividades/tareas/${tareaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marcarWhatsappEnviado: true }),
    }).then(cargar);
  }

  if (!tarea) {
    return (
      <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px" }}>
        <p style={{ color: "var(--ink-soft)" }}>Cargando...</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px" }}>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}>
        <Link href={`/empresas/${empresaId}/actividades`} style={{ color: "inherit" }}>
          Gestión de Actividades
        </Link>{" "}
        → <b>Tarea</b>
      </p>
      <h1 style={{ fontSize: 24, marginBottom: 6 }}>{tarea.titulo}</h1>
      <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 20 }}>
        {tarea.empleadoNombre} · {tarea.clienteNombre ?? "Sin cliente"} ·{" "}
        {new Date(tarea.fecha).toLocaleDateString("es-PE", { timeZone: "UTC" })}
        {tarea.tipoActividadNombre ? ` · ${tarea.tipoActividadNombre}` : ""}
      </p>

      {tarea.alertaVencimiento && (
        <p
          className="mono"
          style={{
            fontSize: 12,
            padding: "8px 12px",
            borderRadius: "var(--radius)",
            marginBottom: 16,
            background: tarea.alertaVencimiento === "atrasada" ? "var(--alert-bg)" : "var(--stamp-bg)",
            color: tarea.alertaVencimiento === "atrasada" ? "var(--alert)" : "var(--stamp)",
          }}
        >
          {tarea.alertaVencimiento === "atrasada" && "⚠ Esta tarea está atrasada."}
          {tarea.alertaVencimiento === "hoy" && "⏰ Esta tarea vence hoy."}
          {tarea.alertaVencimiento === "manana" && "⏰ Esta tarea vence mañana."}
        </p>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        {tarea.descripcion && <p style={{ fontSize: 13, marginBottom: 12 }}>{tarea.descripcion}</p>}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13 }}>Horas estimadas</span>
          <span className="mono" style={{ fontSize: 13 }}>{tarea.horasEstimadas}h</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13 }}>Estado</span>
          <span className="mono" style={{ fontSize: 13, textTransform: "uppercase" }}>{tarea.estado.replace("_", " ")}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13 }}>Recibido por el trabajador</span>
          <span className="mono" style={{ fontSize: 13, color: tarea.recibidoEn ? "var(--teal)" : "var(--ink-soft)" }}>
            {tarea.recibidoEn ? new Date(tarea.recibidoEn).toLocaleString("es-PE") : "Todavía no"}
          </span>
        </div>
        {tarea.whatsappEnviadoEn && (
          <p className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
            Avisado por WhatsApp el {new Date(tarea.whatsappEnviadoEn).toLocaleString("es-PE")}
          </p>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {!tarea.recibidoEn && (
          <button className="btn-primary" disabled={guardando} onClick={marcarRecibido}>
            ✓ Recibido
          </button>
        )}
        <button className="btn-ghost" onClick={enviarWhatsapp}>
          {tarea.whatsappEnviadoEn ? "Reenviar por WhatsApp" : "Enviar por WhatsApp"}
        </button>
        {tarea.estado === "pendiente" && (
          <button className="btn-ghost" disabled={guardando} onClick={() => cambiarEstado("en_progreso")}>
            Marcar en progreso
          </button>
        )}
      </div>

      {tarea.estado !== "completada" && (
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Completar tarea</h3>
          <div className="field">
            <label>Horas reales trabajadas (opcional)</label>
            <input type="number" step="0.25" value={horasReales} onChange={(e) => setHorasReales(e.target.value)} />
          </div>
          <button className="btn-primary" disabled={guardando} onClick={() => cambiarEstado("completada")}>
            Marcar como completada
          </button>
        </div>
      )}
    </main>
  );
}
