# Proyecto DSD — Suite de Pruebas Automatizadas con Selenium

## Información del Proyecto
- **Estudiante:** Valentina Varela Zumbado
- **Empresa:** Design and Software Development S.A.
- **Universidad:** Universidad Latina
- **Sistema probado:** TallerAlpha ERP

## Descripción
Suite de pruebas automatizadas desarrollada en JavaScript con Selenium WebDriver para garantizar la calidad del sistema web TallerAlpha ERP.

## Tecnologías utilizadas
- Node.js
- Selenium WebDriver
- JavaScript
- Google Chrome

## Instalación
1. Instalar Node.js desde https://nodejs.org
2. Clonar o descargar el proyecto
3. Abrir la terminal en la carpeta del proyecto
4. Ejecutar: npm install
5. Copiar `.env.example` a `.env` y completar los valores reales:
   ```bash
   cp .env.example .env
   ```
   Editar `.env` con la URL base y credenciales del entorno de QA:
   ```
   QA_BASE_URL=https://dev.designsoftcr.com/qa_talleralpha/public
   QA_EMAIL=qadesignsoftcr@gmail.com
   QA_PASSWORD=qa0000
   ```
   `.env` está en `.gitignore` — nunca se sube a GitHub porque contiene credenciales reales. `config.js` en la raíz lee estas variables (vía `dotenv`) y expone `BASE_URL`, `LOGIN_URL`, `DASHBOARD_URL`, `EMAIL` y `PASSWORD` para que `auth/generar-sesion.js`, `auth/test-sesion.js` y cualquier CP nuevo las importen en vez de hardcodearlas. **CP-001 a CP-127 no usan `config.js`** — siguen con sus credenciales hardcodeadas como patrón legacy, no se tocan.

## Cómo ejecutar las pruebas

### Ejecutar un caso de prueba individual
La suite activa (Playwright) vive en `tests-playwright/`, organizada en subcarpetas por módulo → submódulo del sistema real (ver tabla de "Estructura de carpetas" más abajo). Para correr un caso, apuntar a su ruta completa:
```bash
node tests-playwright/00-acceso/01-login/cp001-login-valido.js
node tests-playwright/00-acceso/01-login/cp002-login-invalido.js
node tests-playwright/00-acceso/02-dashboard/cp005-carga-dashboard.js
node tests-playwright/02-gestion-taller/01-recepcion-vehiculo/cp006-acceso-recepcion-vehiculo.js
node tests-playwright/02-gestion-taller/02-taller-basico/cp017-carga-tablero-ordenes.js
node tests-playwright/01-facturar/01-pos-basico/cp031-carga-modulo-pos.js
node tests-playwright/03-rutas/01-admin-rutas/cp128-carga-modulo-rutas.js
node tests-playwright/01-facturar/09-ruteo-pos/cp137-carga-tab-ruteo-pos.js
```
(La suite histórica en Selenium vive en `tests/selenium-backup/` como respaldo — ya no se ejecuta ni se modifica.)

### Estructura de carpetas de `tests-playwright/`

Cada CP nuevo debe ubicarse en la subcarpeta de su módulo/submódulo real (ver sección "Convención de carpetas para CPs nuevos" en `CLAUDE_CONTEXT.md`), nunca suelto en la raíz.

| Módulo | Submódulo | Rango de CPs | Ruta de carpeta |
|--------|-----------|--------------|------------------|
| 00-acceso | 01-login | CP-001 – CP-004 | `tests-playwright/00-acceso/01-login/` |
| 00-acceso | 02-dashboard | CP-005 | `tests-playwright/00-acceso/02-dashboard/` |
| 01-facturar | 01-pos-basico | CP-031 – CP-057, CP-196 | `tests-playwright/01-facturar/01-pos-basico/` |
| 01-facturar | 02-pos-avanzado | CP-058 – CP-073 | `tests-playwright/01-facturar/02-pos-avanzado/` |
| 01-facturar | 03-factura-credito | CP-074 – CP-083 | `tests-playwright/01-facturar/03-factura-credito/` |
| 01-facturar | 04-proforma-cotizaciones | CP-084 – CP-098 | `tests-playwright/01-facturar/04-proforma-cotizaciones/` |
| 01-facturar | 05-apartados | CP-099 – CP-103 | `tests-playwright/01-facturar/05-apartados/` |
| 01-facturar | 06-cierre-caja | CP-104 – CP-108 | `tests-playwright/01-facturar/06-cierre-caja/` |
| 01-facturar | 07-ordenes-caja-taller | CP-109 – CP-125 | `tests-playwright/01-facturar/07-ordenes-caja-taller/` |
| 01-facturar | 08-metodos-pago-generales | CP-126 – CP-127 | `tests-playwright/01-facturar/08-metodos-pago-generales/` |
| 01-facturar | 09-ruteo-pos | CP-137 – CP-145, CP-183 – CP-192 | `tests-playwright/01-facturar/09-ruteo-pos/` |
| 01-facturar | 11-end-pintura | CP-171 – CP-172 | `tests-playwright/01-facturar/11-end-pintura/` |
| 01-facturar | 12-productos-externos | CP-177 – CP-182 | `tests-playwright/01-facturar/12-productos-externos/` |
| 01-facturar | 13-crear-cliente-pos | CP-193, CP-195, CP-197 – CP-199 | `tests-playwright/01-facturar/13-crear-cliente-pos/` |
| 02-gestion-taller | 01-recepcion-vehiculo | CP-006 – CP-016 | `tests-playwright/02-gestion-taller/01-recepcion-vehiculo/` |
| 02-gestion-taller | 02-taller-basico | CP-017 – CP-030 | `tests-playwright/02-gestion-taller/02-taller-basico/` |
| 03-rutas | 01-admin-rutas | CP-128 – CP-136 | `tests-playwright/03-rutas/01-admin-rutas/` |
| 04-panel-control | 01-general | CP-146 – CP-176 | `tests-playwright/04-panel-control/01-general/` |
| 05-demo-defensa | 01-general | CP-194 | `tests-playwright/05-demo-defensa/01-general/` |

Nota: "01-facturar/09-ruteo-pos" (órdenes de ruteo creadas desde el POS) es un módulo distinto de "03-rutas/01-admin-rutas" (administración de rutas/zonas/clientes/repartidores) — ver la distinción completa en `CLAUDE_CONTEXT.md` secciones 14 y 15. "01-facturar/11-end-pintura" es el wizard de enderezado y pintura dentro del POS (pestaña "End. Pintura"), también distinto de ambos.

"04-panel-control" (`/sett/setting`) — **módulo completo al 100%** (CP-146–CP-176): Bloque A (carga/navegación), Bloque B (18/18 secciones del acordeón Dashboard, CP-150–CP-175, salvo "Consecutivos Comprobantes" que no renderiza campos en este ambiente), Bloque C (tab "Tienda online", CP-176), Bloque D (hallazgos iniciales). CP-176 documenta un hallazgo: el botón "Guardar cambios" de Tienda online no es funcional en este entorno (mismo patrón que el tab Twilio). Ver también el hallazgo de integridad de datos entre compañías en `#company_store_online_select`, documentado en `CLAUDE_CONTEXT.md` sección 19.

"01-facturar/12-productos-externos" (modal "AGREGAR PRODUCTO EXTERNO" del carrito del POS, `#add_sc_product`) — 6 CPs (CP-177–CP-182) cubriendo los flujos de cliente existente/solo-nombre, producto rápido, descuento general, exoneración y crédito combinados con un producto externo. **⚠️ Hallazgo de alta prioridad confirmado (2026-07-19)**: al agregar un producto externo (Costo + Utilidad% ≥25 + un impuesto/tarifa seleccionados) y confirmar con el botón real "Agregar" del SweetAlert, el monto que queda en el carrito NO coincide con el calculado correctamente en el propio modal — aparece un total absurdamente alto (observado repetidas veces en el rango de decenas de miles de millones de colones/dólares). Por esta razón, **ninguno de los 6 CPs confirma el pago final** (no se hace clic en "Enviar a caja"/`make_payment`) para no dejar facturas con montos corruptos persistidas en el ambiente compartido de QA; cada CP documenta el hallazgo y detiene el flujo justo después de abrir el modal de pago. Ver detalle completo en `CLAUDE_CONTEXT.md` sección 21.

