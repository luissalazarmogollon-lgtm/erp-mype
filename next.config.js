/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El Dashboard Ejecutivo Móvil (sección 11.B de la arquitectura) se sirve como PWA.
  // Cuando agreguemos ese sprint, integramos next-pwa aquí para el service worker
  // y las notificaciones push del Propietario.
  experimental: {
    // pdfkit (usado para generar los PDFs de Orden de Compra y de Gastos por
    // Naturaleza) carga sus fuentes estándar (Helvetica, etc.) leyendo
    // archivos .afm del disco en tiempo de ejecución, ubicándolos con su
    // propio "__dirname". El problema: Next.js por defecto empaqueta el
    // código de pdfkit junto con el de cada ruta de la API usando webpack,
    // y una vez empaquetado, el "__dirname" de pdfkit ya no apunta a su
    // carpeta real dentro de node_modules, sino a la carpeta donde webpack
    // dejó el paquete final (.next/server/chunks/...) — ahí esos archivos
    // de fuente nunca existieron, así que revienta con ENOENT.
    //
    // serverComponentsExternalPackages saca a pdfkit de ese empaquetado: en
    // vez de incluir su código dentro del bundle, Next.js lo deja como un
    // require() normal a node_modules en tiempo de ejecución, exactamente
    // como corre en desarrollo local — ahí su "__dirname" sí es el
    // correcto. outputFileTracingIncludes sigue haciendo falta aparte,
    // porque Vercel arma cada función serverless incluyendo SOLO los
    // archivos que detecta automáticamente que se usan, y la manera en que
    // pdfkit arma esa ruta (concatenando texto en vez de un string literal)
    // hace que no lo detecte solo.
    serverComponentsExternalPackages: ["pdfkit"],
    outputFileTracingIncludes: {
      "/api/**/*": ["./node_modules/pdfkit/js/data/**/*"],
    },
  },
};

module.exports = nextConfig;
