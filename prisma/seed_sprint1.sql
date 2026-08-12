-- =====================================================================
-- DATOS SEMILLA — Sprint 1
-- Pega esto DESPUÉS de sprint1_nucleo.sql, en el mismo SQL Editor de Supabase.
-- =====================================================================

-- Tipos de negocio
INSERT INTO tipos_negocio (nombre) VALUES
  ('Productos'), ('Servicios'), ('Productos y Servicios');

-- Rubros iniciales (rubro alimentario, ver sección 3 de la arquitectura)
INSERT INTO rubros (nombre, tipo_negocio_sugerido_id, requiere_inventario, requiere_fichas_tecnicas)
VALUES
  ('Restaurante', (SELECT id FROM tipos_negocio WHERE nombre = 'Productos y Servicios'), true, true),
  ('Cafetería',   (SELECT id FROM tipos_negocio WHERE nombre = 'Productos y Servicios'), true, true),
  ('Heladería',   (SELECT id FROM tipos_negocio WHERE nombre = 'Productos y Servicios'), true, true);

-- Plantilla de catálogo para "Restaurante" (RN-011: se clona al crear la empresa)
INSERT INTO rubro_plantilla_catalogo (rubro_id, tipo_catalogo, nombre_item)
SELECT id, 'categoria_insumo', item FROM rubros, unnest(ARRAY[
  'Carnes','Lácteos','Abarrotes','Verduras','Bebidas','Condimentos y especias'
]) AS item WHERE rubros.nombre = 'Restaurante';

INSERT INTO rubro_plantilla_catalogo (rubro_id, tipo_catalogo, nombre_item)
SELECT id, 'categoria_producto', item FROM rubros, unnest(ARRAY[
  'Entradas','Fondos','Postres','Bebidas'
]) AS item WHERE rubros.nombre = 'Restaurante';

INSERT INTO rubro_plantilla_catalogo (rubro_id, tipo_catalogo, nombre_item)
SELECT id, 'tipo_gasto', item FROM rubros, unnest(ARRAY[
  'Alquiler','Servicios (luz/agua/internet)','Delivery','Mantenimiento','Marketing'
]) AS item WHERE rubros.nombre = 'Restaurante';

INSERT INTO rubro_plantilla_catalogo (rubro_id, tipo_catalogo, nombre_item)
SELECT id, 'unidad_medida', item FROM rubros, unnest(ARRAY[
  'kg','g','l','ml','unidad','docena'
]) AS item WHERE rubros.nombre = 'Restaurante';

-- Bancos más comunes en Perú
INSERT INTO bancos (nombre) VALUES
  ('BCP'), ('BBVA'), ('Interbank'), ('Scotiabank'), ('Banco de la Nación');

-- Roles operativos (sección 2 de la arquitectura)
INSERT INTO roles_operativos (nombre, descripcion) VALUES
  ('Gerencial', 'Ve dashboard, reportes, aprueba operaciones sensibles. Asesor, Asistente y Cliente-dueño.'),
  ('Admin Local', 'Gestiona ventas, compras, caja, CxC/CxP, gastos de su empresa.'),
  ('Cajero', 'Solo registra ventas y cobros.'),
  ('Almacén-Cocina', 'Solo actualiza stock de insumos (entradas, mermas).');

-- Permisos base por módulo (se amplía en cada sprint siguiente)
INSERT INTO permisos (modulo, accion) VALUES
  ('empresas', 'crear'), ('empresas', 'ver'), ('empresas', 'editar'),
  ('usuarios', 'crear'), ('usuarios', 'ver'), ('usuarios', 'editar'),
  ('auditoria', 'ver');

-- Asignación de permisos: por ahora solo el rol Gerencial ve auditoría
-- de su empresa (RN-005). La gestión completa de empresas queda reservada
-- al superadmin (RN-004), controlado en el código de la app, no en esta tabla.
INSERT INTO rol_permisos (rol_operativo_id, permiso_id)
SELECT
  (SELECT id FROM roles_operativos WHERE nombre = 'Gerencial'),
  (SELECT id FROM permisos WHERE modulo = 'auditoria' AND accion = 'ver');

-- =====================================================================
-- IMPORTANTE — Crear tu primer superadmin (tú):
-- 1. Ve a Supabase → Authentication → Users → Add user (crea tu usuario con email/password).
-- 2. Copia el UUID que te asigna Supabase a ese usuario.
-- 3. Reemplaza los valores de ejemplo abajo y ejecuta este INSERT:
--
-- INSERT INTO usuarios (id, nombres, apellidos, email, tipo_actor_base, es_superadmin_plataforma)
-- VALUES ('PEGA-AQUI-EL-UUID', 'Tu Nombre', 'Tu Apellido', 'tu@correo.com', 'asesor', true);
-- =====================================================================
