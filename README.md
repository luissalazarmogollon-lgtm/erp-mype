# ERP MYPE — Sprint 1: Núcleo multiempresa, alta de empresa, seguridad

Este es el primer sprint del sistema, construido siguiendo el orden de
`especificacion_mvp_erp_mype.md` (sección 6, punto 1). Cubre:

- Login (Supabase Auth)
- Selector de empresas del usuario (HU-03)
- Alta de nueva empresa: datos generales, tipo de negocio/rubro, moneda e IGV (HU-01, HU-02 parcial)
- Activación automática de módulos según el rubro (RN-012)
- Registro de auditoría de la creación (RN-005)

**Lo que falta para el siguiente sprint:** catálogos por empresa (clonado real de plantillas, RN-011), gestión de usuarios (asignar Asesor/Asistente/Cliente a una empresa), y el módulo de Ventas/Inventario. Cuando quieras, seguimos construyendo esto en el chat.

---

## Cómo desplegar esto SIN instalar nada en tu Mac

Todo el flujo ocurre en el navegador: GitHub (guarda el código), Supabase (base de datos y login), Vercel (pone la app en línea).

### Paso 1 — Crear el repositorio en GitHub

1. Ve a [github.com](https://github.com) y crea una cuenta si no tienes.
2. Clic en **New repository**. Nómbralo `erp-mype`, déjalo privado, crea.
3. En la página del repo vacío, usa **uploading an existing file** (link que aparece en la pantalla de bienvenida).
4. Arrastra **toda la carpeta** `erp-mype` que descargaste de este chat (todos los archivos y subcarpetas: `src/`, `prisma/`, `package.json`, etc.) y confirma el commit.

### Paso 2 — Crear el proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) → **New project**. Elige una contraseña de base de datos y guárdala.
2. Cuando el proyecto termine de crearse, ve a **SQL Editor** (menú izquierdo) → **New query**.
3. Copia y pega el contenido completo de `prisma/sprint1_nucleo.sql` → **Run**.
4. Nueva query → pega el contenido de `prisma/seed_sprint1.sql` → **Run**.
5. Ve a **Authentication → Users → Add user**, crea tu propio usuario (el que vas a usar como superadmin) con tu correo y una contraseña.
6. Copia el **UUID** que Supabase le asignó a tu usuario (aparece en la lista de usuarios).
7. Vuelve al **SQL Editor**, pega y ejecuta (reemplazando los datos de ejemplo):
   ```sql
   INSERT INTO usuarios (id, nombres, apellidos, email, tipo_actor_base, es_superadmin_plataforma)
   VALUES ('PEGA-AQUI-EL-UUID', 'Tu Nombre', 'Tu Apellido', 'tu@correo.com', 'asesor', true);
   ```
8. Ve a **Project Settings → API**: copia `Project URL` y `anon public key`.
9. Ve a **Project Settings → Database → Connection string**: copia la cadena en modo **Transaction** (para `DATABASE_URL`) y en modo **Session** (para `DIRECT_URL`).

### Paso 3 — Desplegar en Vercel

1. Ve a [vercel.com](https://vercel.com) → **Add New → Project**.
2. Conecta tu cuenta de GitHub y elige el repositorio `erp-mype`.
3. En **Environment Variables**, agrega las 5 variables de `.env.example` con los valores reales que copiaste de Supabase en el paso anterior.
4. Clic en **Deploy**. Vercel instala las dependencias y construye el proyecto en la nube — tu Mac no hace ningún trabajo en este paso.
5. Cuando termine, Vercel te da una URL pública (algo como `erp-mype.vercel.app`). Ábrela, inicia sesión con el usuario que creaste en el paso 2, y deberías ver el selector de empresas (vacío) con el botón "Dar de alta nueva empresa".

### Paso 4 — Probar el flujo

1. Inicia sesión con tu correo/contraseña de superadmin.
2. Clic en **"+ Dar de alta nueva empresa"**.
3. Llena los datos, elige rubro "Restaurante" (ya viene precargado), moneda, IGV.
4. Al confirmar, deberías volver al dashboard y ver la empresa recién creada como una tarjeta.

Si algo falla en el Paso 3 (build de Vercel), la pantalla de **Deployments → [tu deploy] → Build logs** te muestra el error exacto — cópialo y tráelo aquí al chat, lo resolvemos juntos.

---

## Cómo seguimos construyendo

Para el próximo sprint (catálogos por empresa + gestión de usuarios + Ventas/Inventario), simplemente vuelve a este chat y dime que continuamos. Yo genero los archivos nuevos, tú los subes a GitHub (arrastrando los archivos nuevos/modificados a la misma pantalla de **Add file → Upload files** de tu repositorio), y Vercel vuelve a desplegar automáticamente solo.

## Estructura del proyecto

```
erp-mype/
├── prisma/
│   ├── schema.prisma        # Modelo de datos (Sprint 1)
│   ├── sprint1_nucleo.sql   # DDL para pegar en Supabase SQL Editor
│   └── seed_sprint1.sql     # Datos iniciales (rubros, roles, bancos...)
├── src/
│   ├── app/
│   │   ├── login/           # Pantalla de login
│   │   ├── dashboard/       # Selector de empresas (HU-03)
│   │   ├── onboarding/empresa/  # Wizard de alta de empresa (HU-01)
│   │   └── api/
│   │       ├── empresas/    # POST crear empresa, GET listar visibles
│   │       └── rubros/      # GET listar rubros para el wizard
│   ├── components/ui/       # Componentes reutilizables
│   └── lib/
│       ├── auth.ts          # Resolución de permisos multiempresa (RN-001, RN-004)
│       ├── prisma.ts        # Cliente de base de datos
│       └── supabase/        # Clientes de autenticación
└── README.md                 # Este archivo
```