"01-facturar/09-ruteo-pos" — tablero de órdenes de ruteo dentro del POS (`#btn_routing_option`), 10 CPs adicionales (CP-183–CP-192) cubriendo el menú de acciones en lote (botón more_vert): Imprimir/Descargar PDF por tab-filtro, selección múltiple + Enviar a Ruteo/Cambiar Repartidor/Eliminar en lote, Limpiar selección, "Seleccionar todos" (validado de forma segura y reversible, sin confirmar acciones destructivas sobre órdenes ajenas del ambiente compartido), filtros avanzados (Provincia/Cantón/Distrito/Fecha) y el hallazgo de que no existe un buscador de órdenes por texto libre. **⚠️ Incidente documentado (2026-07-19)**: el aislamiento inicial de CP-185 por fecha de creación eliminó 9 órdenes preexistentes ajenas junto con las 2 de prueba; CP-186 en adelante usan aislamiento por diferencia exacta de IDs (snapshot antes/después). Ver detalle completo en `CLAUDE_CONTEXT.md` sección 15.

"01-facturar/13-crear-cliente-pos" (modal "Agregar Cliente" del POS, `#dialog_add_customer`, abierto vía el botón "Agregar" junto al buscador de cliente → opción "Nuevo Cliente" `#add_quick_customer`) — 5 CPs (CP-193, CP-195, CP-197–CP-199) cubriendo los 3 tabs del modal (Principal/Opciones avanzadas/Ubicación): cliente sencillo (CP-193), cliente completo con los 3 tabs llenos (CP-195), cliente completo con múltiples actividades económicas secundarias (CP-199), cliente completo con información de vehículo completa (CP-197) y cliente sencillo con información de vehículo mínima (CP-198). Todos verifican persistencia real reabriendo el cliente creado vía el ícono de edición (`.i_edit_customer`), no solo el panel de la venta actual. Ver hallazgos técnicos (widget Chosen para selects, `<select>` de Modelo dependiente de Marca vía AJAX, campo "Nombre" como gate de navegación entre tabs) en `CLAUDE_CONTEXT.md` sección 25.

"05-demo-defensa/01-general" (CP-194) — **no es un CP de cobertura/QA**: es una narrativa visual que encadena flujos ya validados de la suite, pensada para presentarse en vivo en la defensa de proyecto final. Estructurada en 4 bloques independientes controlados por la constante `BLOQUES_A_EJECUTAR` al inicio del archivo, cada uno pensado para cerrar una idea completa por sí solo (la demo se puede cortar entre bloques sin verse inconclusa): **Bloque 1** (Login + Dashboard → Recepción de vehículo nuevo con cliente y vehículo, ✅ implementado), **Bloque 2** (Torre de Control: localizar la orden recién creada en el tablero — redefinido con aprobación del usuario desde "cambio de etapa", ya que este ambiente no tiene un mecanismo confiable de drag-and-drop entre columnas; ✅ implementado), **Bloque 3** (Facturación POS, ⏸️ pendiente) y **Bloque 4** (Cierre de caja, ⏸️ pendiente) — ambos bloqueados por el hallazgo crítico de montos corruptos (`CLAUDE_CONTEXT.md` sección 22), que seguía activo la última vez que se verificó. Ver diseño completo, hallazgos del wizard de recepción y del tablero, y criterio de redefinición del Bloque 2 en `CLAUDE_CONTEXT.md` sección 23.

"01-facturar/01-pos-basico/cp196..." — refuerza CP-055 (que solo verificaba que el tab "Tienda en línea" del POS cargara). CP-196 interactúa con el contenido real de ese tab: el panel lateral "Seguimiento" de pedidos de la tienda en línea (distinto del tab "Tienda online" de Panel de Control, que es configuración). Ver hallazgo del dropdown de estados contextual y el gap de datos (0 órdenes reales) en `CLAUDE_CONTEXT.md` sección 24.

Nota sobre cobertura — sección "Consecutivos Comprobantes": esta sección del acordeón del Panel de Control es visible y clicable en el mismo ambiente QA de Costa Rica que usa toda la suite, pero al expandirla no renderiza ningún campo porque su contenido depende de un tenant de Honduras que no existe en este ambiente. Es un gap de cobertura real (no se puede ejercer ni validar esa funcionalidad puntual con los datos de QA disponibles), documentado en `CLAUDE_CONTEXT.md` sección 19 — distinto de las funcionalidades exclusivas de Costa Rica (Hacienda, Factura Electrónica CR, exoneraciones, etc.), que sí están correctamente cubiertas porque el ambiente QA es costarricense y esas SÍ son el alcance esperado del proyecto.

## Autenticación en las pruebas

- **CP-001 a CP-127**: login individual completo en cada script (llenar `#email`/`#password`, click en `#loginButton`, esperar `**/dashboard**`). Es el patrón "legacy" — no se toca, ya está probado y funcionando.
- **CP-128 en adelante**: usan sesión reutilizable vía `storageState` (Playwright) en lugar de loguearse de cero en cada script. El sistema vive en `auth/`:
  - `auth/generar-sesion.js` — hace login una vez y guarda la sesión en `auth/sesion-qa.json` (ignorado por git, contiene tokens activos).
  - `auth/usar-sesion.js` — expone `abrirContextoConSesion(browser)`: reutiliza la sesión si tiene menos de 2 horas, o la regenera automáticamente si no existe o está vencida.
  - Uso en un CP nuevo — desde que la suite quedó organizada en `tests-playwright/modulo/submodulo/`, cada CP está 2 niveles más profundo que la raíz de `tests-playwright/`, por lo que el require de `auth/usar-sesion` necesita **3** `../` (no 1):
    ```js
    const { abrirContextoConSesion } = require('../../../auth/usar-sesion');
    const context = await abrirContextoConSesion(browser);
    const page = await context.newPage();
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/dash/dashboard',
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    ```
  - Si la navegación redirige a `/log/login` (sesión expirada en el servidor), el CP debe borrar `auth/sesion-qa.json`, regenerar con `abrirContextoConSesion()` y reintentar la navegación una sola vez antes de fallar.
  - `auth/test-sesion.js` valida el flujo completo (generación automática + reutilización) y sirve de referencia.
  - `auth/usar-sesion.js` también expone `refrescarConCacheLimpia(page)`: limpia la caché de red del navegador vía CDP (`Network.clearBrowserCache` + `Network.setCacheDisabled`) y recarga la página, sin afectar cookies ni la sesión activa. Se usa en los CPs del módulo Ruteo (CP-128 en adelante) justo después de navegar al módulo y antes de la lógica de cada prueba, para evitar que HTML/JS cacheado de una corrida anterior interfiera con la siguiente:
    ```js
    const { abrirContextoConSesion, refrescarConCacheLimpia } = require('../../../auth/usar-sesion');
    const context = await abrirContextoConSesion(browser);
    const page = await context.newPage();
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/route/adminRoute',
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await refrescarConCacheLimpia(page);
    // ... lógica del CP ...
    ```
  - Mismo criterio aplica a las rutas de screenshots en fallo (`path.join(__dirname, '..', '..', '..', 'reports', 'screenshots')`, 3 niveles en vez de 1) — ver el patrón completo en cualquier CP existente dentro de `tests-playwright/`.

## Reporte de tiempos de ejecución

