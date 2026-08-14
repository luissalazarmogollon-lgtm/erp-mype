-- =====================================================================
-- Acceso granular por módulo (checkboxes) en usuario_empresa
-- Pega esto en Supabase → SQL Editor. Seguro de re-ejecutar.
-- Los usuarios ya asignados quedan con acceso_total = true (no pierden
-- acceso a nada por esta migración; el superadmin decide luego si quiere
-- limitarlos editando su asignación).
-- =====================================================================

ALTER TABLE usuario_empresa ADD COLUMN IF NOT EXISTS acceso_total BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE usuario_empresa ADD COLUMN IF NOT EXISTS permisos JSONB;
