# ERP MYPE — Sprint 1: Núcleo multiempresa, alta de empresa, seguridad

Este es el primer sprint del sistema, construido siguiendo el orden de
`especificacion_mvp_erp_mype.md` (sección 6, punto 1). Cubre:

- Login (Supabase Auth)
- Selector de empresas del usuario (HU-03)
- Alta de nueva empresa: datos generales, tipo de negocio/rubro, moneda e IGV (HU-01, HU-02 parcial)
- Activación automática de módulos según el rubro (RN-012)
- Registro de auditoría de la creación (RN-005)

**Lo que falta para el siguiente sprint:** catálogos por empresa (clonado real de plantillas, RN-011), gestión de usuarios (asignar Asesor/Asistente/Cliente a una empresa), y el módulo de Ventas/Inventario. Cuando quieras, seguimos construyendo esto en el chat.

---

## Cómo desplegar esto SIN instalar nada en tu Mac

Todo el flujo ocurre en el navegador: GitHub (guarda el código), Supabase (base de datos y login), Vercel (pone la app en línea).

### Paso 1 — Crear el repositorio en GitHub

1. Ve a [github.com](https://github.com) y crea una cuenta si no tienes.
2. Clic en **New repository**. Nómbralo `erp-mype`, déjalo privado, crea.
3. En la página del repo vacío, usa **uploading an existing file** (link que aparece en la pantalla de bienvenida).
4. Arrastra **toda la carpeta** `erp-mype` que descargaste de este chat (todos los archivos y subcarpetas: `src/`, `prisma/`, `package.json`, etc.) y confirma el commit.

### Paso 2 — Crear el proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) → **New project**. Elige una contraseña de base de datos y guárdala.
2. Cuando el proyecto termine de crearse, ve a **SQL Editor** (menú izquierdo) → **New query**.
3. Copia y pega el contenido completo de `prisma/sprint1_nucleo.sql` → **Run**.
4. Nueva query → pega el contenido de `prisma/seed_sprint1.sql` → **Run**.
5. Ve a **Authentication → Users → Add user**, crea tu propio usuario (el que vas a usar como superadmin) con tu correo y una contraseña.
6. Copia el **UUID** que Supabase le asignó a tu usuario (aparece en la lista de usuarios).
7. Vuelve al **SQL Editor**, pega y ejecuta (reemplazando los datos de ejemplo):
   ```sql
   INSERT INTO usuarios (id, nombres, apellidos, email, tipo_actor_base, es_superadmin_plataforma)
   VALUES ('PEGA-AQUI-EL-UUID', 'Tu Nombre', 'Tu Apellido', 'tu@correo.com', 'asesor', true);
   ```
8. Ve a **Project Settings → API**: copia `Project URL` y `anon public key`.
9. Ve a **Project Settings → Database → Connection string**: copia la cadena en modo **Transaction** (para `DATABASE_URL`) y en modo **Session** (para `DIRECT_URL`).

### Paso 3 — Desplegar en Vercel

1. Ve a [vercel.com](https://vercel.com) → **Add New → Project**.
2. Conecta tu cuenta de GitHub y elige el repositorio `erp-mype`.
3. En **Environment Variables**, agrega las 5 variables de `.env.example` con los valores reales que copiaste de Supabase en el paso anterior.
4. Clic en **Deploy**. Vercel instala las dependencias y construye el proyecto en la nube — tu Mac no hace ningún trabajo en este paso.
5. Cuando termine, Vercel te da una URL pública (algo como `erp-mype.vercel.app`). Ábrela, inicia sesión con el usuario que creaste en el paso 2, y deberías ver el selector de empresas (vacío) con el botón "Dar de alta nueva empresa".

### Paso 4 — Probar el flujo

1. Inicia sesión con tu correo/contraseña de superadmin.
2. Clic en **"+ Dar de alta nueva empresa"**.
3. Llena los datos, elige rubro "Restaurante" (ya viene precargado), moneda, IGV.
4. Al confirmar, deberías volver al dashboard y ver la empresa recién creada como una tarjeta.

Si algo falla en el Paso 3 (build de Vercel), la pantalla de **Deployments → [tu deploy] → Build logs** te muestra el error exacto — cópialo y tráelo aquí al chat, lo resolvemos juntos.

---

## Cómo seguimos construyendo

Para el próximo sprint (Ventas/Inventario/Fichas técnicas), simplemente vuelve a este chat y dime que continuamos. Yo genero los archivos nuevos, tú los subes a GitHub (arrastrando los archivos nuevos/modificados a la misma pantalla de **Add file → Upload files** de tu repositorio), y Vercel vuelve a desplegar automáticamente solo.

---

## Sprint 2 — Catálogos por empresa y gestión de usuarios

Agregado sobre el Sprint 1:

- **RN-011 implementado de verdad**: al crear una empresa, ahora se clonan sus catálogos (categorías de insumo, categorías de producto, tipos de gasto, unidades de medida) desde la plantilla de su rubro, más un set estándar de métodos de pago.
- **Gestión de equipo** (HU-02): la pantalla `/empresas/[id]` (antes daba 404) ahora muestra los datos de la empresa, sus módulos activos, su equipo asignado, y un botón para crear/asignar nuevas personas (Asesor, Asistente o Cliente) con su rol operativo.
- Nueva tabla `Auditoria` sigue registrando cada alta de usuario y asignación.

### Pasos para aplicar el Sprint 2 en tu proyecto ya desplegado

1. **Sube el código nuevo a GitHub** — arrastra todos los archivos de este zip actualizado a tu repositorio (Add file → Upload files), sobrescribiendo los que ya existían y agregando los nuevos.
2. **Corre el SQL nuevo en Supabase**: ve a SQL Editor → New query → pega el contenido completo de `prisma/sprint2_catalogos.sql` → Run. Si te sale el aviso de RLS, elige **"Run and enable RLS"**, igual que en el Sprint 1.
3. Vercel va a redesplegar automáticamente al detectar el commit. Espera a que diga "Ready".
4. Entra a tu app, ve a una empresa que ya tenías creada (como "Heladería Dolas") — **como se creó antes de este sprint, no va a tener catálogos clonados** (esa parte del código no existía todavía). Para probar el flujo completo, crea una empresa nueva de prueba y entra a su detalle — ahí sí deberías ver las categorías, tipos de gasto y métodos de pago ya cargados.
5. Prueba el botón **"+ Asignar persona"** dentro del detalle de una empresa, creando un usuario de prueba tipo "Cliente" con rol "Admin Local".

---

## Sprint 3 — Ventas, Inventario, Fichas Técnicas y Mermas

El módulo más grande hasta ahora — el corazón operativo del sistema. Agregado sobre el Sprint 2:

- **Insumos**: alta de insumos por empresa, con **ajuste manual de stock** (mecanismo temporal: como el módulo de Compras llega recién en el Sprint 4, esta es la única forma de cargar stock inicial por ahora).
- **Productos con Ficha Técnica**: al crear un producto puedes marcar "requiere receta" y armar su lista de insumos con cantidades — el sistema calcula el costo real del producto en vivo (RN-020).
- **Ventas**: pantalla tipo punto de venta. Al confirmar una venta: calcula el costo de cada producto según su receta, lo **congela** en el detalle (RN-021, no se recalcula después aunque cambien los costos), **valida stock suficiente y bloquea la venta por defecto si falta** (RN-022 — decisión que tomé por ti, ver nota abajo), descuenta el inventario automáticamente (RN-023), y calcula el IGV según la configuración de la empresa (RN-025).
- **Mermas**: registro de pérdidas de insumos (vencimiento, desperdicio, robo/diferencia, otro), con su impacto económico calculado automáticamente y visible como total en la parte superior de la pantalla.

### ⚠️ Decisión que tomé por ti (RN-022)

Quedó pendiente desde el principio si el sistema debía **bloquear** o solo **alertar** cuando falta stock para vender un producto. Elegí **bloquear por defecto** (es la opción más segura, evita que el inventario quede en números negativos sin que nadie se dé cuenta), pero dejé una salida: si aparece el error de stock insuficiente al registrar una venta, sale un botón para **"Registrar de todas formas"** — así el cajero no queda trabado en medio de una venta real, pero la decisión de forzarla queda explícita y auditada. Si prefieres que sea al revés (alertar pero no bloquear nunca), dímelo y lo ajustamos.

### Pasos para aplicar el Sprint 3

1. **Sube el código nuevo a GitHub** — arrastra todos los archivos de este zip actualizado (Add file → Upload files), sobrescribiendo lo existente.
2. **Corre el SQL nuevo en Supabase**: SQL Editor → New query → pega `prisma/sprint3_ventas_inventario.sql` → Run → si sale el aviso de RLS, "Run and enable RLS".
3. Espera el redeploy automático de Vercel.
4. Entra a una empresa (mejor una nueva, para probar de cero) → **Insumos** → crea 2-3 insumos → usa "Ajustar stock" para cargarles cantidad inicial y costo.
5. Ve a **Productos** → crea uno marcando "requiere receta" → arma la receta con los insumos que acabas de cargar → confirma que el costo estimado se calcula solo.
6. Ve a **Ventas → Nueva venta** → agrega el producto al carrito → confirma la venta → verifica que el stock del insumo bajó (vuelve a Insumos y revisa).
7. Prueba **Mermas** con uno de tus insumos y confirma que también descuenta stock.

---

## Fase 1 (operación real) — Ventas diarias, Gastos/Costos, CxC, CxP, Estado de Resultados

Este bloque reemplaza la forma principal en que vas a usar el sistema día a día: **tú registras** (no el cliente) las ventas totales que te reporta el POS del cliente, y los gastos/costos según las facturas que te llegan por WhatsApp — todo alimentando un Estado de Resultados que se recalcula solo, sin necesitar "cerrar el mes".

**El módulo de Ventas por producto con fichas técnicas del Sprint 3 no se eliminó** — queda disponible bajo "Análisis detallado" en el detalle de cada empresa, para cuando quieras calcular la rentabilidad real por plato más adelante.

### Qué se agregó

- **Ventas diarias**: un formulario simple con 4 campos (Efectivo, Yape, Plin, Tarjeta) por fecha — igual a como te reporta el POS del cliente. Si ya existe un registro para esa fecha, lo actualiza en vez de duplicar.
- **Gastos y Costos**: registro clasificado (categoría + costo directo/gasto operativo + tipo de comprobante). Si lo marcas "al crédito", genera automáticamente su Cuenta por Pagar.
- **Créditos (CxC)**: registra crédito ("fiado") a un cliente — permite crear el cliente al vuelo si no existe — y marca cobros parciales o totales, actualizando el saldo automáticamente.
- **Cuentas por pagar**: lista las generadas desde Gastos, con registro de pagos parciales o totales.
- **Estado de Resultados**: se recalcula en vivo sumando Ventas diarias + Créditos otorgados − Costo directo − Gasto operativo, con selector de rango de fechas (por defecto, el mes en curso).

### Pasos para aplicar

1. **Sube el código a GitHub** — arrastra todos los archivos de este zip (Add file → Upload files), sobrescribiendo lo existente.
2. **Corre el SQL nuevo en Supabase**: SQL Editor → New query → pega `prisma/fase1_operacion_real.sql` → Run → "Run and enable RLS" si te lo pide.
3. Espera el redeploy automático de Vercel.
4. Entra a una empresa → verás dos grupos de botones: **"Registro y control financiero"** (lo nuevo, lo que vas a usar día a día) y **"Análisis detallado"** (lo del Sprint 3, para más adelante).
5. Prueba: registra un día de ventas → registra un gasto al contado y otro al crédito → ve a Cuentas por pagar y salda el que quedó a crédito → registra un crédito a un cliente nuevo en Créditos (CxC) y luego cóbralo → finalmente entra a **Estado de Resultados** y confirma que todo se refleja correctamente en el cálculo.




## Estructura del proyecto

```
erp-mype/
├── prisma/
│   ├── schema.prisma        # Modelo de datos (Sprint 1)
│   ├── sprint1_nucleo.sql   # DDL para pegar en Supabase SQL Editor
│   └── seed_sprint1.sql     # Datos iniciales (rubros, roles, bancos...)
├── src/
│   ├── app/
│   │   ├── login/           # Pantalla de login
│   │   ├── dashboard/       # Selector de empresas (HU-03)
│   │   ├── onboarding/empresa/  # Wizard de alta de empresa (HU-01)
│   │   └── api/
│   │       ├── empresas/    # POST crear empresa, GET listar visibles
│   │       └── rubros/      # GET listar rubros para el wizard
│   ├── components/ui/       # Componentes reutilizables
│   └── lib/
│       ├── auth.ts          # Resolución de permisos multiempresa (RN-001, RN-004)
│       ├── prisma.ts        # Cliente de base de datos
│       └── supabase/        # Clientes de autenticación
└── README.md                 # Este archivo
```

---

## Mejoras: Naturaleza del egreso + Locales/Centros de costo

Esto corrige un problema importante de fondo: **no todo egreso de caja es un gasto contable**. Comprar una cocina industrial (S/12,000) sale de caja, pero no es un "gasto operativo" — es un activo. Pagar una cuota de préstamo (S/5,000) también sale de caja, pero solo el interés es gasto; el capital reduce una deuda. El sistema ahora hace esta distinción automáticamente.

### Qué cambió

- **Naturaleza del egreso** (reemplaza la clasificación anterior de "costo directo / gasto"): Costo directo, Mano de obra directa, Gasto operativo, Gasto financiero, Gasto tributario, Activo/Inversión, Pago de deuda, Distribución/retiro de socios, Otros egresos extraordinarios. Solo las primeras 5 y la última afectan el Estado de Resultados — las de Activo, Deuda y Retiro de socios se registran como salida de caja pero **no** reducen la utilidad.
- **Categoría específica**: una lista corta y curada por cada naturaleza (ej. bajo "Gasto operativo": Alquiler, Servicios básicos, Marketing, Mantenimiento...) — ya no depende del catálogo vacío por rubro, así que el bug de "no me deja poner categoría" queda resuelto de raíz.
- **Caso especial préstamos**: si registras un pago de deuda y le indicas cuánto de ese monto es interés, el sistema separa automáticamente el registro en dos — capital (no afecta resultados) e interés (sí afecta, como gasto financiero) — sin que tengas que hacer dos registros manuales.
- **Locales/Centros de costo**: nueva pantalla para crear locales cuando un cliente tiene más de un punto de venta. Ventas diarias y Gastos ahora pueden asociarse a un local específico. El Estado de Resultados consolida todos los locales automáticamente por defecto, con un selector para filtrar por uno en particular si lo necesitas.
- **Estado de Resultados con estructura contable completa**: Ventas → (−) Costo de Ventas → Utilidad Bruta → (−) Gasto Operativo → Utilidad Operativa → (−) Financiero/Tributario/Otros → Utilidad Neta. Además, un bloque nuevo que responde "¿cuánto dinero salió realmente de la empresa?" (egreso de caja total), distinto de "¿cuánto de eso fue gasto?" — exactamente la distinción que pediste.

### Pasos para aplicar

1. **Sube el código a GitHub** — arrastra todos los archivos de este zip (Add file → Upload files), sobrescribiendo lo existente.
2. **Corre el SQL de migración en Supabase**: SQL Editor → New query → pega `prisma/mejoras_naturaleza_egreso_locales.sql` → Run. Es seguro de re-ejecutar si algo falla a la mitad.
3. Espera el redeploy automático de Vercel.
4. Prueba: ve a **Locales** en una empresa, crea 2 locales de prueba. Ve a **Ventas diarias** y confirma que aparece el selector de local. Ve a **Gastos y Costos**, registra un "Pago de deuda" de S/500 indicando S/50 de interés, y confirma que en el historial aparecen dos registros separados. Finalmente ve a **Estado de Resultados** y confirma que ves la estructura completa (Costo de Ventas, Utilidad Bruta, Utilidad Operativa, Utilidad Neta) más el bloque de egreso de caja.

---

## Usuarios y accesos + permisos granulares por módulo (segregación de funciones)

Dos cosas nuevas que trabajan juntas:

### 1. Pantalla global "Usuarios y accesos" (`/usuarios`)

Antes, para asignar a alguien a una empresa había que entrar a esa empresa específica. Ahora hay una pantalla central (botón en el Dashboard, solo visible para superadmin) donde:
- Creas un usuario **una sola vez** (consultor, asistente, dueño, encargado).
- Lo asignas a **una o varias empresas**, cada una con su propio nivel de acceso.
- Puedes **quitarle el acceso** a una empresa puntual sin borrar al usuario.

### 2. Permisos granulares por checkbox (reemplaza la idea de "todo o nada")

Al asignar (o editar) a alguien en una empresa, ahora eliges:
- **Acceso total** — ve y hace todo en esa empresa (equivalente a como funcionaba antes), o
- **Acceso limitado** — marcas exactamente qué módulos puede usar: Ventas diarias, Gastos y Costos, Créditos (CxC), Cuentas por pagar, Locales, Estado de Resultados, y los del análisis detallado (Ventas por producto, Productos, Insumos, Mermas).

**Esto no es solo cosmético** — el permiso se verifica de verdad en cada API del sistema. Si alguien no tiene marcado "Gastos y Costos", intentar registrar un gasto (aunque conozca la URL directa) le devuelve "No tienes permiso para acceder a esta sección". Los botones de navegación dentro de cada empresa también se ocultan automáticamente según lo que esa persona puede hacer.

### Pasos para aplicar

1. **Sube el código a GitHub** — arrastra todos los archivos de este zip (Add file → Upload files), sobrescribiendo lo existente.
2. **Corre el SQL de migración en Supabase**: SQL Editor → New query → pega `prisma/permisos_granulares.sql` → Run. Los usuarios que ya tenías asignados quedan con "Acceso total" automáticamente — no pierden nada por esta actualización.
3. Espera el redeploy automático de Vercel.
4. Prueba: ve a **Usuarios y accesos**, crea un usuario de prueba, asígnalo a una empresa con "Acceso limitado" marcando solo "Ventas diarias". Inicia sesión con ese usuario (en otra ventana/incógnito) y confirma que solo ve el botón de Ventas diarias en esa empresa, y que si intenta entrar a otra sección le sale "no encontrado" o error de permiso.

---

## RRHH (empleados y adelantos de sueldo) + Flujo de Caja por cuenta bancaria

### Qué se agregó

- **RRHH**: registra trabajadores con sus datos personales, de contrato (cargo, fecha de ingreso, tipo de contrato) y de remuneración (sueldo básico, otros ingresos, cuenta bancaria personal).
- **Adelantos de sueldo**: registra un anticipo a un trabajador. No es un gasto — es dinero que sale de caja/banco y se descuenta del sueldo más adelante. Puedes marcarlo como "descontado" cuando corresponda.
- **Cuentas bancarias + Flujo de Caja**: crea tantas cuentas (o "Caja Efectivo") como necesites, con su saldo inicial. El sistema mantiene el saldo de cada una **vivo** — se actualiza solo cada vez que un pago, cobro o adelanto se vincula a ella.
- **Conexión con lo que ya existía**: al pagar un gasto al contado, al pagar una cuenta por pagar, o al cobrar un crédito (CxC), ahora puedes elegir de/a qué cuenta bancaria corresponde — el sistema genera el movimiento y ajusta el saldo automáticamente. Si no seleccionas cuenta, el registro sigue funcionando igual que antes (no es obligatorio).

### Lo que dejé como simplificación consciente

Las **ventas diarias** (Efectivo/Yape/Plin/Tarjeta) no se conectan automáticamente a una cuenta bancaria — son el total que reporta el POS del cliente, y hacer la conciliación exacta de a qué cuenta bancaria termina entrando cada método de pago es un paso más avanzado (normalmente el banco deposita en lotes, no transacción por transacción) que dejé fuera del alcance por ahora. Si más adelante lo necesitas, se puede agregar.

### Pasos para aplicar

1. **Sube el código a GitHub** — arrastra todos los archivos de este zip (Add file → Upload files), sobrescribiendo lo existente.
2. **Corre el SQL de migración en Supabase**: SQL Editor → New query → pega `prisma/rrhh_flujo_caja.sql` → Run. Es seguro de re-ejecutar.
3. Espera el redeploy automático de Vercel.
4. Prueba: ve a **Flujo de Caja** en una empresa → crea una cuenta ("BCP" o "Caja Efectivo") con un saldo inicial → ve a **RRHH** → registra un trabajador → regístrale un adelanto de sueldo eligiendo esa cuenta → vuelve a Flujo de Caja y confirma que el saldo bajó y aparece el movimiento.
5. Prueba también: registra un gasto al contado eligiendo esa misma cuenta, y confirma que el saldo se actualiza igual.

---

## Conciliación de ventas con el banco + Caja Chica + Estado de Resultados con EBITDA

### 1. Conciliar ventas diarias con el flujo de caja

En cada registro del historial de **Ventas diarias**, ahora aparece un botón **"Actualizar flujo de caja"** (solo si ya tienes cuentas bancarias creadas) que te deja indicar a qué cuenta entró el Efectivo, el Yape, el Plin y la Tarjeta del día — cada uno puede ir a una cuenta distinta. Al confirmar, se genera el movimiento de ingreso y el saldo de esa cuenta sube automáticamente. Es a prueba de duplicados: un método de pago que ya conciliaste no se vuelve a procesar aunque abras el formulario de nuevo.

**Nota:** dejé afuera la conciliación automática — tú decides manualmente a qué cuenta fue cada monto, porque en la práctica el banco deposita en lotes (no venta por venta) y esa decisión la tienes que tomar tú mirando tu extracto real.

### 2. Caja Chica

Nueva sección completa, pensada para la segregación de funciones que pediste:

- **Crear una caja chica** con un fondo inicial, opcionalmente descontado de una cuenta bancaria (genera el egreso en el Flujo de Caja, pero *no* es un Gasto).
- **Reponer el fondo** cuando se agota.
- **Registrar gastos chicos** (quien maneja la caja) — esto reduce el fondo disponible, pero *no aparece en Gastos y Costos todavía*.
- **Clasificar y trasladar** (el administrador, cuando "cuadra" la caja): recién en este paso eliges la naturaleza del egreso y la categoría específica, y el sistema crea el Gasto real — ahí sí empieza a afectar el Estado de Resultados.

Para que esta separación funcione de verdad, usa el sistema de permisos granulares (pantalla "Usuarios y accesos"): dale a la persona que maneja la caja el permiso **"Registrar gastos de caja chica"** únicamente (sin el permiso "Gastos y Costos"), y al administrador el permiso de "Gastos y Costos" para que pueda clasificar y trasladar.

### 3. Estado de Resultados con EBITDA

La pantalla ahora muestra la estructura completa:

```
Ventas totales
(−) Costo de Ventas
= Utilidad Bruta               (con margen %)
(−) Gasto Operativo
= EBITDA                        (con margen %)
(−) Depreciación y Amortización (en S/ 0.00 hasta que exista Activos Fijos)
= Utilidad Operativa (EBIT)     (con margen %)
(−) Gasto Financiero
= Utilidad Antes de Impuestos (EBT)
(−) Gasto Tributario
(−) Otros Egresos
= Utilidad Neta                 (con margen %)
```

### Pasos para aplicar

1. **Sube el código a GitHub** — arrastra todos los archivos de este zip (Add file → Upload files), sobrescribiendo lo existente.
2. **Corre el SQL de migración en Supabase**: SQL Editor → New query → pega `prisma/conciliacion_caja_chica.sql` → Run.
3. Espera el redeploy automático de Vercel.
4. Prueba: en Ventas diarias, concilia un registro existente con una cuenta → confirma que el saldo sube en Flujo de Caja. Luego ve a Caja Chica, crea una con fondo desde una cuenta bancaria, registra un gasto chico, y como administrador clasifícalo y traslada — confirma que aparece en Gastos y Costos y en el Estado de Resultados. Finalmente revisa que el Estado de Resultados muestre la línea de EBITDA.

---

## Ajustes de seguridad y de visualización

Sin cambios en el modelo de datos esta vez (no hay SQL nuevo que correr) — solo lógica y pantallas.

### 1. Flujo de Caja: reporte agrupado por banco y por día

La lista de movimientos ya no es un listado plano — ahora cada cuenta bancaria es una sección plegable (clic para abrir/cerrar), y dentro de cada una, los movimientos están agrupados por día con su neto (ingresos − egresos) visible de un vistazo.

### 2. Conciliar ventas diarias: ahora requiere ser superadmin

El botón "Actualizar flujo de caja" en Ventas diarias solo aparece si el usuario logueado es el superadmin de la plataforma — nadie más puede mover saldos de cuentas bancarias desde ahí, aunque tenga el permiso "Flujo de Caja" asignado. El indicador de qué método de pago ya se registró también se hizo más visible (✓ + nombre del banco).

### 3. "Equipo asignado" ya no se muestra a usuarios tipo Cliente

Solo el superadmin, un Asesor o un Asistente ven la sección de equipo dentro de una empresa. Un dueño, cajero, o encargado de caja chica (tipo "Cliente") ahora solo ve los botones de las transacciones a las que tiene acceso — sin ver quién más está asignado a la empresa.

### 4. Caja Chica: "Clasificar y trasladar" restringido a superadmin o Asesor

La persona que registra gastos de caja chica (tipo Cliente, con el permiso "Caja Chica") solo puede registrar — nunca ve el botón de clasificar/trasladar. Ni siquiera un Asistente puede hacerlo: es exclusivo de superadmin o Asesor, tal como pediste. Quien no puede clasificar ve una nota explicando que está pendiente de que el superadmin o un Asesor lo revise.

### Pasos para aplicar

1. Sube el zip completo a GitHub (sobrescribe lo existente) — no hay SQL que correr esta vez.
2. Espera el redeploy de Vercel.
3. Prueba con un usuario tipo "Cliente" (crea uno de prueba en Usuarios y accesos si no tienes): confirma que no ve "Equipo asignado", que si tiene acceso a Caja Chica solo ve el botón de registrar (no "Clasificar y trasladar"), y que en Ventas diarias no ve el botón de conciliar aunque tenga el permiso de Flujo de Caja.
4. Revisa el Flujo de Caja de una empresa con movimientos y confirma que ahora se ve organizado por banco y por día.

---

## Ajustes finos de seguridad y organización

Sin cambios en la base de datos — solo lógica de permisos y presentación sobre datos que ya existían.

### 1. Flujo de Caja: movimientos agrupados por cuenta y por día

En vez de una lista larga y plana, los movimientos ahora se agrupan primero por cuenta bancaria, y dentro de cada cuenta, por día — con el total de ingresos y egresos de cada día a la vista.

### 2. Conciliar ventas diarias: ahora solo el superadmin puede hacerlo

El botón "Actualizar flujo de caja" en Ventas diarias ya no aparece para nadie más que tú. Además, cada método de pago que ya se conciliaron muestra a qué cuenta entró (y no se puede volver a registrar).

### 3. "Equipo asignado" ya no lo ve cualquiera

Solo el superadmin, los Asesores y los Asistentes ven la sección de equipo dentro de una empresa. Si entra alguien tipo "Cliente" (dueño, cajero, encargado de local, etc.), esa sección directamente no aparece — solo ve los módulos/transacciones que tiene asignados.

### 4. Caja Chica: la persona que la maneja solo registra gastos

Si alguien tiene el permiso "Registrar gastos de caja chica" pero no es superadmin ni Asesor, en la pantalla de Caja Chica solo puede: crear su gasto chico. No ve los botones de "Nueva caja chica" ni "Reponer fondo" (esos requieren el permiso de Flujo de Caja), y en los gastos pendientes de clasificar ve un mensaje explicando que están esperando a que el superadmin o un Asesor los traslade — en vez de un botón que le fallaría al hacer clic.

### Pasos para aplicar

1. Sube el código a GitHub (sobrescribe lo existente) — no hay SQL nuevo que correr esta vez.
2. Espera el redeploy de Vercel.
3. Prueba: entra con un usuario tipo "Cliente" a una empresa y confirma que no ve "Equipo asignado". Si tienes un usuario con solo el permiso de Caja Chica, confirma que solo ve el botón de registrar gasto.

---

## Tipo y número de documento en Caja Chica (y en Gastos y Costos)

### Qué se agregó

- Al registrar un gasto de **Caja Chica**, ahora eliges el **tipo de documento** (Boleta, Factura, Nota de venta, Recibo por honorarios, Ticket, Sin comprobante) y puedes anotar el **número** (ej. `B001-00123`).
- Ese número **se traslada automáticamente** al Gasto real cuando el superadmin/Asesor lo clasifica y traslada — no se pierde el dato.
- De paso, agregué el mismo campo de número al formulario principal de **Gastos y Costos**, para que quede consistente en todo el sistema.
- Se agregó **"Nota de venta"** como tipo de documento válido en ambos formularios — es un comprobante común en compras pequeñas a proveedores informales.

### Pasos para aplicar

1. **Sube el código a GitHub** — arrastra todos los archivos de este zip (Add file → Upload files), sobrescribiendo lo existente.
2. **Corre el SQL de migración en Supabase**: SQL Editor → New query → pega `prisma/numero_comprobante.sql` → Run.
3. Espera el redeploy automático de Vercel.
4. Prueba: registra un gasto de caja chica con tipo "Boleta" y número "B001-00123" → clasifícalo y traslada → confirma que en Gastos y Costos aparece con ese mismo número.

---

## Caja Chica: crear/reponer fondo restringido a Asesor/superadmin

Los botones **"+ Nueva caja chica"** y **"Reponer fondo"** ya no aparecen para quien solo tiene el permiso "Registrar gastos de caja chica" — esas dos acciones mueven dinero real de una cuenta bancaria, así que quedan reservadas a quien tenga acceso a "Flujo de Caja" (Asesor/superadmin, o cualquiera con acceso total). Antes el botón se veía pero fallaba al hacer clic; ahora directamente no aparece para quien no puede usarlo.

No hay SQL nuevo — solo un cambio de interfaz. Sube el zip completo a GitHub y espera el redeploy.
