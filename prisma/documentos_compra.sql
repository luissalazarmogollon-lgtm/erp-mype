-- =====================================================================
-- Documentos de compra con varios ítems
-- Pega esto en Supabase → SQL Editor. Seguro de re-ejecutar.
-- =====================================================================

CREATE TABLE IF NOT EXISTS documentos_compra (
  id                  BIGSERIAL PRIMARY KEY,
  empresa_id          BIGINT NOT NULL REFERENCES empresas(id),
  local_id            BIGINT REFERENCES locales(id),
  proveedor_nombre    VARCHAR(150),
  tipo_comprobante    VARCHAR(20) NOT NULL DEFAULT 'sin_comprobante',
  numero_comprobante  VARCHAR(30),
  fecha               DATE NOT NULL,
  condicion           VARCHAR(10) NOT NULL CHECK (condicion IN ('contado','credito')),
  medio_pago          VARCHAR(20),
  cuenta_bancaria_id  BIGINT REFERENCES cuentas_bancarias(id),
  monto_total         NUMERIC(12,2) NOT NULL,
  usuario_id          UUID NOT NULL REFERENCES usuarios(id)
);

ALTER TABLE gastos ADD COLUMN IF NOT EXISTS documento_compra_id BIGINT REFERENCES documentos_compra(id);

-- La CxP ahora puede corresponder a un documento completo (varios ítems)
-- en vez de a un solo gasto — por eso gasto_id deja de ser obligatorio.
ALTER TABLE cuentas_por_pagar ALTER COLUMN gasto_id DROP NOT NULL;
ALTER TABLE cuentas_por_pagar ADD COLUMN IF NOT EXISTS documento_compra_id BIGINT UNIQUE REFERENCES documentos_compra(id);