Desde el 2026-07-08, todo CP nuevo (CP-146 en adelante) registra su tiempo total de ejecución vía `utils/registrar-tiempo.js`:
- `registrarResultado({ cp, modulo, estado, tiempoMs })` se llama una vez al final de cada CP (tanto en el camino de éxito como en el catch de fallo) y agrega una línea a `reports/tiempos-ejecucion.json` (número de CP, módulo/submódulo, estado `pass`/`fail`, tiempo en ms y timestamp).
- `moduloDesdeRuta(__dirname)`, exportado desde el mismo archivo, deriva el módulo/submódulo automáticamente a partir de la ubicación del CP — no hace falta escribirlo a mano.
- **CP-001 a CP-145 no llaman a `registrarResultado()`** — no se modificaron para no tocar CPs ya congelados; el reporte solo cubre CPs nuevos de aquí en adelante.

Para generar el reporte HTML a partir del historial acumulado:
```bash
node utils/generar-reporte-tiempos.js
```
Esto lee `reports/tiempos-ejecucion.json` y genera `reports/reporte-tiempos.html` con:
- Los 10 CPs más lentos, destacados.
- Promedio de tiempo por módulo/submódulo.
- Tabla completa de todos los CPs registrados, con badge ✅/⚠️/❌ según los mismos umbrales ya usados en el proyecto (`evaluarCargaPagina`/`evaluarAccion`: ⚠️ &gt; 3000ms, ❌ &gt; 8000ms, aplicados aquí al tiempo total del CP).

`reports/tiempos-ejecucion.json` y `reports/reporte-tiempos.html` están en `.gitignore` (son datos locales/regenerables de cada máquina, igual que `reports/screenshots/`).

## Casos de prueba implementados

