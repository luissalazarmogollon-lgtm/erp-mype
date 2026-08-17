-- =====================================================================
-- SPRINT 6 — Proveedores, Pedidos de Compra, Recepción y Alerta de Costo
-- Pega esto en Supabase → SQL Editor, DESPUÉS de sprint5_despacho_kardex_lotes.sql.
-- =====================================================================

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS umbral_alerta_anomalia_pct NUMERIC(5,2) NOT NULL DEFAULT 15;

CREATE TABLE proveedores (
  id          BIGSERIAL PRIMARY KEY,
  empresa_id  BIGINT NOT NULL REFERENCES empresas(id),
  nombre      VARCHAR(120) NOT NULL,
  ruc         VARCHAR(15),
  contacto    VARCHAR(120),
  telefono    VARCHAR(20),
  email       VARCHAR(120),
  estado      VARCHAR(20) NOT NULL DEFAULT 'activo',
  UNIQUE (empresa_id, nombre)
);

ALTER TABLE insumos ADD COLUMN IF NOT EXISTS proveedor_preferido_id BIGINT REFERENCES proveedores(id);

CREATE TABLE pedidos_compra (
  id            BIGSERIAL PRIMARY KEY,
  empresa_id    BIGINT NOT NULL REFERENCES empresas(id),
  proveedor_id  BIGINT NOT NULL REFERENCES proveedores(id),
  estado        VARCHAR(20) NOT NULL DEFAULT 'emitida'
                CHECK (estado IN ('emitida','recibida_parcial','recibida','cerrada')),
  fecha         TIMESTAMP NOT NULL DEFAULT now(),
  usuario_id    UUID NOT NULL REFERENCES usuarios(id)
);
CREATE INDEX idx_pedidos_compra_empresa_estado ON pedidos_compra(empresa_id, estado);

CREATE TABLE pedidos_compra_detalle (
  id                       BIGSERIAL PRIMARY KEY,
  pedido_compra_id         BIGINT NOT NULL REFERENCES pedidos_compra(id) ON DELETE CASCADE,
  solicitud_detalle_id     BIGINT NOT NULL UNIQUE REFERENCES solicitudes_pedido_detalle(id),
  insumo_id                BIGINT NOT NULL REFERENCES insumos(id),
  cantidad                 NUMERIC(10,3) NOT NULL,
  costo_unitario_estimado  NUMERIC(10,4),
  cantidad_recibida        NUMERIC(10,3),
  costo_unitario_real      NUMERIC(10,4),
  fecha_recepcion          TIMESTAMP
);

CREATE TABLE alertas_anomalia_costo (
  id               BIGSERIAL PRIMARY KEY,
  empresa_id       BIGINT NOT NULL REFERENCES empresas(id),
  insumo_id        BIGINT NOT NULL REFERENCES insumos(id),
  lote_anterior_id BIGINT,
  lote_nuevo_id    BIGINT NOT NULL,
  costo_anterior   NUMERIC(10,4) NOT NULL,
  costo_nuevo      NUMERIC(10,4) NOT NULL,
  variacion_pct    NUMERIC(6,2) NOT NULL,
  fecha            TIMESTAMP NOT NULL DEFAULT now(),
  estado           VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','revisado'))
);
CREATE INDEX idx_alertas_anomalia_empresa_estado ON alertas_anomalia_costo(empresa_id, estado);

-- Agrega origen "compra" como válido en lotes_compra (ya estaba permitido
-- desde sprint5, solo se confirma aquí por completitud).
