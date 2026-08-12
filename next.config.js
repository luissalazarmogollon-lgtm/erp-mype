/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El Dashboard Ejecutivo Móvil (sección 11.B de la arquitectura) se sirve como PWA.
  // Cuando agreguemos ese sprint, integramos next-pwa aquí para el service worker
  // y las notificaciones push del Propietario.
};

module.exports = nextConfig;