| Código | Descripción | Estado |
|--------|-------------|--------|
| CP-001 | Login con credenciales válidas | ✅ |
| CP-002 | Login con contraseña incorrecta | ✅ |
| CP-003 | Login con campos vacíos | ✅ |
| CP-004 | Login con usuario inexistente | ✅ |
| CP-005 | Carga del dashboard | ✅ |
| CP-006 | Acceso al módulo de Recepción de Vehículo | ✅ |
| CP-007 | Agregar cliente nuevo con solo el nombre | ⚠️ |
| CP-008 | Asignar mecánico al agregar un servicio | ✅ |
| CP-009 | Modal de confirmación al guardar la recepción | ⚠️ |
| CP-010 | Cancelar la generación de orden regresa a la recepción | ✅ |
| CP-017 | Cargar el tablero de órdenes y mostrar el buscador | ✅ |
| CP-018 | Buscar órdenes desde el tablero | ⚠️ |
| CP-019 | Crear una nueva sección en el tablero | ✅ |
| CP-020 | Interactuar con el botón de configuración del tablero | ✅ |
| CP-011 | Modal de WhatsApp al generar la orden | ⚠️ |
| CP-012 | Búsqueda de órdenes por placa | ⚠️ |
| CP-013 | Búsqueda de órdenes por nombre de cliente | ⚠️ |
| CP-014 | Cambio de vista de lista a caja | ✅ |
| CP-015 | Cambio de sucursal desde el selector | ✅ |
| CP-016 | Chat interno de una orden | ⚠️ |
| CP-026 | Descargar PDF de una orden desde el menú de tres puntos (Recepción) | ✅ |
| CP-027 | Ver orden online desde Opciones avanzadas del menú de tres puntos | ✅ |
| CP-028 | Ver bitácora de una orden desde Opciones avanzadas | ✅ |
| CP-029 | Desactivar una orden de prueba desde Opciones avanzadas | ✅ |
| CP-030 | Eliminar una orden de prueba desde Opciones avanzadas | ✅ |
| CP-031 | Carga del módulo POS (Facturar): compañía, categorías y productos | ✅ |
| CP-032 | Buscar un producto en el POS | ✅ |
| CP-033 | Agregar un producto al carrito con precio correcto | ✅ |
| CP-034 | Asociar un cliente a la factura del POS | ✅ |
| CP-035 | Generar una cotización (Proforma) desde el POS | ✅ |
| CP-036 | Generar un apartado desde el POS | ✅ |
| CP-037 | Facturación de contado en efectivo (datos propios) | ✅ |
| CP-038 | Facturación a crédito (datos propios) | ⚠️ |
| CP-039 | Historial de facturas en el tab (F5) Importar factura | ✅ |
| CP-040 | Lista de apartados en el tab (F7) Apartados | ✅ |
| CP-041 | Panel de totales del carrito (subtotal, IVA, descuento, devolución, utilidad, total) | ✅ |
| CP-042 | Aplicar porcentaje de descuento al carrito | ✅ |
| CP-043 | Selector de moneda (Colón, Dólar, Euro, Peso Dominicano) | ✅ |
| CP-044 | Selector de formato de impresión de factura (9 formatos) | ✅ |
| CP-045 | (F12) Abrir/Cerrar Caja | ✅ |
| CP-046 | (F9) Movimientos de caja | ✅ |
| CP-047 | (F8) Historial Mov. de Caja | ⚠️ |
| CP-048 | Vista lista/grilla de productos en el buscador | ✅ |
| CP-049 | Filtros de Vehículos (Marca, Modelo, Año, Transmisión, Motor, Categoría) | ✅ |
| CP-050 | Menú de tres puntos del carrito | ✅ |
| CP-051 | Producto Rápido (depende de selección de código CABYS) | ⚠️ |
| CP-052 | Vaciar carrito | ✅ |
| CP-053 | Tab (F2) Órdenes de caja | ✅ |
| CP-054 | Tab (F3) Taller | ✅ |
| CP-055 | Tab Tienda en línea | ✅ |
| CP-056 | Tab Ruteo | ✅ |
| CP-057 | Tab (F4) Cotización (listado) | ✅ |
| CP-058 | Facturar producto existente gravado (con IVA) | ✅ |
| CP-059 | Facturar producto existente exento (sin IVA) | ✅ |
| CP-060 | Deshabilitar/habilitar la impresión (F8) y generar facturas en ambos estados | ✅ |
| CP-061 | Facturar con múltiples métodos de pago (efectivo + tarjeta) | ✅ |
| CP-062 | Facturar con un solo método de pago (tarjeta) | ✅ |
| CP-063 | Agregar productos a una orden existente (Taller) y facturar | ✅ |
| CP-064 | Agregar productos a una factura importada y facturar | ✅ |
| CP-065 | Agregar productos al carrito en formato lista | ✅ |
| CP-066 | Agregar productos al carrito en formato cuadrícula | ✅ |
| CP-067 | Agregar comentario a un producto y facturar como Factura Electrónica | ✅ |
| CP-068 | Agregar comentario a un producto y facturar como Tiquete Electrónico | ✅ |
| CP-069 | Activar Factura por Contingencia y facturar (Tiquete Electrónico; Factura Electrónica queda bloqueada por validación de cliente) | ✅ |
| CP-070 | Activar "Facturar al ICE" y validar aceptación por Hacienda (Factura Electrónica bloqueada; venta completada con Tiquete Electrónico; estado Hacienda no resuelto en ~75s) | ⚠️ |
| CP-071 | Aplicar exoneración (2 productos: gravado x2 + exento x1) y validar aceptación por Hacienda (monto exonerado = IVA exacto, confirmado; Factura Electrónica bloqueada; venta completada con Tiquete Electrónico; estado Hacienda no resuelto en ~75s) | ⚠️ |
| CP-072 | Verificar planillas de factura en Configuración → Admin. factura (tabs Factura/Proforma/Ticket, 36 opciones de plantilla, guardado: todo responde correctamente) — hallazgo de performance: la página tarda 12-18s en cargar (umbral ❌ es 8000ms), "Guardar" también lento (~7s) | ⚠️ |
| CP-073 | Factura a crédito: 3 productos (AAA-Multímetro x1 gravado, AAA-Bombillos x1 exento, AA-Maletero x1 fracción) en colones — script verificado via inspección (defecto CP-038 corregido, crédito funciona, diálogo fraccionado usa prod_frag_q). Pendiente re-correr: el entorno QA estaba inestable (renderer crashes, carga POS >20s) al momento de generar este CP. | ⚠️ |
| CP-074 | Factura a crédito con 3 productos normales + 1 fraccionado (AA-Maletero) en colones — cliente 12735, switch_payment_type(2), validación saldo pendiente en /credit_sale/clientCreditSales | ✅ |
| CP-075 | Factura a crédito con producto rápido (CABYS fallback a catálogo) en dólares — IVA gravado + exento, conversión de moneda | ✅ |
| CP-076 | Factura a crédito + abono inicial: 3 productos colones, ingresa abono, valida saldo restante = total − abono (tolerancia ±1) | ✅ |
| CP-077 | Factura a crédito con descuento global: producto normal + rápido + fraccionado, descuento 10% sobre total, valida cálculo ±1 | ✅ |
| CP-078 | Abono a factura de crédito existente: busca cliente en /credit_sale/clientCreditSales, aplica abono via pay_customer_invoice(), valida saldo actualizado ±1 | ✅ |
| CP-079 | Abono a factura de crédito + verificar en Movimientos de Caja (F9): abono 20% del saldo, verifica que el POS registre el movimiento | ⚠️ |
| CP-080 | Abono con 2 métodos de pago (efectivo 15% + tarjeta 10%): navega con Ctrl+B, aplica ambos abonos, valida matemática acumulada ±1 | ✅ |
| CP-081 | Descuento general 15% en factura a crédito: 3 productos colones, descuento via total_discount_input, valida reducción ±1 (₡37,540 → ₡31,909) | ✅ |
| CP-082 | Descuento por línea en factura: 3 productos colones, intenta descuento vía input_product_discount_* (disabled por servidor), pago en efectivo (crédito del cliente agotado); limpieza de carrito lazy via trigger+delete | ✅ |
| CP-083 | Límite de crédito del cliente: consulta saldo (₡66M acumulado), intenta venta a crédito, detecta "Not valid!" como BLOQUEO_DETECTADO del límite | ✅ |
| CP-084 | Historial de proformas (/proform/printPosProform): valida header "Cotizaciones", 7 elementos clave (receip_search, fechas, btn_search, 3 tabs tipo), Buscar funcional | ✅ |
| CP-085 | Búsqueda en historial de proformas por código/número: usa receip_search + btn_search_receip, valida que el filtro se aplica | ✅ |
| CP-086 | Proforma con cliente seleccionado: POS F4 → show_create_proform_modal() → dialog_proform, campo customer_proform_select, confirma con "Crear Proforma" | ✅ |
| CP-087 | Proforma con productos del catálogo (fallback de rápidos): POS F4, 2 productos colones, modal dialog_proform, "Crear Proforma" | ✅ |
| CP-088 | Proforma mixta en dólares: 2 productos existentes (Multímetro + Filtros), $123.26, "Crear Proforma" | ✅ |
| CP-089 | Proforma con producto exento: AAA-Bombillos (exento) + AAA-Multímetro (gravado), crea proforma desde F4 | ✅ |
| CP-090 | Proforma con descuento general 15%: 3 productos, total_discount_input, validación ±1 (₡56,285 → ₡47,842.25), luego crea proforma | ✅ |
| CP-091 | Proforma con descuentos individuales: 3 productos, intenta input_product_discount_TOKEN en modal (disabled server-side — limitación documentada), confirma "Crear Proforma" | ✅ |
| CP-092 | Lista de precios en proforma normal: descubre 7 listas via menu_price_list, aplica "50% Descuento mayorista" via set_current_pos_price_list(185), valida precios carrito↔modal ±1 (productos AAA-* sin precio alternativo en QA), crea proforma | ✅ |
| CP-093 | Lista de precios en proforma por consignación: aplica lista ID 186, activa ck_is_consignment_invoice (ck_is_proform__invoice se desmarca automáticamente), valida precios ±1, verifica tab "Prof. de Consignación" en historial | ✅ |
| CP-094 | Proforma de taller convertida a orden: activa ck_is_workshop_proform, crea "Prof. de Taller", verifica tab en historial; botón de conversión a orden no encontrado en DOM — flujo documentado como no automatizable con onclick visible | ✅ |
| CP-095 | Crear consignación normal: ck_is_consignment_invoice activado (exclusivo), total modal ₡56,185 = total POS, "Crear Proforma", tab "Prof. de Consignación" en historial con registros | ✅ |
| CP-096 | Crear orden de consignación de taller: moneda dólares, ck_is_workshop_proform activado (exclusivo), $123.26, "Crear Proforma", tab "Prof. de Taller" con registros; input_product_edit_price_ muestra precio base sin IVA (diff ~13%) | ✅ |
| CP-097 | Imprimir proforma: get_receip_detail(id) → panel de detalle → downloadProformPdf(id, true); popup capturado con "COTIZACIÓN N° 144", empresa, fechas y cliente; performance deficiente (~6 min renderizado PDF) | ⚠️ |
| CP-098 | Comando rápido Shift+P en POS: abre #dialog_proform directamente (shortcut nativo confirmado), 2 productos del carrito en modal, tipo proforma por defecto, total ₡56,135, confirmado con "Crear Proforma" | ✅ |
| CP-099 | Generar apartado sin abono inicial: go_to_layaway_sale() → dialog_payment → confirm_add_layaway() sin pago; tab F7 (make_layaway_payment) confirma registro; payment_cash_total=0 | ✅ |
| CP-100 | Generar apartado con abono inicial: payment_cash_total=105 (30% de ₡350), confirm_add_layaway(), tab F7 activo; saldo esperado ₡245; validación exacta limitada por múltiples apartados en QA | ✅ |
| CP-101 | Aplicar abono a apartado existente: add_pos_layaway_to_table(521) carga ítems → go_to_layaway_sale() → dialog_payment con total_sale_txt=₡1,374 + initial_payment_change; abono ₡274.8 via payment_cash_total → confirm_add_layaway(); saldo ₡1,099.2 no aislado en vista lista | ⚠️ |
| CP-102 | Verificar cálculos en apartados: apartado #521 cargado desde F7, total_F7=total_sale_txt=₡1,374 (±0), initial_payment_change=₡0, saldo_calc=₡1,374; total-abono=saldo ±1 verificado 4/4; "Not valid!" bloquea creación con cliente 12735+total >₡350 (límite crédito) | ✅ |
| CP-103 | Comando rápido Shift+L en POS: abre #dialog_payment directamente (shortcut nativo confirmado), modal pasa de {display:none} a {fade in, height:1200}; total_sale_txt=₡350, initial_payment_change=₡0, #make_layaway_payment="REALIZAR ABONO"; 5/5 validaciones | ✅ |
| CP-104 | Abrir y cerrar caja (F12): detecta dialog_cash_closing via id (no regex); lee cierre #380, total-general ₡188,474.57, apertura 2026-07-04; closure_posted_balance=5000; cierre via btn_close_cash → SweetAlert "Cerrar"; 4/4 validaciones | ✅ |
| CP-105 | Movimientos de caja — registrar entrada: F9→dialog_cash_movement, movenment_cash_in checked (cash_movement_type=1), movenment_cash_quantity=₡10,000, btn_send_movement "Procesar"; campo limpiado y modal cerrado tras confirmación | ✅ |
| CP-106 | Movimientos de caja — registrar salida: F9→dialog_cash_movement, set_movement_out() activa movenment_cash_out (cash_movement_type=2), movenment_cash_quantity=₡3,000, btn_send_movement "Procesar"; efectivo caja ₡213,472.46 | ✅ |
| CP-107 | Verificar cálculos en cierre de caja: F12→dialog_cash_closing, lee total-general/ventas-totales/contado/crédito/entradas/salidas; valida coherencia matemática ±1 (parciales ≈ ventas, total ≤ ingresos, todos ≥ 0). Timeout explícito (25s) agregado 2026-07-08 en `start_open_cash()` para fallar rápido y claro si el servidor de QA no responde, en vez de colgarse | ✅ |
| CP-108 | Cierre de caja con movimientos mixtos: entrada ₡8,000 + salida ₡2,500 via dialog_cash_movement, F12→dialog_cash_closing, valida entradas≥₡8,000 en modal, cierre confirmado via btn_close_cash. Timeout explícito (25s) agregado 2026-07-08 en el click de `btn_send_movement` — antes se colgaba indefinidamente por una llamada AJAX síncrona del lado de la app sin respuesta del servidor (ERR_CONNECTION_CLOSED); ahora falla en ~25s con mensaje claro | ✅ |
| CP-109 | Enviar a caja y validar cliente en modal: Shift+C→dialog_send_sale, #total_send_sale_txt=₡350, #search_pos_customer_send_sale independiente del cliente POS (comportamiento esperado), pago Contado vía #send_sale_payment→SweetAlert "Enviar"; 4/5 validaciones | ✅ |
| CP-110 | Comando rápido Shift+C — validar apertura de dialog_send_sale: estado antes {display:none, height:0, hasIn:false}, después Shift+C {visible:true, fade in, height:1200}; total_send_sale_txt visible, pago Contado por defecto, btn "Enviar a caja", campo búsqueda cliente; 5/5 validaciones | ✅ |
| CP-111 | Facturar orden de taller desde POS: F3→btn_taller_option, itera .pos-order-card hasta encontrar orden con ítems (orden 778, 28 filas), F1→btn_cash_pos→dialog_payment, efectivo→make_payment; SweetAlert cambio ₡131,593.30 confirmado; 5/5 validaciones | ✅ |
| CP-112 | Agregar producto rápido a orden de taller: catálogo oculto con orden activa → busca vía #product_search ("aaa") para forzar repintado del grid; producto agregado, total y última fila validados | ✅ |
| CP-113 | Facturar a crédito una orden de taller: primera orden del tab Taller + producto fresco del catálogo (evita ítems con precio inválido de la orden — hallazgo documentado), selectCustomerToPos(12735), switch_payment_type(2). Cliente 12735 con crédito agotado en QA (acumulado CP-074 a CP-083) → "! Not valid!" detectado y documentado como ⚠️ RESULT, no como fallo | ⚠️ |
| CP-114 | Agregar 2-3 productos a orden de taller existente y facturar todo junto (contado): usa #product_search para agregar (Multímetro, Bombillos, Filtros), valida que el total del carrito coincide con el total del modal de pago ±1 (₡112,220.00) | ✅ |
| CP-115 | Exoneración en orden de taller: agrega producto gravado, exonera 100% vía set_apply_exoneration_modal(), monto exonerado (₡43.37) ≈ IVA leído ±1. Al facturar, Factura Electrónica bloqueada por validación de cliente (BUG-005/BUG-007 conocido) incluso con Tiquete Electrónico — documentado como hallazgo | ⚠️ |
| CP-116 | Descuento general en POS (contado): 3 productos (₡56,185.00), descuento 15% vía total_discount_input, total post-descuento ₡47,757.25 (diff ₡0.00), factura confirmada | ✅ |
| CP-117 | Descuento unitario por producto (contado): 3 productos, input_product_discount_* disabled por servidor (misma limitación que CP-082) — descuento registrado pero sin efecto en el total, factura confirmada igual | ✅ |
| CP-118 | Producto rápido gravado (13% IVA): flujo CABYS inestable (mismo hallazgo que CP-051) → fallback a AAA-Multímetro del catálogo, IVA ₡21.69 validado, factura confirmada | ⚠️ |
| CP-119 | Producto rápido exento (sin IVA): CABYS inestable → fallback a AAA-Bombillos, IVA = ₡0.00 validado, factura confirmada | ⚠️ |
| CP-120 | Cambio de moneda en el POS: producto en colones (₡100.00) vs mismo producto en Dólar Americano ($0.65) tras limpiar carrito; tipo de cambio no se pudo leer en pantalla (hallazgo), conversión consistente | ✅ |
| CP-121 | Listas de precios en el POS (IDs 186, 185, 194): aplica cada lista vía set_current_pos_price_list(), compara precios de AAA-Multímetro/AAA-Bombillos contra el precio base — sin variación en las 3 listas (misma limitación de datos QA que CP-092) | ⚠️ |
| CP-122 | Buscador de productos por nombre, código y código de barras: 3 búsquedas vía #product_search ("multimetro", código completo "7441003590489", código parcial "744100359") — las 3 encuentran AAA-Multímetro (código interno y código de barras comparten el mismo campo en este sistema) | ✅ |
| CP-123 | Cambiar vista cuadrícula/lista: style_list → agrega AAA-Multímetro, style_box → agrega AAA-Bombillos; ambos productos quedan en el carrito tras el cambio de vista; 5/5 validaciones | ✅ |
| CP-124 | Limpiar productos con Ctrl+X: agrega 3 productos distintos en colones, ejecuta Control+x, confirma "Limpiar lista"; carrito queda en 0 filas con placeholder "Agrega productos para facturar" visible; 3/3 validaciones | ✅ |
| CP-125 | Agregar observaciones en factura: escribe en el textarea #sale_observation ("Observaciones de venta") dentro del modal de pago, factura en efectivo. Hallazgo: montos pequeños en Dólar Americano devuelven "! Not valid!" de forma reproducible al pagar (independiente del cliente) → se factura en colones. La observación no se pudo verificar textualmente en el detalle del historial (F5), documentado como hallazgo no bloqueante | ⚠️ |
| CP-126 | Facturar con SINPE Móvil: 3 productos (2 catálogo + 1 rápido con fallback por CABYS inestable), desactiva efectivo y activa is_payment_check vía page.evaluate (checkbox slider fuera del viewport), monto exacto en payment_check_total = total leído de #total_sale_txt, factura confirmada ±1 | ✅ |
| CP-127 | Facturar con transacción bancaria: 3 productos en dólares, desactiva efectivo y activa is_payment_transaction vía page.evaluate, monto exacto en payment_transaction_total = total leído de #total_sale_txt ($123.10), factura confirmada ±1 | ✅ |
| CP-128 | Módulo Ruteo — Carga de Admin. Rutas (/route/adminRoute): título, buscador, botón "Agregar Nueva Ruta" y listado con rutas existentes visibles. Primer CP con sesión reutilizable (abrirContextoConSesion) en vez de login individual | ✅ |
| CP-129 | Módulo Ruteo — Crear nueva ruta: nombre único + zona "Cedral", guarda y valida que aparece en el listado tras buscarla | ✅ |
| CP-130 | Módulo Ruteo — Validación de nombre vacío: el formulario rechaza guardar sin nombre (el modal no se cierra) y no crea ninguna ruta nueva | ✅ |
| CP-131 | Módulo Ruteo — Buscador de rutas por nombre: filtra correctamente un término existente, no devuelve resultados para uno inexistente, y restaura el listado completo al limpiar la búsqueda | ✅ |
| CP-132 | Módulo Ruteo — Asignar cliente a una ruta: crea ruta fresca (0 clientes), agrega un cliente vía el ícono `fa-angle-double-right` en el modal "Asignar Clientes", valida que el contador pasa de 0 a 1 tras refrescar | ✅ |
| CP-133 | Módulo Ruteo — Asignar repartidor a una ruta: mismo patrón que CP-132 con el modal "Asignar Repartidores", valida contador 0→1 y que desaparece el mensaje "No hay repartidores vinculados" | ✅ |
| CP-134 | Módulo Ruteo — Editar comisión de repartidores (Admin. Comisiones): ingresa un monto aleatorio en el modal "Editar Comision" y valida que se guarda y persiste ±1 tras refrescar. Hallazgos: el checkbox "Valor" viene premarcado (clickearlo lo desmarca y oculta el campo), y el botón "Guardar" no tiene `type="submit"` | ✅ |
| CP-135 | Módulo Ruteo — Editar ruta existente: crea ruta de prueba, usa "Editar ruta" del menú de acciones (edición inline en la fila, NO un modal), modifica el nombre y guarda con `routeManager.saveRouteChange(id)`, valida que el nombre nuevo persiste y el original ya no existe | ✅ |
| CP-136 | Módulo Ruteo — Eliminar ruta existente: crea una ruta descartable exclusiva para este CP, usa "Eliminar la ruta" del menú de acciones, confirma el SweetAlert "¿Está seguro?", valida `POST /route/deleteRoute` (200) y que la ruta ya no aparece en el listado. Nunca toca rutas de otros CPs | ✅ |
| CP-137 | Ruteo dentro de POS — Carga del tab "Ruteo" (`#btn_routing_option`, distinto de Admin. Rutas): valida los 5 filtros de estado (Todos/Pendientes/En Camino/Entregado/H. de Órdenes), botón "Opciones Avanzadas" y que el tablero renderiza tarjetas de órdenes existentes | ✅ |
| CP-138 | Ruteo dentro de POS — Crear una Orden de Ruteo completa: agrega 3 productos, abre "Orden de ruteo" (menú 3 puntos, `create_routing_order()`), asigna cliente + ruta + repartidor + observaciones, confirma el SweetAlert "¿Enviar órden a ruteo?" y valida que la orden nueva aparece en el tablero | ✅ |
| CP-139 | Ruteo dentro de POS — Integración cross-módulo: crea una ruta nueva en Admin. Rutas y valida que aparece inmediatamente en el selector "Asignar ruta" del modal Orden de Ruteo del POS | ✅ |
| CP-140 | Ruteo dentro de POS — Filtrar el tablero por estado: aplica los 5 filtros y valida coherencia de conteos (Pendientes = Todos ya que ninguna orden avanzó, En Camino/Entregado en 0) | ✅ |
| CP-141 | Ruteo dentro de POS — Acciones sobre una orden existente: crea orden propia, usa "Ver órden" y "Marcar como EN CAMINO" del menú `more_vert`, valida que la orden se mueve del filtro "Pendientes" al filtro "En Camino" | ✅ |
| CP-142 | Ruteo dentro de POS — Caso de error: intenta "Enviar Orden" sin cliente/ruta/repartidor asignados y valida que el sistema lo rechaza silenciosamente (no crea ninguna orden nueva) | ✅ |
| CP-143 | Ruteo dentro de POS — Editar orden de ruteo existente: crea orden propia, usa "Editar órden" del menú `more_vert` (`show_create_routing_order_modal(id)`, reutiliza el mismo modal de creación pre-poblado), modifica la observación y valida que el cambio persiste en la tarjeta tras guardar | ✅ |
| CP-144 | Ruteo dentro de POS — Marcar orden como ENTREGADO: crea orden propia, la marca "EN CAMINO" (`change_routing_order_status(id, 2)`) y luego "ENTREGADO" (`change_routing_order_status(id, 3)`), valida que aparece en el filtro "Entregado" y ya no en "Pendientes"/"En Camino" | ✅ |
| CP-145 | Ruteo dentro de POS — Eliminar orden de ruteo existente: crea una orden descartable exclusiva para este CP, usa "Eliminar órden" del menú `more_vert` (`show_confirm_delete_routing_order(id)`), confirma el SweetAlert "¿Estás seguro de eliminar la órden?" por texto exacto "Eliminar", valida que la tarjeta ya no aparece en el tablero. Nunca toca órdenes de otros CPs | ✅ |
| CP-146 | Panel de Control — Carga del módulo (`/sett/setting`): valida título de página, las 3 pestañas (Dashboard/Tienda online/Twilio), buscador de configuraciones y botón "Guardar" presentes, y ≥15 secciones en el acordeón del tab Dashboard | ✅ |
| CP-147 | Panel de Control — Navegación entre pestañas: confirma que Dashboard↔Tienda online cambian correctamente de contenido, y que el click en "Twilio" no produce ningún cambio (hallazgo, ver CP-148) | ✅ |
| CP-148 | Panel de Control — Investigación del tab "Twilio": confirma con 3 intentos de click, captura de errores de consola y diálogos nativos que el link `#twilio_config` no crea su `.tab-pane`, no cambia la URL y no rompe el resto del módulo — documentado como hallazgo (link no funcional en este entorno de QA) | ⚠️ |
| CP-149 | Panel de Control — Buscador de configuraciones (`#input_search_setting`): confirma que escribir un término (ej. "comisiones") NO filtra las secciones visibles del acordeón (siguen todas visibles); limpiar el campo sí restaura el listado. Documentado como hallazgo | ⚠️ |
| CP-150 | Panel de Control — Configuración general de comisiones (sección 20): cambia `#commission_for_sale` (input numérico, 0.0000→7.5000), guarda con `#save_settings`, refresca y valida que persiste; restaura el valor original al final y vuelve a guardar para no dejar el sistema alterado | ✅ |
| CP-151 | Panel de Control — Envío de facturas por correo (sección 7): invierte el checkbox `#is_basic_template_send_invoices` (dispara `click` + `change`, no solo `change` — ver hallazgo en CLAUDE_CONTEXT.md), guarda, valida persistencia tras refrescar, restaura el valor original | ✅ |
| CP-152 | Panel de Control — Compras externas (sección 18): invierte el único checkbox de la sección (`#date_external_purchases_checkbox`), guarda, valida persistencia, restaura el valor original | ✅ |
| CP-153 | Panel de Control — Fidelidad de clientes (sección 19): invierte el único checkbox de la sección (`#points_by_company_checkbox`), guarda, valida persistencia, restaura el valor original | ✅ |
| CP-154 | Panel de Control — Consecutivos Comprobante Fiscal (sección 14): **hallazgo confirmado por red** — los 4 campos de esta sección (`current_fiscal_credit_controcode` y los otros 3 consecutivos B01/B02/B14/B15) se pueden editar visualmente pero ninguno se incluye en el payload real de `POST /sett/updateSetting` al guardar (confirmado inspeccionando `request.postData()`); el cambio se pierde al refrescar. Documentado como hallazgo, no como fallo del script | ⚠️ |
| CP-155 | Panel de Control — Personalizar términos y condiciones (sección 16): activa `#personalized_signature_checkbox`, escribe texto de prueba en `#personalized_signature_text`, guarda, valida que ambos persisten tras refrescar, restaura el estado original | ✅ |
| CP-156 | Panel de Control — Ventas de Crédito (sección 9): activa `#apply_interest_on_credit_sales_checkbox`, fija `#interest_percentage_on_credit_sales` en 3.5%, guarda, valida persistencia, restaura el estado original | ✅ |
| CP-157 | Panel de Control — Configuración de inventario (sección 4): invierte `#generate_automatic_product_code`, guarda, valida persistencia, restaura el valor original | ✅ |
| CP-158 | Panel de Control — Plantillas pdf de las órdenes (sección 10): cambia el `<select>` `#order_template_id` a una opción distinta (Chosen), guarda, valida persistencia, restaura la opción original. Primer CP del Bloque B que prueba un select en vez de checkbox/número | ✅ |
| CP-159 | Panel de Control — Configuración ASADA (sección 12): cambia `#moratorium_percentage` a un valor entero (5), guarda, valida persistencia, restaura el original. Hallazgo secundario: un valor decimal (2.5) se redondea a 3.0 al guardar — documentado sin hacer fallar el CP | ✅ |
| CP-160 | Panel de Control — Dashboard (sección 1): cambia `#language_select` (Chosen) de Español a English, guarda, valida persistencia, restaura el idioma original | ✅ |
| CP-161 | Panel de Control — Impresión de cierres de caja (sección 3): invierte `#enable_cash_counting_by_denomination`, guarda, valida persistencia, restaura el valor original | ✅ |
| CP-162 | Panel de Control — Compras (sección 17): invierte `#show_image_purchase_proform_checkbox`, guarda, valida persistencia, restaura el valor original | ✅ |
| CP-163 | Panel de Control — Módulo de Crédito para clientes (sección 21): invierte `#apply_credit_to_customers_of_other_companies_checkbox`, guarda, valida persistencia, restaura el valor original. Deliberadamente NO toca `#show_credit_module_checkbox` (el otro campo de la sección, que activa/desactiva el módulo de crédito completo del sistema) por el riesgo de dejarlo apagado si el CP fallara a mitad de camino; el CP verifica explícitamente que ese interruptor general no se alteró | ✅ |
| CP-164 | Panel de Control — Tracking de órdenes online para clientes (sección 11, 31 campos): invierte `#show_prices_totals_customer_order_tracking_checkbox`, guarda, valida persistencia, restaura el valor original. La sección tiene además una tabla anidada de ~23 checkboxes sin id propio (respaldados por el JSON `#online_repair_order_hidden_fields_json`) para ocultar campos del PDF/vista online de la orden — sub-funcionalidad distinta no cubierta por este CP | ✅ |
| CP-165 | Panel de Control — Configuración general de ventas, sub-tema facturación y stock (sección 8, 91 campos totales, 1 de 3 CPs — ver CP-166/CP-167): invierte `#allow_negative_product_sale` y `#show_total_dolar`, guarda, valida persistencia, restaura ambos | ✅ |
| CP-166 | Panel de Control — Configuración general de ventas, sub-tema descuentos y roles (2 de 3): cambia `#max_general_discount` (20.0000→15.0000), activa `#limit_discount_by_role` y confirma que revela la tabla de descuento por rol, guarda, valida persistencia, restaura ambos. La tabla por-rol (`role_discount_<roleId>`) no se automatizó a nivel de valor por comportamiento poco confiable del campo (ver CLAUDE_CONTEXT.md) | ✅ |
| CP-167 | Panel de Control — Configuración general de ventas, sub-tema documento electrónico y seguridad (3 de 3): cambia `#default_electronic_document_type` (Factura Interna→Factura Electrónica) e invierte `#seller_confirmation_an_order_exceeds_max_discount`, guarda, valida persistencia, restaura ambos | ✅ |
| CP-168 | Panel de Control — Configuración del sistema POS, sub-tema facturación/categorías/clientes (sección 5, 57 campos totales, 1 de 3 CPs — ver CP-169/CP-170): invierte `#apply_fe_internal_invoice` y `#validate_credit_limit`, guarda, valida persistencia, restaura ambos. Hallazgo documentado en el código: `#generate_automatic_customer_code` (mismo sub-grupo) no persistía con el patrón estándar de checkbox pese a tener DOM idéntico a campos que sí funcionan — se descartó por ese campo puntual y se usó `#validate_credit_limit` en su lugar | ✅ |
| CP-169 | Panel de Control — Configuración del sistema POS, sub-tema mesas/taller/aprobaciones (2 de 3): invierte `#show_table_grid` y `#mechanic_required_at_invoicing`, guarda, valida persistencia, restaura ambos | ✅ |
| CP-170 | Panel de Control — Configuración del sistema POS, sub-tema pagos/productos (3 de 3): cambia el `<select>` `#payment_method_selected_by_default` a una opción distinta e invierte `#show_pos_product_cost`, guarda, valida persistencia, restaura ambos | ✅ |
| CP-171 | End. Pintura (POS) — Flujo completo: selecciona vehículo SUV (widget Chosen), parte "Frente", pieza "Absorbedor de impacto delantero" y servicio "Desmontar y montar"; usa `Promise.race()` entre "el carrito creció" y "apareció el modal Selecciona un precio" (en este ambiente QA siempre resuelve la primera rama, cada servicio tiene un único precio registrado); valida que el ítem se agrega a `#tb_table_buy_list` con el total correcto (₡20,340.00) | ✅ |
| CP-172 | End. Pintura (POS) — Caso sin servicios activos: selecciona vehículo SUV, parte "Parte frontal" (catálogo antiguo de partes, sin servicios configurados en este ambiente), pieza "BUMPER DEL", valida el mensaje claro "Sin servicios"/toast "No hay servicios activos" en vez de un timeout genérico | ✅ |
| CP-173 | Panel de Control — Impresión de factura de ventas, sub-tema formato general y moneda (sección 2, 58 campos totales, 1 de 3 CPs — ver CP-174/CP-175): cambia `#font_size_select` a una opción distinta e invierte `#print_money_symbol_checkbox`, guarda, valida persistencia, restaura ambos | ✅ |
| CP-174 | Panel de Control — Impresión de factura de ventas, sub-tema contenido de la factura impresa (2 de 3): invierte `#show_invoice_product_code` y `#show_taxed_and_exempt_total`, guarda, valida persistencia, restaura ambos | ✅ |
| CP-175 | Panel de Control — Impresión de factura de ventas, sub-tema cliente/referencias/facturación electrónica (3 de 3): invierte `#print_qr_code` y cambia el `<select>` `#print_electronic_billing_data_on_invoice` (Consecutivo Interno/FE/Ambos), guarda, valida persistencia, restaura ambos. Hallazgo documentado en `CLAUDE_CONTEXT.md`: 4 campos de la sección (`print_command`, `target_view_kitchen`, `print_command_after_paying`, `print_products_without_assigned_printer`) son huérfanos — su JS de sincronización busca checkboxes que no existen en ningún lugar del DOM de la página, confirmado expandiendo las 21 secciones del acordeón | ✅ |
| CP-176 | Panel de Control — Tienda online (tab, Bloque C, único CP dado su tamaño de 6 configuraciones reales): investiga el botón "Guardar cambios" (`#save_settings_store`) modificando `#color_select`/`#enable_newsletter` y clickeando 3 veces (incluyendo un click real de Playwright). **Hallazgo confirmado**: el botón no está dentro de ningún `<form>`, no dispara ninguna petición POST al servidor, y los cambios se pierden al refrescar — mismo patrón que el tab Twilio no funcional (CP-148). Ver también el hallazgo de integridad de datos entre compañías en `#company_store_online_select`, documentado en `CLAUDE_CONTEXT.md` (no modificado en ningún CP) | ⚠️ |
| CP-177 | Producto externo (`#add_sc_product`) + cliente existente (ID 12735, `selectCustomerToPos`) + producto rápido (fallback a catálogo si CABYS es inestable). Llena el modal completo (grupo, vendedor, proveedor, costo, utilidad 30%, impuesto IVA 13%, ayuda) y confirma con "Agregar". **Hallazgo confirmado**: el total que queda en el carrito no coincide con el calculado en el modal (₡650.00 esperado vs. monto absurdamente alto en el carrito) — ver detalle en `CLAUDE_CONTEXT.md` sección 21. Abre el modal de pago pero deliberadamente NO confirma el pago para no persistir una factura con monto corrupto; vacía el carrito al final | ⚠️ |
| CP-178 | Producto externo + producto rápido + descuento general (`total_discount_input` 10%), sin cliente asociado. Demuestra primero el **gate de aprobación de administrador** (`dialog_approve_product_external_utility`) al usar utilidad 10% (&lt;25%) y lo cancela (requiere credenciales de admin, fuera de alcance); corrige a utilidad 35% para completar el guardado. Usa el campo libre "Otro Proveedor" en vez del `<select>` Proveedor, e Impuesto Selectivo de Consumo (variedad respecto a CP-177). Mismo hallazgo de monto corrupto que CP-177; no confirma el pago | ⚠️ |
| CP-179 | Producto externo + cliente existente + producto rápido + descuento general (12%) + exoneración (`set_apply_exoneration_modal`, patrón CP-071). Cubre proveedor vía `<select>`, garantía (checkbox + días) y observaciones. Verifica que la exoneración aplique un monto &gt;0 (sin exigir tolerancia ±1 contra el IVA porque la base ya está afectada por el hallazgo de monto corrupto). No confirma el pago | ⚠️ |
| CP-180 | Vista expandida/encogida del carrito (`#switch_compress`, se revierte al terminar) + producto externo (demuestra primero el botón "Cerrar" del modal descartando un borrador sin guardar, luego completa el real) + cliente existente + producto normal de catálogo + producto rápido + descuento general (8%). No confirma el pago por el mismo hallazgo de monto corrupto | ⚠️ |
| CP-181 | Producto externo + cliente existente + producto rápido + activación de modo **crédito** (`ck_is_payment_credit` + `switch_payment_type(2)`, patrón CP-074/CP-081): valida que el checkbox quede marcado y que se muestre la fecha de vencimiento de crédito. NO confirma el pago a crédito — facturar con el monto corrupto del producto externo dejaría un saldo por cobrar absurdo persistido en el ambiente compartido | ⚠️ |
| CP-182 | Producto externo + cliente asociado **solo por nombre** (sin cliente completo, patrón CP-034: botón "Agregar" → `editQuickCustomerName()` → `temporal_customer_name` → `setTemporalCustomerName()`) + producto rápido. No confirma el pago por el mismo hallazgo de monto corrupto | ⚠️ |
| CP-183 | Tablero de Ruteo — "Imprimir" (menú more_vert) en los filtros "Todos" y "Pendientes": confirma que la opción existe, genera el preview PDF (iframe blob) en ambos, y que cada filtro dispara su propia consulta `getReportRoutingData` | ✅ |
| CP-184 | Tablero de Ruteo — "Descargar PDF": confirma que comparte `onclick="printReportRoutingPDF()"` con "Imprimir" (se diferencian por `data-mode`), y que produce una descarga real de archivo (`page.on('download')`), no un preview — validado contra el filtro "Todos" (9 órdenes) | ✅ |
| CP-185 | Tablero de Ruteo — selección múltiple (`#select_order_remove_<ID>`) + "Enviar a Ruteo" en lote sobre 2 órdenes propias: valida conteo de seleccionadas, contenido del modal de confirmación, y el guardado | ✅ |
| CP-186 | Tablero de Ruteo — selección múltiple + "Cambiar Repartidor" en lote sobre 2 órdenes propias (aislamiento por diferencia exacta de IDs): valida el modal, elige un repartidor distinto al original y confirma que persiste en ambas órdenes tras refrescar | ✅ |
| CP-187 | Tablero de Ruteo — selección múltiple + "Eliminar" en lote sobre 2 órdenes propias (aislamiento por diferencia exacta de IDs): valida el SweetAlert de confirmación y que solo desaparecen las 2 órdenes propias, sin afectar ninguna preexistente | ✅ |
| CP-188 | Tablero de Ruteo — "Limpiar selección": marca 2 órdenes propias, confirma que se desmarcan y que la acción no dispara ninguna petición al servidor (puramente client-side) | ✅ |
| CP-189 | Tablero de Ruteo — "Seleccionar todos" + "Cambiar Repartidor": valida de forma segura y reversible que "Seleccionar todos" marca absolutamente todo lo visible (incluyendo órdenes ajenas) y que "Limpiar selección" lo deshace sin confirmar ninguna acción sobre ese conjunto amplio; la acción real de "Cambiar Repartidor" se confirma únicamente sobre 2 órdenes propias seleccionadas manualmente | ✅ |
| CP-190 | Tablero de Ruteo — "Seleccionar todos" + "Eliminar": mismo enfoque híbrido seguro que CP-189 (validación reversible de "Seleccionar todos"/"Limpiar selección" sobre el conjunto completo, acción real de "Eliminar" solo sobre 2 órdenes propias) | ✅ |
| CP-191 | Tablero de Ruteo — filtros avanzados (`#btn_toggle_advanced_filters`): confirma que revela Provincia/Cantón/Distrito/Fecha desde-hasta, y que tanto el filtro de fecha como el de Provincia (widget Chosen) disparan una consulta real `getSearchRoutingOrders` y acotan el resultado | ✅ |
| CP-192 | Tablero de Ruteo — investigación del "buscador" del tablero. **Hallazgo confirmado**: no existe un campo de búsqueda de órdenes por texto libre; el único input "Buscar...." visible (`#product_search`) es del buscador de productos del POS y no filtra las órdenes de ruteo | ⚠️ |
| CP-193 | Crear Cliente (POS, modal "Agregar Cliente" `#dialog_add_customer`) — cliente sencillo: solo Nombre (único campo requerido) + Correo electrónico en el tab Principal, sin tocar Identificación/Tipo/Actividad/Opciones avanzadas/Ubicación. Verifica que "Guardar y Salir" asocia automáticamente el cliente recién creado a la venta actual (panel "Buscar Cliente" reemplazado por los datos del cliente) | ✅ |
| CP-194 | Demo de defensa de proyecto final (no es cobertura/QA, ver `CLAUDE_CONTEXT.md` sección 23) — narrativa visual en 4 bloques independientes (`BLOQUES_A_EJECUTAR`). Bloque 1: Login + Dashboard → Recepción de vehículo nuevo (cliente + vehículo BMW + orden generada). Bloque 2: Torre de Control — localiza la orden recién creada en el tablero por nombre de cliente (redefinido desde "cambio de etapa", sin mecanismo confiable de automatizar en este ambiente). Bloques 3 (Facturación POS) y 4 (Cierre de caja) quedan pendientes, bloqueados por el hallazgo de montos corruptos de la sección 22 | ⚠️ |
| CP-195 | Crear Cliente (POS) — cliente completo: llena TODOS los campos de los 3 tabs (Principal, Opciones avanzadas, Ubicación — incluyendo Provincia, Dirección, Whatsapp/Teléfono, exoneración, Vendedor/Zona/Ruta, Días de pago/trámite, Recurrencia, Límite de crédito, y agrega una dirección nueva). Reabre el cliente vía el ícono de edición (`.i_edit_customer`) para confirmar que los datos de los 3 tabs persistieron realmente en el backend, no solo en el panel de la venta | ✅ |
| CP-196 | Tab "Tienda en línea" del POS (`#btn_get_virtual_order_list`, distinto del tab "Tienda online" de Panel de Control, CP-176) — interacción real con el panel de "Seguimiento" de pedidos: abre las 3 categorías (Pendientes/Aprobadas/En camino), ejercita el dropdown "Cambiar estado" (**hallazgo: opciones contextuales según el estado actual, no fijas**) y el checkbox "Seleccionar todos". No invoca "Guardar cambios" (acción en lote que notifica al cliente por correo/app, requiere confirmación explícita). Gap documentado: 0 órdenes reales de tienda en línea en este ambiente, no se pudo probar el flujo completo de aprobación de punta a punta. Ver `CLAUDE_CONTEXT.md` sección 24 | ⚠️ |
| CP-197 | Crear Cliente (POS) — cliente completo + información de vehículo COMPLETA: activa el switch "Agregar o ver información del vehículo" (tab Principal) y llena los 6 campos (Número de Placa, Número de caso, Marca, Modelo — select encadenado que depende de Marca vía AJAX—, Año, Número de chasis), confirma con el botón "Agregar" propio de esa sección (igual patrón que "Agregar dirección"). Verifica que el vehículo persista reabriendo el cliente, y que la placa quede disponible en el selector "Placa" del panel de venta | ✅ |
| CP-198 | Crear Cliente (POS) — cliente sencillo (solo Nombre + Correo) + información de vehículo MÍNIMA: llena solo Placa/Marca/Modelo/Año, dejando Número de caso y Número de chasis deliberadamente vacíos (documentado explícitamente en el código). Confirma que el guardado no exige esos 2 campos y que el vehículo mínimo persiste tras reabrir el cliente | ✅ |
| CP-199 | Crear Cliente (POS) — cliente completo con VARIAS actividades económicas: 1 actividad principal + 2 actividades secundarias agregadas con el botón "+ Actividad" (clic repetido, cada fila con su propio `<select>` y botón de eliminar). Verifica que las 3 actividades (principal + ambas secundarias) persistan reabriendo el cliente | ✅ |