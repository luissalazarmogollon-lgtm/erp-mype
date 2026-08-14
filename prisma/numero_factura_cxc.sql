-- =====================================================================
-- Número de factura en Cuentas por Cobrar
-- Pega esto en Supabase → SQL Editor. Seguro de re-ejecutar.
-- (El RUC del cliente ya se guarda en la columna clientes.doc_identidad,
-- que ya existía desde el Sprint 3 — no necesita migración.)
-- =====================================================================

ALTER TABLE cuentas_por_cobrar ADD COLUMN IF NOT EXISTS numero_factura VARCHAR(30);
