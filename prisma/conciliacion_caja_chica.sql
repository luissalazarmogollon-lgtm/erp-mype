-- =====================================================================
-- Conciliación de ventas diarias con el banco + Caja Chica
-- Pega esto en Supabase → SQL Editor. Seguro de re-ejecutar.
-- =====================================================================

-- 1. Conciliación: a qué cuenta bancaria entró cada método de pago
ALTER TABLE registros_venta_diaria ADD COLUMN IF NOT EXISTS efectivo_cuenta_id BIGINT REFERENCES cuentas_bancarias(id);
ALTER TABLE registros_venta_diaria ADD COLUMN IF NOT EXISTS yape_cuenta_id BIGINT REFERENCES cuentas_bancarias(id);
ALTER TABLE registros_venta_diaria ADD COLUMN IF NOT EXISTS plin_cuenta_id BIGINT REFERENCES cuentas_bancarias(id);
ALTER TABLE registros_venta_diaria ADD COLUMN IF NOT EXISTS tarjeta_cuenta_id BIGINT REFERENCES cuentas_bancarias(id);

-- 2. Caja Chica
CREATE TABLE IF NOT EXISTS cajas_chicas (
  id                  BIGSERIAL PRIMARY KEY,
  empresa_id          BIGINT NOT NULL REFERENCES empresas(id),
  nombre              VARCHAR(100) NOT NULL,
  cuenta_bancaria_id  BIGINT REFERENCES cuentas_bancarias(id),
  monto_fondo         NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado              VARCHAR(10) NOT NULL DEFAULT 'activo'
);

CREATE TABLE IF NOT EXISTS movimientos_caja_chica (
  id             BIGSERIAL PRIMARY KEY,
  caja_chica_id  BIGINT NOT NULL REFERENCES cajas_chicas(id),
  tipo           VARCHAR(15) NOT NULL CHECK (tipo IN ('fondo','reposicion')),
  monto          NUMERIC(12,2) NOT NULL,
  fecha          TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id     UUID NOT NULL REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS gastos_caja_chica (
  id                    BIGSERIAL PRIMARY KEY,
  caja_chica_id         BIGINT NOT NULL REFERENCES cajas_chicas(id),
  descripcion           VARCHAR(255) NOT NULL,
  monto                 NUMERIC(10,2) NOT NULL,
  fecha                 DATE NOT NULL,
  tipo_comprobante      VARCHAR(20) NOT NULL DEFAULT 'sin_comprobante'
                         CHECK (tipo_comprobante IN ('boleta','factura','recibo_honorarios','ticket','sin_comprobante')),
  naturaleza            VARCHAR(30),
  categoria_especifica  VARCHAR(80),
  estado                VARCHAR(15) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','trasladado')),
  gasto_id              BIGINT UNIQUE REFERENCES gastos(id),
  usuario_id            UUID NOT NULL REFERENCES usuarios(id)
);
