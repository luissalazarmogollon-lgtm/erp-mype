-- =====================================================================
-- SPRINT 5 — Lotes de compra + Kardex por lote (Despacho, PEPS)
-- Pega esto en Supabase → SQL Editor, DESPUÉS de sprint4_solicitudes_pedido.sql.
-- Seguro de re-ejecutar en insumos/movimientos existentes.
-- =====================================================================

ALTER TABLE solicitudes_pedido_detalle DROP CONSTRAINT IF EXISTS solicitudes_pedido_detalle_estado_item_check;
ALTER TABLE solicitudes_pedido_detalle ADD CONSTRAINT solicitudes_pedido_detalle_estado_item_check
  CHECK (estado_item IN ('pendiente','eliminado','por_despachar','pendiente_compra','despachado'));
ALTER TABLE solicitudes_pedido_detalle ADD COLUMN IF NOT EXISTS fecha_despacho TIMESTAMP;

CREATE TABLE lotes_compra (
  id                    BIGSERIAL PRIMARY KEY,
  empresa_id            BIGINT NOT NULL REFERENCES empresas(id),
  insumo_id             BIGINT NOT NULL REFERENCES insumos(id),
  origen                VARCHAR(20) NOT NULL CHECK (origen IN ('apertura','ajuste_manual','compra')),
  fecha_ingreso         TIMESTAMP NOT NULL DEFAULT now(),
  cantidad_inicial      NUMERIC(10,3) NOT NULL,
  cantidad_disponible   NUMERIC(10,3) NOT NULL,
  costo_unitario        NUMERIC(10,4) NOT NULL,
  referencia_tipo       VARCHAR(40),
  referencia_id         BIGINT
);
CREATE INDEX idx_lotes_compra_insumo_fecha ON lotes_compra(insumo_id, fecha_ingreso);

ALTER TABLE movimientos_inventario ADD COLUMN IF NOT EXISTS lote_id BIGINT REFERENCES lotes_compra(id);
ALTER TABLE movimientos_inventario DROP CONSTRAINT IF EXISTS movimientos_inventario_tipo_check;

-- Migración de apertura: crea un lote por cada insumo con stock actual > 0,
-- usando su costo promedio de HOY como costo del lote. Sin esto, el
-- Despacho (PEPS) no tendría de dónde consumir el stock que ya existe
-- (cargado antes de este módulo, vía "Ajustar stock").
INSERT INTO lotes_compra (empresa_id, insumo_id, origen, fecha_ingreso, cantidad_inicial, cantidad_disponible, costo_unitario, referencia_tipo)
SELECT empresa_id, id, 'apertura', now(), stock_actual, stock_actual, costo_promedio_actual, 'apertura_migracion'
FROM insumos
WHERE stock_actual > 0;
