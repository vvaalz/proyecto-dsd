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

## Cómo ejecutar las pruebas

### Ejecutar un caso de prueba individual
```bash
node tests/cp001-login-valido.js
node tests/cp002-login-invalido.js
node tests/cp003-campos-vacios.js
node tests/cp004-usuario-inexistente.js
node tests/cp005-carga-dashboard.js
node tests/cp006-acceso-recepcion-vehiculo.js
node tests/cp007-agregar-cliente-nuevo.js
node tests/cp008-asignar-mecanico-servicio.js
node tests/cp009-modal-confirmacion-guardar.js
node tests/cp010-cancelar-generacion-orden.js
node tests/cp017-carga-tablero-ordenes.js
node tests/cp018-buscar-orden-tablero.js
node tests/cp019-crear-seccion-tablero.js
node tests/cp020-avanzar-orden-siguiente-etapa.js
node tests/cp011-whatsapp-modal-orden.js
node tests/cp012-buscar-orden-placa.js
node tests/cp013-buscar-orden-nombre-cliente.js
node tests/cp014-cambiar-vista-lista-caja.js
node tests/cp015-cambiar-sucursal-selector.js
node tests/cp016-chat-interno-orden.js
```

## Autenticación en las pruebas

- **CP-001 a CP-127**: login individual completo en cada script (llenar `#email`/`#password`, click en `#loginButton`, esperar `**/dashboard**`). Es el patrón "legacy" — no se toca, ya está probado y funcionando.
- **CP-128 en adelante**: usan sesión reutilizable vía `storageState` (Playwright) en lugar de loguearse de cero en cada script. El sistema vive en `auth/`:
  - `auth/generar-sesion.js` — hace login una vez y guarda la sesión en `auth/sesion-qa.json` (ignorado por git, contiene tokens activos).
  - `auth/usar-sesion.js` — expone `abrirContextoConSesion(browser)`: reutiliza la sesión si tiene menos de 2 horas, o la regenera automáticamente si no existe o está vencida.
  - Uso en un CP nuevo:
    ```js
    const { abrirContextoConSesion } = require('../auth/usar-sesion');
    const context = await abrirContextoConSesion(browser);
    const page = await context.newPage();
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/dash/dashboard',
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    ```
  - Si la navegación redirige a `/log/login` (sesión expirada en el servidor), el CP debe borrar `auth/sesion-qa.json`, regenerar con `abrirContextoConSesion()` y reintentar la navegación una sola vez antes de fallar.
  - `auth/test-sesion.js` valida el flujo completo (generación automática + reutilización) y sirve de referencia.
  - `auth/usar-sesion.js` también expone `refrescarConCacheLimpia(page)`: limpia la caché de red del navegador vía CDP (`Network.clearBrowserCache` + `Network.setCacheDisabled`) y recarga la página, sin afectar cookies ni la sesión activa. Se usa en los CPs del módulo Ruteo (CP-128 en adelante) justo después de navegar al módulo y antes de la lógica de cada prueba, para evitar que HTML/JS cacheado de una corrida anterior interfiera con la siguiente:
    ```js
    const { abrirContextoConSesion, refrescarConCacheLimpia } = require('../auth/usar-sesion');
    const context = await abrirContextoConSesion(browser);
    const page = await context.newPage();
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/route/adminRoute',
      { waitUntil: 'domcontentloaded', timeout: 60000 });
    await refrescarConCacheLimpia(page);
    // ... lógica del CP ...
    ```

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
| CP-107 | Verificar cálculos en cierre de caja: F12→dialog_cash_closing, lee total-general/ventas-totales/contado/crédito/entradas/salidas; valida coherencia matemática ±1 (parciales ≈ ventas, total ≤ ingresos, todos ≥ 0) | ✅ |
| CP-108 | Cierre de caja con movimientos mixtos: entrada ₡8,000 + salida ₡2,500 via dialog_cash_movement, F12→dialog_cash_closing, valida entradas≥₡8,000 en modal, cierre confirmado via btn_close_cash | ✅ |
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