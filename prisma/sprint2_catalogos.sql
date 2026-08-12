-- =====================================================================
-- SPRINT 2 — Catálogos por empresa
-- Pega esto en Supabase → SQL Editor, DESPUÉS de sprint1_nucleo.sql y
-- seed_sprint1.sql. Coincide exactamente con los nuevos modelos en
-- prisma/schema.prisma.
-- =====================================================================

CREATE TABLE categorias_insumo (
  id          BIGSERIAL PRIMARY KEY,
  empresa_id  BIGINT NOT NULL REFERENCES empresas(id),
  nombre      VARCHAR(60) NOT NULL,
  UNIQUE (empresa_id, nombre)
);

CREATE TABLE unidades_medida (
  id           BIGSERIAL PRIMARY KEY,
  empresa_id   BIGINT NOT NULL REFERENCES empresas(id),
  nombre       VARCHAR(20) NOT NULL,
  abreviatura  VARCHAR(6) NOT NULL,
  UNIQUE (empresa_id, nombre)
);

CREATE TABLE categorias_producto (
  id          BIGSERIAL PRIMARY KEY,
  empresa_id  BIGINT NOT NULL REFERENCES empresas(id),
  nombre      VARCHAR(60) NOT NULL,
  UNIQUE (empresa_id, nombre)
);

CREATE TABLE tipos_gasto (
  id          BIGSERIAL PRIMARY KEY,
  empresa_id  BIGINT NOT NULL REFERENCES empresas(id),
  nombre      VARCHAR(60) NOT NULL,
  UNIQUE (empresa_id, nombre)
);

CREATE TABLE metodos_pago (
  id          BIGSERIAL PRIMARY KEY,
  empresa_id  BIGINT NOT NULL REFERENCES empresas(id),
  nombre      VARCHAR(30) NOT NULL,
  UNIQUE (empresa_id, nombre)
);

CREATE TABLE conceptos_movimiento_caja (
  id          BIGSERIAL PRIMARY KEY,
  empresa_id  BIGINT NOT NULL REFERENCES empresas(id),
  nombre      VARCHAR(60) NOT NULL,
  tipo        VARCHAR(8) NOT NULL CHECK (tipo IN ('ingreso','egreso'))
);
