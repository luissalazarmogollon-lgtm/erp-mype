/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El Dashboard Ejecutivo Móvil (sección 11.B de la arquitectura) se sirve como PWA.
  // Cuando agreguemos ese sprint, integramos next-pwa aquí para el service worker
  // y las notificaciones push del Propietario.
  experimental: {
    // pdfkit (usado para generar los PDFs de Orden de Compra y de Gastos por
    // Naturaleza) carga sus fuentes estándar (Helvetica, etc.) leyendo
    // archivos .afm del disco en tiempo de ejecución, con una ruta
    // construida como "__dirname + '/data/Helvetica.afm'". Vercel arma cada
    // función serverless incluyendo SOLO los archivos que detecta
    // automáticamente que se usan — y esa forma de construir la ruta (en
    // vez de un string literal) hace que no los detecte, así que sin esto
    // esos .afm quedan fuera del paquete y cualquier PDF revienta en
    // producción con error 500 (aunque en local no falla, porque ahí sí
    // están todos los archivos en disco).
    outputFileTracingIncludes: {
      "/api/**/*": ["./node_modules/pdfkit/js/data/**/*"],
    },
  },
};

module.exports = nextConfig;
