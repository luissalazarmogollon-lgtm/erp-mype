-- =====================================================================
-- RRHH (Empleados, Adelantos) + Flujo de Caja por cuenta bancaria
-- Pega esto en Supabase → SQL Editor. Seguro de re-ejecutar.
-- =====================================================================

CREATE TABLE IF NOT EXISTS cuentas_bancarias (
  id             BIGSERIAL PRIMARY KEY,
  empresa_id     BIGINT NOT NULL REFERENCES empresas(id),
  banco_nombre   VARCHAR(100) NOT NULL,
  numero_cuenta  VARCHAR(50),
  moneda         VARCHAR(3) NOT NULL DEFAULT 'PEN',
  saldo_actual   NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado         VARCHAR(10) NOT NULL DEFAULT 'activo'
);

CREATE TABLE IF NOT EXISTS movimientos_bancarios (
  id                  BIGSERIAL PRIMARY KEY,
  cuenta_bancaria_id  BIGINT NOT NULL REFERENCES cuentas_bancarias(id),
  tipo                VARCHAR(10) NOT NULL CHECK (tipo IN ('ingreso','egreso','apertura')),
  monto               NUMERIC(12,2) NOT NULL,
  concepto            VARCHAR(255) NOT NULL,
  fecha               TIMESTAMPTZ NOT NULL DEFAULT now(),
  referencia_tipo     VARCHAR(20),
  referencia_id       BIGINT,
  usuario_id          UUID NOT NULL REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS empleados (
  id               BIGSERIAL PRIMARY KEY,
  empresa_id       BIGINT NOT NULL REFERENCES empresas(id),
  nombres          VARCHAR(80) NOT NULL,
  apellidos        VARCHAR(80) NOT NULL,
  doc_identidad    VARCHAR(15) NOT NULL,
  cargo            VARCHAR(80),
  fecha_ingreso    DATE NOT NULL,
  tipo_contrato    VARCHAR(40),
  sueldo_basico    NUMERIC(10,2) NOT NULL,
  otros_ingresos   NUMERIC(10,2) NOT NULL DEFAULT 0,
  cuenta_bancaria  VARCHAR(50),
  estado           VARCHAR(10) NOT NULL DEFAULT 'activo'
);

CREATE TABLE IF NOT EXISTS adelantos_sueldo (
  id                  BIGSERIAL PRIMARY KEY,
  empresa_id          BIGINT NOT NULL REFERENCES empresas(id),
  empleado_id         BIGINT NOT NULL REFERENCES empleados(id),
  monto               NUMERIC(10,2) NOT NULL,
  fecha               DATE NOT NULL,
  motivo              VARCHAR(255),
  cuenta_bancaria_id  BIGINT REFERENCES cuentas_bancarias(id),
  estado              VARCHAR(15) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','descontado')),
  usuario_id          UUID NOT NULL REFERENCES usuarios(id)
);

-- Conectar las tablas existentes a las cuentas bancarias
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS cuenta_bancaria_id BIGINT REFERENCES cuentas_bancarias(id);
ALTER TABLE pagos_cxp ADD COLUMN IF NOT EXISTS cuenta_bancaria_id BIGINT REFERENCES cuentas_bancarias(id);
ALTER TABLE cobros_cxc ADD COLUMN IF NOT EXISTS cuenta_bancaria_id BIGINT REFERENCES cuentas_bancarias(id);
