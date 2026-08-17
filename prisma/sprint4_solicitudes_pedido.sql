-- =====================================================================
-- SPRINT 4 — Solicitudes de Pedido (parte 1: solicitud + aprobación)
-- Pega esto en Supabase → SQL Editor, DESPUÉS de sprint3_ventas_inventario.sql.
-- No borra ni modifica nada existente — solo agrega tablas nuevas.
-- =====================================================================

CREATE TABLE areas (
  id          BIGSERIAL PRIMARY KEY,
  empresa_id  BIGINT NOT NULL REFERENCES empresas(id),
  nombre      VARCHAR(80) NOT NULL,
  estado      VARCHAR(20) NOT NULL DEFAULT 'activo',
  UNIQUE (empresa_id, nombre)
);

CREATE TABLE solicitudes_pedido (
  id                     BIGSERIAL PRIMARY KEY,
  empresa_id             BIGINT NOT NULL REFERENCES empresas(id),
  area_id                BIGINT REFERENCES areas(id),
  responsable_id         UUID NOT NULL REFERENCES usuarios(id),
  motivo                 TEXT,
  estado                 VARCHAR(20) NOT NULL DEFAULT 'borrador'
                          CHECK (estado IN ('borrador','enviada','aprobada','rechazada')),
  aprobador_id           UUID REFERENCES usuarios(id),
  fecha_aprobacion       TIMESTAMP,
  comentario_aprobador   TEXT,
  fecha                  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_solicitudes_pedido_empresa_estado ON solicitudes_pedido(empresa_id, estado);

CREATE TABLE solicitudes_pedido_detalle (
  id                    BIGSERIAL PRIMARY KEY,
  solicitud_id          BIGINT NOT NULL REFERENCES solicitudes_pedido(id) ON DELETE CASCADE,
  insumo_id             BIGINT NOT NULL REFERENCES insumos(id),
  cantidad_solicitada   NUMERIC(10,3) NOT NULL,
  cantidad_aprobada     NUMERIC(10,3),
  estado_item           VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                         CHECK (estado_item IN ('pendiente','eliminado','por_despachar','pendiente_compra')),
  observacion           TEXT
);
CREATE INDEX idx_solicitudes_pedido_detalle_insumo_estado ON solicitudes_pedido_detalle(insumo_id, estado_item);
