import { ReactNode } from "react";

/**
 * Cabecera de 64px que cada pantalla pone arriba de su contenido.
 * No va en el layout compartido porque el título y el botón de acción
 * cambian por pantalla (p.ej. "Nueva solicitud" vs "Registrar factura").
 *
 * Uso:
 *   <PageHeader title="Solicitudes de pedido" action={<button className="btn btn-primary">Nueva solicitud</button>} />
 */
export default function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      {action}
    </div>
  );
}
