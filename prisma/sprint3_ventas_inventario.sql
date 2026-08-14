-- =====================================================================
-- SPRINT 3 — Ventas, Inventario, Fichas Técnicas, Mermas
-- Pega esto en Supabase → SQL Editor, DESPUÉS de sprint1_nucleo.sql,
-- seed_sprint1.sql y sprint2_catalogos.sql.
-- =====================================================================

CREATE TABLE clientes (
  id                   BIGSERIAL PRIMARY KEY,
  empresa_id           BIGINT NOT NULL REFERENCES empresas(id),
  nombre               VARCHAR(120) NOT NULL,
  doc_identidad        VARCHAR(15),
  telefono             VARCHAR(20),
  tipo                 VARCHAR(20) NOT NULL DEFAULT 'consumidor_final' CHECK (tipo IN ('consumidor_final','frecuente')),
  credito_habilitado   BOOLEAN NOT NULL DEFAULT false,
  limite_credito       NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE insumos (
  id                      BIGSERIAL PRIMARY KEY,
  empresa_id              BIGINT NOT NULL REFERENCES empresas(id),
  codigo                  VARCHAR(30),
  nombre                  VARCHAR(120) NOT NULL,
  categoria_id            BIGINT REFERENCES categorias_insumo(id),
  unidad_medida_id        BIGINT REFERENCES unidades_medida(id),
  stock_minimo            NUMERIC(10,3) NOT NULL DEFAULT 0,
  stock_actual            NUMERIC(10,3) NOT NULL DEFAULT 0,
  costo_promedio_actual   NUMERIC(10,4) NOT NULL DEFAULT 0 CHECK (costo_promedio_actual >= 0),
  UNIQUE (empresa_id, codigo)
);

CREATE TABLE productos (
  id               BIGSERIAL PRIMARY KEY,
  empresa_id       BIGINT NOT NULL REFERENCES empresas(id),
  codigo           VARCHAR(30),
  nombre           VARCHAR(120) NOT NULL,
  categoria_id     BIGINT REFERENCES categorias_producto(id),
  tipo             VARCHAR(10) NOT NULL CHECK (tipo IN ('producto','servicio')),
  precio_venta     NUMERIC(10,2) NOT NULL CHECK (precio_venta >= 0),
  requiere_receta  BOOLEAN NOT NULL DEFAULT false,
  estado           VARCHAR(10) NOT NULL DEFAULT 'activo',
  UNIQUE (empresa_id, codigo)
);

CREATE TABLE fichas_tecnicas (
  id                   BIGSERIAL PRIMARY KEY,
  producto_id          BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  insumo_id            BIGINT NOT NULL REFERENCES insumos(id),
  cantidad_requerida   NUMERIC(10,4) NOT NULL CHECK (cantidad_requerida > 0),
  unidad_medida_id     BIGINT REFERENCES unidades_medida(id),
  merma_estandar_pct   NUMERIC(5,2) NOT NULL DEFAULT 0
);

CREATE TABLE movimientos_inventario (
  id               BIGSERIAL PRIMARY KEY,
  empresa_id       BIGINT NOT NULL REFERENCES empresas(id),
  insumo_id        BIGINT NOT NULL REFERENCES insumos(id),
  tipo             VARCHAR(20) NOT NULL CHECK (tipo IN ('entrada_compra','salida_venta','merma','ajuste_manual')),
  cantidad         NUMERIC(10,3) NOT NULL,
  costo_unitario   NUMERIC(10,4) NOT NULL,
  fecha            TIMESTAMPTZ NOT NULL DEFAULT now(),
  referencia_tipo  VARCHAR(20),
  referencia_id    BIGINT,
  usuario_id       UUID NOT NULL REFERENCES usuarios(id)
);
CREATE INDEX idx_mov_inv_insumo ON movimientos_inventario(insumo_id, fecha);

CREATE TABLE mermas (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      BIGINT NOT NULL REFERENCES empresas(id),
  insumo_id       BIGINT NOT NULL REFERENCES insumos(id),
  cantidad        NUMERIC(10,3) NOT NULL CHECK (cantidad > 0),
  motivo          VARCHAR(25) NOT NULL CHECK (motivo IN ('vencimiento','desperdicio_preparacion','robo_diferencia','otro')),
  costo_estimado  NUMERIC(12,2) NOT NULL,
  fecha           TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id      UUID NOT NULL REFERENCES usuarios(id),
  observacion     VARCHAR(255)
);

CREATE TABLE ventas (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      BIGINT NOT NULL REFERENCES empresas(id),
  numero          VARCHAR(20) NOT NULL,
  fecha           TIMESTAMPTZ NOT NULL DEFAULT now(),
  cliente_id      BIGINT REFERENCES clientes(id),
  usuario_id      UUID NOT NULL REFERENCES usuarios(id),
  metodo_pago_id  BIGINT REFERENCES metodos_pago(id),
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento       NUMERIC(12,2) NOT NULL DEFAULT 0,
  igv             NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado          VARCHAR(10) NOT NULL DEFAULT 'cobrada' CHECK (estado IN ('cobrada','pendiente','anulada')),
  UNIQUE (empresa_id, numero)
);

CREATE TABLE ventas_detalle (
  id                          BIGSERIAL PRIMARY KEY,
  venta_id                    BIGINT NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id                 BIGINT NOT NULL REFERENCES productos(id),
  cantidad                    NUMERIC(10,3) NOT NULL CHECK (cantidad > 0),
  precio_unitario             NUMERIC(10,2) NOT NULL,
  costo_unitario_calculado    NUMERIC(10,4) NOT NULL DEFAULT 0,
  subtotal                    NUMERIC(12,2) NOT NULL
);
