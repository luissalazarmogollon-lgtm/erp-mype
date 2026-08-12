import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERP MYPE — Control financiero multiempresa",
  description: "Plataforma de gestión y control empresarial para MYPE",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
