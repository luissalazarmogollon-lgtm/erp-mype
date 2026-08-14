-- =====================================================================
-- SEMILLA ADICIONAL — Plantillas de catálogo para Cafetería y Heladería
-- Corrige un pendiente del Sprint 1: solo se había cargado la plantilla
-- de "Restaurante". Pega esto en Supabase → SQL Editor → Run.
-- Seguro de correr aunque ya tengas empresas creadas: esto solo agrega
-- filas a rubro_plantilla_catalogo, no toca empresas existentes.
-- =====================================================================

-- ---------- CAFETERÍA ----------
INSERT INTO rubro_plantilla_catalogo (rubro_id, tipo_catalogo, nombre_item)
SELECT id, 'categoria_insumo', item FROM rubros, unnest(ARRAY[
  'Café y granos','Lácteos','Panificados','Bebidas','Endulzantes','Empaques'
]) AS item WHERE rubros.nombre = 'Cafetería';

INSERT INTO rubro_plantilla_catalogo (rubro_id, tipo_catalogo, nombre_item)
SELECT id, 'categoria_producto', item FROM rubros, unnest(ARRAY[
  'Bebidas calientes','Bebidas frías','Panadería','Postres'
]) AS item WHERE rubros.nombre = 'Cafetería';

INSERT INTO rubro_plantilla_catalogo (rubro_id, tipo_catalogo, nombre_item)
SELECT id, 'tipo_gasto', item FROM rubros, unnest(ARRAY[
  'Alquiler','Servicios (luz/agua/internet)','Marketing','Mantenimiento','Insumos indirectos'
]) AS item WHERE rubros.nombre = 'Cafetería';

INSERT INTO rubro_plantilla_catalogo (rubro_id, tipo_catalogo, nombre_item)
SELECT id, 'unidad_medida', item FROM rubros, unnest(ARRAY[
  'kg','g','l','ml','unidad','docena'
]) AS item WHERE rubros.nombre = 'Cafetería';

-- ---------- HELADERÍA ----------
INSERT INTO rubro_plantilla_catalogo (rubro_id, tipo_catalogo, nombre_item)
SELECT id, 'categoria_insumo', item FROM rubros, unnest(ARRAY[
  'Lácteos','Frutas','Saborizantes y esencias','Toppings','Empaques','Endulzantes'
]) AS item WHERE rubros.nombre = 'Heladería';

INSERT INTO rubro_plantilla_catalogo (rubro_id, tipo_catalogo, nombre_item)
SELECT id, 'categoria_producto', item FROM rubros, unnest(ARRAY[
  'Helados','Postres helados','Bebidas','Toppings extra'
]) AS item WHERE rubros.nombre = 'Heladería';

INSERT INTO rubro_plantilla_catalogo (rubro_id, tipo_catalogo, nombre_item)
SELECT id, 'tipo_gasto', item FROM rubros, unnest(ARRAY[
  'Alquiler','Servicios (luz/agua/internet)','Marketing','Mantenimiento de equipos de frío'
]) AS item WHERE rubros.nombre = 'Heladería';

INSERT INTO rubro_plantilla_catalogo (rubro_id, tipo_catalogo, nombre_item)
SELECT id, 'unidad_medida', item FROM rubros, unnest(ARRAY[
  'kg','g','l','ml','unidad','docena'
]) AS item WHERE rubros.nombre = 'Heladería';
