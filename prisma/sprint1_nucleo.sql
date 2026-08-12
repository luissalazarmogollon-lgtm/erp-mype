-- =====================================================================
-- SPRINT 1 — Núcleo multiempresa, alta de empresa, seguridad
-- Pega este script completo en Supabase → SQL Editor → New query → Run.
-- No necesitas terminal ni Prisma CLI para este paso.
-- Coincide exactamente con prisma/schema.prisma (mismos nombres de tabla/columna).
-- =====================================================================

CREATE TABLE tipos_negocio (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(40) NOT NULL UNIQUE
);

CREATE TABLE rubros (
  id                          SERIAL PRIMARY KEY,
  nombre                      VARCHAR(80) NOT NULL UNIQUE,
  tipo_negocio_sugerido_id    INT REFERENCES tipos_negocio(id),
  requiere_inventario         BOOLEAN NOT NULL DEFAULT true,
  requiere_fichas_tecnicas    BOOLEAN NOT NULL DEFAULT true,
  estado                      VARCHAR(10) NOT NULL DEFAULT 'activo'
);

CREATE TABLE rubro_plantilla_catalogo (
  id              SERIAL PRIMARY KEY,
  rubro_id        INT NOT NULL REFERENCES rubros(id),
  tipo_catalogo   VARCHAR(30) NOT NULL,
  nombre_item     VARCHAR(80) NOT NULL
);

CREATE TABLE bancos (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(60) NOT NULL UNIQUE
);

-- usuarios.id = auth.users.id (Supabase Auth). No usamos FK física hacia
-- auth.users porque vive en otro schema, pero el id debe coincidir siempre.
CREATE TABLE usuarios (
  id                          UUID PRIMARY KEY,
  nombres                     VARCHAR(80) NOT NULL,
  apellidos                   VARCHAR(80) NOT NULL,
  email                       VARCHAR(150) NOT NULL UNIQUE,
  telefono                    VARCHAR(20),
  tipo_actor_base             VARCHAR(12) NOT NULL CHECK (tipo_actor_base IN ('asesor','asistente','cliente')),
  es_superadmin_plataforma    BOOLEAN NOT NULL DEFAULT false,
  estado                      VARCHAR(10) NOT NULL DEFAULT 'activo',
  fecha_creacion              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE empresas (
  id                     BIGSERIAL PRIMARY KEY,
  razon_social           VARCHAR(150) NOT NULL,
  nombre_comercial       VARCHAR(100) NOT NULL,
  ruc                    VARCHAR(11),
  logo_url               VARCHAR(255),
  tipo_negocio_id        INT NOT NULL REFERENCES tipos_negocio(id),
  rubro_id               INT NOT NULL REFERENCES rubros(id),
  moneda_operacion       VARCHAR(3) NOT NULL DEFAULT 'PEN' CHECK (moneda_operacion IN ('PEN','USD')),
  aplica_igv             BOOLEAN NOT NULL DEFAULT true,
  tasa_igv               NUMERIC(5,2) NOT NULL DEFAULT 18.00,
  regimen_tributario     VARCHAR(20) CHECK (regimen_tributario IN ('NUEVO_RUS','RER','RMT','GENERAL')),
  capital_social_inicial NUMERIC(12,2) NOT NULL DEFAULT 0,
  fecha_alta             TIMESTAMPTZ NOT NULL DEFAULT now(),
  estado_servicio        VARCHAR(10) NOT NULL DEFAULT 'activo',
  asesor_principal_id    UUID REFERENCES usuarios(id),
  estado                 VARCHAR(10) NOT NULL DEFAULT 'activo'
);

CREATE TABLE empresa_modulos (
  id          BIGSERIAL PRIMARY KEY,
  empresa_id  BIGINT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  modulo      VARCHAR(30) NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (empresa_id, modulo)
);

CREATE TABLE roles_operativos (
  id           SERIAL PRIMARY KEY,
  nombre       VARCHAR(30) NOT NULL UNIQUE,
  descripcion  VARCHAR(200)
);

CREATE TABLE permisos (
  id       SERIAL PRIMARY KEY,
  modulo   VARCHAR(40) NOT NULL,
  accion   VARCHAR(15) NOT NULL CHECK (accion IN ('ver','crear','editar','eliminar','aprobar')),
  UNIQUE (modulo, accion)
);

CREATE TABLE rol_permisos (
  rol_operativo_id  INT NOT NULL REFERENCES roles_operativos(id),
  permiso_id        INT NOT NULL REFERENCES permisos(id),
  PRIMARY KEY (rol_operativo_id, permiso_id)
);

CREATE TABLE usuario_empresa (
  id                 BIGSERIAL PRIMARY KEY,
  usuario_id         UUID NOT NULL REFERENCES usuarios(id),
  empresa_id         BIGINT NOT NULL REFERENCES empresas(id),
  tipo_actor         VARCHAR(12) NOT NULL CHECK (tipo_actor IN ('asesor','asistente','cliente')),
  rol_operativo_id   INT NOT NULL REFERENCES roles_operativos(id),
  estado             VARCHAR(10) NOT NULL DEFAULT 'activo',
  fecha_asignacion   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, empresa_id)
);

CREATE TABLE auditoria (
  id               BIGSERIAL PRIMARY KEY,
  usuario_id       UUID REFERENCES usuarios(id),
  empresa_id       BIGINT REFERENCES empresas(id),
  tabla_afectada   VARCHAR(60) NOT NULL,
  registro_id      BIGINT NOT NULL,
  accion           VARCHAR(15) NOT NULL CHECK (accion IN ('crear','editar','eliminar','aprobar')),
  valor_anterior   JSONB,
  valor_nuevo      JSONB,
  fecha            TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_origen        VARCHAR(45)
);
CREATE INDEX idx_auditoria_empresa_tabla ON auditoria(empresa_id, tabla_afectada, registro_id);
