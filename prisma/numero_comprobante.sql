-- =====================================================================
-- Número de comprobante en Gastos y Caja Chica + tipo "Nota de venta"
-- Pega esto en Supabase → SQL Editor. Seguro de re-ejecutar.
-- =====================================================================

ALTER TABLE gastos_caja_chica ADD COLUMN IF NOT EXISTS numero_comprobante VARCHAR(30);
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS numero_comprobante VARCHAR(30);

-- Ampliar los tipos de comprobante válidos para incluir "nota_venta".
-- Esto busca y elimina la restricción CHECK existente sobre esa columna
-- sin depender de adivinar su nombre exacto (Postgres a veces lo genera
-- distinto a lo esperado), y luego crea la nueva con el tipo agregado.
DO $$
DECLARE
  nombre_restriccion TEXT;
BEGIN
  SELECT con.conname INTO nombre_restriccion
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'gastos_caja_chica' AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%tipo_comprobante%';
  IF nombre_restriccion IS NOT NULL THEN
    EXECUTE format('ALTER TABLE gastos_caja_chica DROP CONSTRAINT %I', nombre_restriccion);
  END IF;
  ALTER TABLE gastos_caja_chica ADD CONSTRAINT gastos_caja_chica_tipo_comprobante_check
    CHECK (tipo_comprobante IN ('boleta','factura','recibo_honorarios','ticket','nota_venta','sin_comprobante'));
END $$;

DO $$
DECLARE
  nombre_restriccion TEXT;
BEGIN
  SELECT con.conname INTO nombre_restriccion
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'gastos' AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%tipo_comprobante%';
  IF nombre_restriccion IS NOT NULL THEN
    EXECUTE format('ALTER TABLE gastos DROP CONSTRAINT %I', nombre_restriccion);
  END IF;
  ALTER TABLE gastos ADD CONSTRAINT gastos_tipo_comprobante_check
    CHECK (tipo_comprobante IN ('boleta','factura','recibo_honorarios','ticket','nota_venta','sin_comprobante'));
END $$;
