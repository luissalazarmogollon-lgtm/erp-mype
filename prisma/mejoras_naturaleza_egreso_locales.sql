-- =====================================================================
-- MEJORAS: Locales/Centros de Costo + Naturaleza del Egreso en Gastos
-- Pega esto en Supabase → SQL Editor DESPUÉS de fase1_operacion_real.sql.
-- Es seguro de re-ejecutar (usa IF NOT EXISTS / IF EXISTS donde aplica).
-- =====================================================================

-- 1. Tabla de locales (centros de costo)
CREATE TABLE IF NOT EXISTS locales (
  id          BIGSERIAL PRIMARY KEY,
  empresa_id  BIGINT NOT NULL REFERENCES empresas(id),
  nombre      VARCHAR(100) NOT NULL,
  estado      VARCHAR(10) NOT NULL DEFAULT 'activo'
);

-- 2. Agregar local_id a ventas diarias, y permitir un registro por local
--    por día (antes solo permitía uno por empresa por día).
ALTER TABLE registros_venta_diaria ADD COLUMN IF NOT EXISTS local_id BIGINT REFERENCES locales(id);
ALTER TABLE registros_venta_diaria DROP CONSTRAINT IF EXISTS registros_venta_diaria_empresa_id_fecha_key;
ALTER TABLE registros_venta_diaria ADD CONSTRAINT registros_venta_diaria_empresa_fecha_local_key
  UNIQUE (empresa_id, fecha, local_id);

-- 3. Rediseño de gastos: naturaleza del egreso (reemplaza es_costo_directo),
--    categoría específica de texto libre curado, y local_id.
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS local_id BIGINT REFERENCES locales(id);
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS naturaleza VARCHAR(30);
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS categoria_especifica VARCHAR(80);

-- Migra los datos de prueba que ya hayas cargado con el modelo anterior:
-- si tenías es_costo_directo = true, lo pasamos a 'costo_directo'; si no,
-- a 'gasto_operativo' (ambos son buenas aproximaciones por defecto).
UPDATE gastos SET naturaleza = CASE WHEN es_costo_directo THEN 'costo_directo' ELSE 'gasto_operativo' END
  WHERE naturaleza IS NULL;

ALTER TABLE gastos ALTER COLUMN naturaleza SET NOT NULL;
-- La columna es_costo_directo queda en la tabla por compatibilidad, pero
-- ya no la usa el código nuevo — puedes ignorarla.
