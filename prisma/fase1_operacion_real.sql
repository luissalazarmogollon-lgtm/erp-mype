-- =====================================================================
-- FASE 1 (registro real de operación) — Ventas diarias, CxC, Gastos/
-- Costos, CxP. Pega esto en Supabase → SQL Editor, DESPUÉS de todos los
-- scripts anteriores (sprint1, sprint2, sprint3).
-- =====================================================================

CREATE TABLE registros_venta_diaria (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      BIGINT NOT NULL REFERENCES empresas(id),
  fecha           DATE NOT NULL,
  monto_efectivo  NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_yape      NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_plin      NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_tarjeta   NUMERIC(12,2) NOT NULL DEFAULT 0,
  observacion     VARCHAR(255),
  usuario_id      UUID NOT NULL REFERENCES usuarios(id),
  fecha_registro  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, fecha)
);

CREATE TABLE cuentas_por_cobrar (
  id                 BIGSERIAL PRIMARY KEY,
  empresa_id         BIGINT NOT NULL REFERENCES empresas(id),
  cliente_id         BIGINT NOT NULL REFERENCES clientes(id),
  descripcion        VARCHAR(255),
  monto_total        NUMERIC(12,2) NOT NULL,
  saldo_pendiente    NUMERIC(12,2) NOT NULL,
  fecha_emision      TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_vencimiento  TIMESTAMPTZ,
  estado             VARCHAR(10) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','vencida','pagada')),
  usuario_id         UUID NOT NULL REFERENCES usuarios(id)
);

CREATE TABLE cobros_cxc (
  id          BIGSERIAL PRIMARY KEY,
  cxc_id      BIGINT NOT NULL REFERENCES cuentas_por_cobrar(id),
  monto       NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha       TIMESTAMPTZ NOT NULL DEFAULT now(),
  medio_pago  VARCHAR(20),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id)
);

CREATE TABLE gastos (
  id                BIGSERIAL PRIMARY KEY,
  empresa_id        BIGINT NOT NULL REFERENCES empresas(id),
  categoria_id      BIGINT REFERENCES tipos_gasto(id),
  proveedor_nombre  VARCHAR(150),
  descripcion       VARCHAR(255) NOT NULL,
  tipo_comprobante  VARCHAR(20) NOT NULL DEFAULT 'sin_comprobante'
                     CHECK (tipo_comprobante IN ('boleta','factura','recibo_honorarios','ticket','sin_comprobante')),
  monto_total       NUMERIC(12,2) NOT NULL,
  fecha             DATE NOT NULL,
  es_costo_directo  BOOLEAN NOT NULL DEFAULT false,
  condicion         VARCHAR(10) NOT NULL CHECK (condicion IN ('contado','credito')),
  medio_pago        VARCHAR(20),
  usuario_id        UUID NOT NULL REFERENCES usuarios(id)
);

CREATE TABLE cuentas_por_pagar (
  id                 BIGSERIAL PRIMARY KEY,
  empresa_id         BIGINT NOT NULL REFERENCES empresas(id),
  gasto_id           BIGINT NOT NULL UNIQUE REFERENCES gastos(id),
  proveedor_nombre   VARCHAR(150),
  monto_total        NUMERIC(12,2) NOT NULL,
  saldo_pendiente    NUMERIC(12,2) NOT NULL,
  fecha_emision      TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_vencimiento  TIMESTAMPTZ,
  estado             VARCHAR(10) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','vencida','pagada'))
);

CREATE TABLE pagos_cxp (
  id          BIGSERIAL PRIMARY KEY,
  cxp_id      BIGINT NOT NULL REFERENCES cuentas_por_pagar(id),
  monto       NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha       TIMESTAMPTZ NOT NULL DEFAULT now(),
  medio_pago  VARCHAR(20),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id)
);
