# CLAUDE_CONTEXT.md

## 1. Descripción general del proyecto

Proyecto: proyecto-dsd

Tipo de proyecto: suite de pruebas automatizadas con Selenium WebDriver en JavaScript para validar el sistema ERP TallerAlpha.

Propósito:
- Automatizar pruebas funcionales del módulo de Recepción de Vehículo, tablero de órdenes, reportes y otras pantallas del sistema TallerAlpha.
- Servir como práctica empresarial para Design and Software Development S.A.
- Generar evidencia de ejecución y reportes HTML para seguimiento de resultados.

Stack principal:
- Node.js
- JavaScript
- Selenium WebDriver
- Google Chrome
- HTML report generation via a custom runner

Entorno de prueba:
- Sistema bajo prueba alojado en entorno de desarrollo: https://dev.designsoftcr.com/qa_talleralpha/
- Navegador Chrome con configuración para deshabilitar notificaciones y establecer tamaño de ventana.
- Pruebas ejecutadas contra URLs públicas del módulo autenticado y módulos de negocio.

---

## 2. Estructura de carpetas actual del proyecto

```text
proyecto-dsd/
├── README.md
├── CLAUDE_CONTEXT.md
├── package-lock.json
├── reports/
│   └── reporte-pruebas.html
└── tests/
    ├── cp001-login-valido.js
    ├── cp002-login-invalido.js
    ├── cp003-campos-vacios.js
    ├── cp004-usuario-inexistente.js
    ├── cp005-carga-dashboard.js
    ├── cp006-acceso-recepcion-vehiculo.js
    ├── cp007-agregar-cliente-nuevo.js
    ├── cp008-asignar-mecanico-servicio.js
    ├── cp009-modal-confirmacion-guardar.js
    ├── cp010-cancelar-generacion-orden.js
    ├── cp011-whatsapp-modal-orden.js
    ├── cp012-buscar-orden-placa.js
    ├── cp013-buscar-orden-nombre-cliente.js
    ├── cp014-cambiar-vista-lista-caja.js
    ├── cp015-cambiar-sucursal-selector.js
    ├── cp016-chat-interno-orden.js
    ├── cp017-carga-tablero-ordenes.js
    ├── cp017-tablero-carga-columnas.js
    ├── cp018-buscar-orden-tablero.js
    ├── cp019-crear-seccion-tablero.js
    ├── cp020-avanzar-orden-siguiente-etapa.js
    ├── cp021-carga-modulo-reporte-ordenes.js
    ├── cp022-filtrar-ordenes-rango-fechas.js
    ├── cp023-descarga-reporte-excel.js
    ├── cp024-detalle-orden-muestra-informacion.js
    ├── cp025-agregar-abono-orden.js
    ├── inspect-recepcion-routes.js
    ├── inspect-workorder-board.js
    ├── inspect-workshop-report.js
    ├── runner.js
    ├── testUtils.js
    ├── _inspect-recepcion.js
    └── _inspect_recepcion2.js
```

Notas:
- La suite principal vive en la carpeta tests/.
- Los archivos de inspección y exploración se nombran con prefijo inspect_ o _inspect para diagnóstico.
- Los reportes de ejecución se generan en reports/.

---

## 3. Convenciones de nomenclatura usadas

### Nombres de archivos
- Formato: cpNNN-descripcion.js
- Ejemplo: cp001-login-valido.js
- El prefijo cpNNN corresponde al número del caso de prueba.
- La descripción suele usar palabras en minúsculas separadas por guiones.

### Nombres de funciones
- Formato general: cpNNN_nombre_descriptivo()
- Ejemplo: cp001_login_valido()
- Uso de snake_case para funciones.

### Estructura del código
- Los scripts usan async/await.
- La lógica se organiza en funciones asíncronas.
- El patrón estándar es:
  1. Crear el driver de Selenium.
  2. Abrir la URL de login.
  3. Autenticar con credenciales de prueba.
  4. Navegar al módulo correspondiente.
  5. Esperar por elementos o URL esperada.
  6. Ejecutar la validación.
  7. Registrar resultado en consola.
  8. Cerrar el driver en finally.

### Manejo de errores
- El patrón típico es try/catch/finally.
- Los fallos se registran con mensajes claros en consola.
- En varios scripts se usa process.exit(1) cuando una validación no se cumple.

---

## 4. Patrón de código estándar de los casos de prueba

Los casos siguen este esquema base:

```javascript
const { Builder, By, until } = require('selenium-webdriver');

async function cp001_login_valido() {
  console.log('🔄 Ejecutando CP-001: Login con credenciales válidas...');

  let driver = await new Builder().forBrowser('chrome').build();

  try {
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();
    await driver.wait(until.urlContains('dashboard'), 10000);

    let url = await driver.getCurrentUrl();
    if (url.includes('dashboard')) {
      console.log('✅ CP-001 PASSED: Login exitoso, redirigió al dashboard correctamente');
    } else {
      console.log('❌ CP-001 FAILED: No redirigió al dashboard');
    }
  } catch (error) {
    console.log('❌ CP-001 FAILED: ' + error.message);
  } finally {
    await driver.quit();
  }
}

cp001_login_valido();
```

### Características del patrón
- Uso de Selenium By para localizar elementos.
- Uso de until para esperas explícitas.
- Uso de console.log para trazabilidad.
- Cierre del driver en finally.
- Validación simple basada en URL o texto visible.

---

## 5. Lista de casos de prueba (CP-001 a CP-026)

La suite en el repositorio actualmente contiene scripts para CP-001 a CP-025. El caso CP-026 se encuentra pendiente o sin implementación formal en esta entrega.

| Código | Archivo | Descripción breve |
|--------|---------|-------------------|
| CP-001 | tests/cp001-login-valido.js | Valida login correcto con credenciales válidas. |
| CP-002 | tests/cp002-login-invalido.js | Verifica que un login con contraseña incorrecta no entre al sistema. |
| CP-003 | tests/cp003-campos-vacios.js | Valida que el sistema rechace el login si los campos están vacíos. |
| CP-004 | tests/cp004-usuario-inexistente.js | Comprueba el comportamiento ante un usuario inexistente. |
| CP-005 | tests/cp005-carga-dashboard.js | Verifica que el dashboard cargue correctamente tras iniciar sesión. |
| CP-006 | tests/cp006-acceso-recepcion-vehiculo.js | Valida acceso al módulo de Recepción de Vehículo. |
| CP-007 | tests/cp007-agregar-cliente-nuevo.js | Comprueba la creación de un cliente nuevo con datos mínimos. |
| CP-008 | tests/cp008-asignar-mecanico-servicio.js | Verifica que al agregar un servicio se pueda asignar mecánico. |
| CP-009 | tests/cp009-modal-confirmacion-guardar.js | Valida la aparición de confirmación al guardar una recepción. |
| CP-010 | tests/cp010-cancelar-generacion-orden.js | Verifica que cancelar la generación de orden regrese a la recepción. |
| CP-011 | tests/cp011-whatsapp-modal-orden.js | Prueba del modal de WhatsApp tras generar una orden. |
| CP-012 | tests/cp012-buscar-orden-placa.js | Valida búsqueda de órdenes por placa. |
| CP-013 | tests/cp013-buscar-orden-nombre-cliente.js | Valida búsqueda de órdenes por nombre de cliente. |
| CP-014 | tests/cp014-cambiar-vista-lista-caja.js | Comprueba el cambio de vista entre lista y caja. |
| CP-015 | tests/cp015-cambiar-sucursal-selector.js | Verifica que cambiar de sucursal actualice la vista. |
| CP-016 | tests/cp016-chat-interno-orden.js | Valida apertura e interacción del chat interno de una orden. |
| CP-017 | tests/cp017-carga-tablero-ordenes.js | Verifica carga del tablero de órdenes. |
| CP-017b | tests/cp017-tablero-carga-columnas.js | Comprueba que el tablero cargue sus columnas. |
| CP-018 | tests/cp018-buscar-orden-tablero.js | Valida búsqueda de órdenes desde el tablero. |
| CP-019 | tests/cp019-crear-seccion-tablero.js | Verifica creación de una nueva sección en el tablero. |
| CP-020 | tests/cp020-avanzar-orden-siguiente-etapa.js | Prueba interacción con la configuración del tablero. |
| CP-021 | tests/cp021-carga-modulo-reporte-ordenes.js | Valida que el módulo de reportes de órdenes cargue correctamente. |
| CP-022 | tests/cp022-filtrar-ordenes-rango-fechas.js | Comprueba filtrado de órdenes por rango de fechas. |
| CP-023 | tests/cp023-descarga-reporte-excel.js | Verifica intento de descarga del reporte en Excel. |
| CP-024 | tests/cp024-detalle-orden-muestra-informacion.js | Valida apertura del detalle de una orden. |
| CP-025 | tests/cp025-agregar-abono-orden.js | Prueba la interacción para registrar un abono. |
| CP-026 | tests/cp026-descargar-pdf-orden.js | Verifica la descarga del PDF de una orden desde el menú de tres puntos en Recepción de Vehículo. |
| CP-027 | tests/cp027-ver-orden-online.js | Verifica que "Ver orden online" (Opciones avanzadas) abra la vista pública de la orden. |
| CP-028 | tests/cp028-ver-bitacora-orden.js | Verifica que "Ver bitácora" (Opciones avanzadas) cargue la bitácora de la orden. |
| CP-029 | tests/cp029-desactivar-orden.js | Verifica que "Desactivar orden" (Opciones avanzadas) cambie el estado de una orden de prueba a inactiva. |
| CP-030 | tests/cp030-eliminar-orden.js | Verifica que "Eliminar orden" (Opciones avanzadas) elimine permanentemente una orden de prueba del listado. |
| CP-031 | tests/cp031-carga-modulo-pos.js | Verifica que el módulo POS (Facturar) cargue con la compañía, categorías y productos visibles. |
| CP-032 | tests/cp032-buscar-producto-pos.js | Verifica que buscar un producto en el POS lo muestre en los resultados. |
| CP-033 | tests/cp033-agregar-producto-carrito.js | Verifica que agregar un producto al carrito muestre el precio correcto. |
| CP-034 | tests/cp034-buscar-cliente-pos.js | Verifica que se pueda asociar un cliente a la factura del POS (vía cliente rápido; el buscador existente no responde). |
| CP-035 | tests/cp035-generar-cotizacion-pos.js | Verifica que se pueda generar una cotización (Proforma) desde el menú de tres puntos del POS. |
| CP-036 | tests/cp036-generar-apartado-pos.js | Verifica que se pueda generar un apartado desde el menú de tres puntos del POS. |
| CP-037 | tests/cp037-facturacion-contado-efectivo.js | Verifica el flujo completo de facturación de contado en efectivo, con datos de prueba propios. |
| CP-038 | tests/cp038-facturacion-credito.js | Documenta un defecto confirmado: switch_payment_type() no activa Crédito (código comentado), revierte siempre a Contado. |
| CP-039 | tests/cp039-importar-factura-historico.js | Verifica que el tab (F5) Importar factura cargue el historial de facturas. |
| CP-040 | tests/cp040-ver-apartados-pos.js | Verifica que el tab (F7) Apartados cargue la lista de apartados existentes. |
| CP-041 | tests/cp041-panel-totales-pos.js | Verifica que el panel de totales muestre subtotal, IVA, descuento, devolución de tarifa, total utilidad y total. |
| CP-042 | tests/cp042-aplicar-descuento-carrito.js | Verifica que aplicar un porcentaje de descuento cambie el total del carrito. |
| CP-043 | tests/cp043-cambio-moneda-pos.js | Verifica que el selector de moneda muestre Colón, Dólar Americano, Euro y Peso Dominicano. |
| CP-044 | tests/cp044-formato-impresion-pos.js | Verifica que el selector de impresión muestre los 9 formatos de factura disponibles. |
| CP-045 | tests/cp045-abrir-cerrar-caja.js | Verifica que "(F12) Abrir/Cerrar Caja" abra el modal de gestión de caja. |
| CP-046 | tests/cp046-movimientos-caja.js | Verifica que "(F9) Movimientos de caja" cargue su pantalla. |
| CP-047 | tests/cp047-historial-movimientos-caja.js | Documenta un defecto confirmado: "(F8) Historial Mov. de Caja" no tiene manejador funcional (ni clic ni la tecla F8 real, que está ligada a otra función). |
| CP-048 | tests/cp048-vista-lista-grilla-pos.js | Verifica que los botones style_list/style_box cambien la visualización de productos entre lista y grilla. |
| CP-049 | tests/cp049-filtro-vehiculos-pos.js | Verifica que "Filtros de Vehículos" despliegue Marca, Modelo, Año, Transmisión, Motor y Categoría. |
| CP-050 | tests/cp050-tres-puntos-carrito.js | Verifica que el menú de tres puntos (more_horiz) del carrito muestre sus opciones. |
| CP-051 | tests/cp051-producto-rapido-pos.js | Documenta un hallazgo: "Producto Rápido" exige un código CABYS cuya búsqueda resultó inestable (timeout, crashes, guardado silenciosamente fallido) en este entorno. |
| CP-052 | tests/cp052-vaciar-carrito-pos.js | Verifica que vaciar el carrito (cancel_sale + confirmar "Limpiar lista") lo deje vacío. |
| CP-053 | tests/cp053-tab-ordenes-caja.js | Verifica que el tab (F2) Órdenes de caja cargue correctamente. |
| CP-054 | tests/cp054-tab-taller-pos.js | Verifica que el tab (F3) Taller cargue la vista de selección de vehículo con etapa/servicios. |
| CP-055 | tests/cp055-tab-tienda-linea.js | Verifica que el tab "Tienda en línea" cargue correctamente. |
| CP-056 | tests/cp056-tab-ruteo.js | Verifica que el tab "Ruteo" cargue correctamente. |
| CP-057 | tests/cp057-tab-cotizacion-f4.js | Verifica que el tab (F4) Cotización cargue el listado de cotizaciones existentes. |
| CP-058 | tests/cp058-facturar-producto-gravado.js | Verifica la facturación completa de un producto gravado: IVA > 0, cliente asociado vía selectCustomerToPos(), pago en efectivo y doble confirmación SweetAlert. |
| CP-059 | tests/cp059-facturar-producto-exento.js | Verifica la facturación completa de un producto exento: IVA = 0, mismo flujo de cliente/pago/confirmación que CP-058. |
| CP-060 | tests/cp060-toggle-impresion-facturar.js | Verifica que la tecla F8 alterne "Impresión de facturas ACTIVADA/DESACTIVADA" y que se pueda facturar correctamente en ambos estados. |
| CP-061 | tests/cp061-facturar-pago-mixto.js | Verifica la facturación con pago mixto (efectivo + tarjeta), distribuyendo el monto total 50/50 entre ambos métodos. |
| CP-062 | tests/cp062-facturar-pago-unico.js | Verifica la facturación con un único método de pago (tarjeta), desmarcando Efectivo (activo por defecto). |
| CP-063 | tests/cp063-agregar-orden-existente.js | Verifica que se pueda cargar una orden de taller existente (add_repair_order_to_table) al carrito, agregar un producto adicional y facturar. |
| CP-064 | tests/cp064-agregar-factura-importada.js | Verifica que se pueda importar una factura histórica (botón IMPORTAR / add_pos_invoice_import_to_table) al carrito, agregar un producto adicional y facturar. |
| CP-065 | tests/cp065-agregar-producto-vista-lista.js | Verifica que se pueda agregar un producto al carrito con el catálogo en formato lista (style_list). |
| CP-066 | tests/cp066-agregar-producto-vista-cuadricula.js | Verifica que se pueda agregar un producto al carrito con el catálogo en formato cuadrícula (style_box). |
| CP-067 | tests/cp067-comentario-factura-electronica.js | Verifica que se pueda agregar un comentario a un producto y facturar como Factura Electrónica (payment_electronic_document_type='1', requiere disparar 'chosen:updated' en el select). |
| CP-068 | tests/cp068-comentario-tiquete-electronico.js | Verifica que se pueda agregar un comentario a un producto, valida el total del carrito con tolerancia ±1, y factura como Tiquete Electrónico (payment_electronic_document_type='4', requiere disparar 'chosen:updated' en el select). |
| CP-069 | tests/cp069-facturar-contingencia.js | Activa "Factura por Contingencia" (ck_contingency_invoice) y valida que revela el formulario (No. Comprobante/Fecha/Motivo) y fuerza el tipo de documento a Factura Electrónica. Factura Electrónica + contingencia queda bloqueada por el sistema con "debe seleccionar un cliente" pese a tener cliente y datos completos (hallazgo documentado en el código); la alternativa válida confirmada es cambiar a Tiquete Electrónico DESPUÉS de marcar la contingencia, con la cual la venta sí se completa. |
| CP-070 | tests/cp070-facturar-ice-hacienda.js | Activa "Facturar al ICE" (ck_is_ice_invoice, dentro de "Opciones avanzadas" del modal de pago) con el cliente 12735 y un producto gravado. Factura Electrónica + ICE queda bloqueada por la misma validación de cliente que CP-069 (se documenta); la venta se completa con Tiquete Electrónico. Intenta validar "Estado Hacienda = Aceptado" en /ElectronicBilling/ElectronicBillingReport (buscador electronic_billing_search no filtra, mismo defecto que CP-034/customer_search) con reintentos de ~75s; si no resuelve a tiempo, lo reporta como hallazgo (⚠️) en vez de fallar. |
| CP-071 | tests/cp071-exoneracion-hacienda.js | Agrega 2 productos (AAA-Multímetro x2 gravado + AAA-Bombillos x1 exento), lee el IVA del carrito, y aplica una exoneración (set_apply_exoneration_modal(), tipo "01 - Compras autorizadas DGT", 100%) vía el panel de totales (no es por producto, es a nivel de venta). Valida que el monto exonerado (total_exoneration_amount) coincide ±1 con el IVA leído antes de exonerar, confirmando que el monto exonerado corresponde exactamente al impuesto. Mismo bloqueo de Factura Electrónica y mismo patrón de reintentos (~75s) para el estado de Hacienda que CP-070. |
| CP-072 | tests/cp072-planillas-factura-configuracion.js | Mide el tiempo de carga de /invoiceSetting/invoiceSetting ("Admin. factura"); verifica los tabs Factura/Proforma/Ticket (step_invoice/step_proform/step_ticket) y recorre las 36 opciones de plantilla (.btn_element_number_config_panel) y el guardado (save_settings_invoice, confirmado con noty "¡Cambios guardados exitosamente!"). Incluye medición de performance (carga de página, acciones, total del CP) según umbrales acordados con el usuario; una carga >8000ms se documenta como hallazgo (⚠️ RESULT) sin cortar la prueba, para no perder cobertura funcional. **Hallazgo reproducible**: la página tarda 12-18s en cargar (vs. umbral 8000ms) y "Guardar" toma ~7s; toda la funcionalidad (tabs, 36 opciones, guardado) responde correctamente. |
| CP-073 | tests/cp073-factura-credito.js | Verifica factura a crédito con 3 productos distintos: AAA-Multímetro x1 (gravado), AAA-Bombillos x1 (exento), AA-Maletero x1 fracción (prod_frag_q input en el diálogo dialog_product_fragmented_quantity_view). Activa crédito con switch_payment_type(2) — el defecto CP-038 está corregido en la versión actual; la venta a crédito procede incluso con ₡0 de crédito disponible para el cliente 12735. Valida saldo pendiente en /credit_sale/clientCreditSales. Lógica verificada via scripts de inspección pero **script de CP necesita re-ejecución**: en el momento de generarlo, el entorno QA sufrió renderer crashes y timeouts de 100+ segundos por carga acumulada de la sesión de pruebas. |
| CP-074 | tests-playwright/cp074-credito-producto-normal.js | Factura a crédito: 3 productos normales (AAA-Multímetro, AAA-Bombillos, AAA-Filtros) + 1 fraccionado (AA-Maletero) en colones. selectCustomerToPos(12735), switch_payment_type(2), valida saldo en /credit_sale/clientCreditSales. Patrón base para CPs de crédito. |
| CP-075 | tests-playwright/cp075-credito-producto-rapido-dolares.js | Factura a crédito con producto rápido (CABYS fallback a catálogo) en dólares. Conversión de moneda, IVA gravado + exento. CABYS consistentemente falla → fallback a productos del catálogo. |
| CP-076 | tests-playwright/cp076-credito-abono-inicial.js | Factura a crédito + abono inicial en colones. Fuerza colones al inicio (persistencia server-side de moneda). Valida: saldo = total − abono (±1). Patrón para forzar colones: menu_type_currency + querySelectorAll('.mdl-menu'). |
| CP-077 | tests-playwright/cp077-credito-multiples-tipos-descuento.js | Factura a crédito + descuento global 10% via total_discount_input. 3 productos (normal + rápido + fraccionado). Valida descuento = total × 10% (±1). agregarProductoRapidoOFallback() helper. |
| CP-078 | tests-playwright/cp078-abono-factura-credito.js | Busca factura de crédito en /credit_sale/clientCreditSales (#search + #btn_search), aplica abono via pay_customer_invoice(cId, curId) que navega. Usa Promise.all([waitForNavigation, evaluate]) para manejar navegación. Input: invoice_input_NNN (type=number). |
| CP-079 | tests-playwright/cp079-abono-cierre-caja.js | Abono 20% del saldo + verificar en Movimientos de Caja (F9 desde menú #menu_cash). Los abonos de crédito NO aparecen como entradas individuales en movimientos de caja — son sistemas separados. Se reporta como ⚠️ RESULT. |
| CP-080 | tests-playwright/cp080-abono-multiples-metodos-pago.js | Navega con Ctrl+B (helper navegarCtrlB). Aplica 2 abonos secuenciales: efectivo 15% del saldo + tarjeta 10%. aplicarAbono() helper reutilizable. Valida suma total ±1. |
| CP-081 | tests-playwright/cp081-descuento-general-credito.js | Descuento general 15% via total_discount_input en factura a crédito. 3 productos colones. Valida: totalPre − totalPost = totalPre × 15% (±1). Resultado: ₡37,540 → ₡31,909 (diff ₡0.00). |
| CP-082 | tests-playwright/cp082-descuento-linea-credito.js | Descuento por línea: input_product_discount_* está DISABLED por servidor; removeAttribute('disabled') + set_product_total(token) no cambia el total (limitación UI conocida). Carrito POS carga lazily — requiere trigger de producto para forzar render. Pago en efectivo (crédito del cliente agotado): payment_cash_total pre-llenado, make_payment + Enter para confirmar. dialog_payment tiene clase .sweet-alert — excluir del loop. |
| CP-083 | tests-playwright/cp083-limite-credito-cliente.js | Consulta saldo del cliente (₡66M acumulado en QA). Agrega 2 productos, activa crédito, detecta "! Not valid!" como BLOQUEO_DETECTADO del límite. mensajeLimite regex incluye "not valid". Resultado: BLOQUEO_DETECTADO confirmado. |
| CP-084 | tests-playwright/cp084-historial-proformas.js | Navega a /proform/printPosProform. Valida 7 elementos: receip_search, start_date, end_date, btn_search_receip, btn_proform, btn_consignation_proform, btn_workshop_proform. Header "Cotizaciones Ver cotizaciones". Buscar + 3 tabs de tipo. La lista de proformas renderiza con AJAX en contenedor no capturado por selector genérico — test valida estructura, no contenido. |
| CP-085 | tests-playwright/cp085-buscar-proforma-codigo.js | Usa receip_search + btn_search_receip para buscar por código de proforma (e.g. "2303"). Valida antes/después de filtro. Reset con campo vacío. |
| CP-086 | tests-playwright/cp086-proforma-cliente-modal.js | POS F4 (btn_proform_option) → show_create_proform_modal() → abre #dialog_proform. Campo cliente: customer_proform_select (placeholder "Nombre del cliente"). Confirmar: botón "Crear Proforma". Inputs: input_product_quantity_TOKEN, input_product_edit_price_TOKEN, input_product_discount_TOKEN, ck_is_proform__invoice, end_proform_date, proform_observation. |
| CP-087 | tests-playwright/cp087-proforma-productos-rapidos.js | Agrega productos (catálogo fallback — show_quick_product_modal no disponible vía regex). F4 → show_create_proform_modal() → "Crear Proforma". El modal #dialog_proform captura automáticamente los productos del carrito POS. |
| CP-088 | tests-playwright/cp088-proforma-mixta.js | 2 productos del catálogo en dólares (Multímetro + Filtros = $123.26). F4 → show_create_proform_modal() → "Crear Proforma". |
| CP-089 | tests-playwright/cp089-proforma-producto-rapido-exento.js | AAA-Bombillos (exento IVA) + AAA-Multímetro (gravado) en colones. show_invoice_advanced_detail para leer IVA. F4 → crear proforma. |
| CP-090 | tests-playwright/cp090-proforma-descuento-general.js | 3 productos colones. Descuento 15% via total_discount_input → validación ±1 (₡56,285 → ₡47,842.25, diff ₡0.00). F4 → show_create_proform_modal() → "Crear Proforma". selectCustomerToPos(12735) antes de abrir modal. |
| CP-091 | tests-playwright/cp091-proforma-descuentos-individuales.js | 3 productos colones. input_product_discount_TOKEN en modal dialog_proform están disabled (misma limitación que CP-082 en carrito). Limitación documentada. F4 → "Crear Proforma". |
| CP-092 | tests-playwright/cp092-lista-precios-proforma-normal.js | Descubre 7 listas via menu_price_list. Aplica "50% Descuento mayorista" (ID 185) via set_current_pos_price_list(id). Productos AAA-* no tienen precio alternativo en listas QA (limitación de datos). Valida precios carrito↔modal ±1 por token. "Crear Proforma". |
| CP-093 | tests-playwright/cp093-lista-precios-proforma-consignacion.js | Aplica lista ID 186 (10% frecuente). Activa ck_is_consignment_invoice → ck_is_proform__invoice se desmarca automáticamente (mutuamente excluyentes). Valida precios carrito↔modal ±1 por token (diff=0.00). "Crear Proforma". Navega a historial y verifica tab "Prof. de Consignación" con registros. |
| CP-094 | tests-playwright/cp094-proforma-taller-a-orden.js | Activa ck_is_workshop_proform (exclusivo). "Crear Proforma" exitoso. Historial tab "btn_workshop_proform" visible. Botón "convertir a orden" no tiene onclick discernible en el DOM visible del historial (listado AJAX lento o flujo diferente). Limitación documentada. |
| CP-095 | tests-playwright/cp095-consignacion-normal.js | Bombillos + Filtros en colones. ck_is_consignment_invoice=false por defecto → activado → exclusivo confirmado. Total modal "₡56,185.00" = POS. "Crear Proforma". Historial: tab "Prof. de Consignación" (btn_consignation_proform), 56 filas. |
| CP-096 | tests-playwright/cp096-consignacion-taller.js | Multímetro x1 + Filtros x2 en dólares. ck_is_workshop_proform activado (exclusivo). POS=$123.26; modal input_product_edit_price_ muestra precio base sin IVA (~13% menor). "Crear Proforma". Historial: tab "Prof. de Taller" (btn_workshop_proform), 56 filas. |
| CP-097 | tests-playwright/cp097-imprimir-proforma.js | Flujo: POS → crear proforma → historial → get_receip_detail(id) → downloadProformPdf(id, true)="Imprimir" / downloadProformPdf(id)="PDF". Popup about:blank contiene empresa, número, fechas, cliente. Performance: ~6 min para renderizar PDF (⚠️ hallazgo). Acciones descubiertas: confirm_proform, send_invoice_email, get_image_collection. |
| CP-098 | tests-playwright/cp098-shift-p-proforma.js | Shift+P en POS abre #dialog_proform directamente (shortcut nativo). Modal: classes "modal fade in", height=1200px. Productos del carrito en modal. Tipo proforma por defecto (ck_is_proform__invoice=true). Total ₡56,135. "Crear Proforma". |
| CP-099 | tests-playwright/cp099-apartado-sin-abono.js | go_to_layaway_sale() → dialog_payment (mismo que Shift+L). payment_cash_total=0 (sin abono). confirm_add_layaway() crea el apartado directamente. Tab F7: #btn_layaway_option (list), #make_layaway_payment ("REALIZAR ABONO") confirma registro. |
| CP-100 | tests-playwright/cp100-apartado-con-abono.js | go_to_layaway_sale() → dialog_payment → #payment_cash_total=abono (105) → confirm_add_layaway(). Saldo esperado=total−abono (245). Validación numérica limitada por múltiples apartados existentes en QA; registro confirmado por #make_layaway_payment visible en tab F7. |
| CP-101 | tests-playwright/cp101-abono-apartado-existente.js | add_pos_layaway_to_table(id) carga ítems del apartado al carrito → go_to_layaway_sale() abre dialog_payment. En modal: #total_sale_txt=total, #initial_payment_change=abono previo acumulado, #make_layaway_payment="REALIZAR ABONO" (link dentro del modal). payment_cash_total=274.8 (20%) → confirm_add_layaway(). Saldo esperado=1,099.2; no aislable de vista lista. |
| CP-102 | tests-playwright/cp102-calculos-apartados.js | Carga apartado #521 (No.181, ₡1,374.00) desde F7 → dialog_payment muestra: #total_sale_txt, "TOTAL ABONO" / #initial_payment_change, "TOTAL DEVUELTO TARIFA (4.00%)", #make_layaway_payment. Validaciones 4/4: total_F7=total_modal ±1, saldo≥0, total-abono=saldo ±1, ítems en carrito. NOTA: go_to_layaway_sale()+confirm_add_layaway() con cliente 12735 y total>≈₡350 produce "Not valid!" (límite crédito); usar apartado existente evita este bloqueo. |
| CP-103 | tests-playwright/cp103-shift-l-apartados.js | Shift+L abre #dialog_payment nativamente. Antes: {display:none, classes:"modal fade", height:0}. Después: {classes:"modal fade in", height:1200, visible:true}. Contenido: #total_sale_txt=₡350, #initial_payment_change=₡0, #make_layaway_payment="REALIZAR ABONO", #payment_cash_total, Estudio de Crédito link. 5/5 validaciones. |
| CP-104 | tests-playwright/cp104-abrir-cerrar-caja.js | F12 abre dialog_cash_closing (caja abierta) o modal de apertura (caja cerrada). ID clave: dialog_cash_closing. Campos en modal cierre: closure_posted_balance (saldo siguiente), next_cash_closing. Botón: btn_close_cash ("Cerrar Caja"). Confirma: SweetAlert button.confirm "Cerrar". Total cierre leído via regex: "Total general ([\d,]+\.\d{2})". Cierre #380 abierto 2026-07-04, total ₡188,474.57. |
| CP-105 | tests-playwright/cp105-movimiento-entrada.js | F9 o menú Caja→"(F9) Movimientos de caja" abre #dialog_cash_movement. Campos: movenment_cash_quantity (typo intencional del sistema), movenment_cash_observation. Toggle: movenment_cash_in (checkbox, checked=default) → set_movement_in() → cash_movement_type="1"=entrada. Botón submit: #btn_send_movement ("Procesar"). Display efectivo: #movement_cash_total_display. |
| CP-106 | tests-playwright/cp106-movimiento-salida.js | Mismo flujo que CP-105 pero activa movenment_cash_out → set_movement_out() → cash_movement_type="2"=salida. Modal confirma campo vacío y display actualizado. |
| CP-107 | tests-playwright/cp107-calculos-cierre-caja.js | F12→dialog_cash_closing, lee: totalGeneral, ventasTotales, contado, crédito, abonos, entradas, salidas, saldoInicial. Valida: total≥0, parciales(contado+crédito+abonos)≈ventasTotales ±10%, total≤ingresos, todos≥0, ≥2 montos leídos. No cierra la caja — solo lectura. |
| CP-108 | tests-playwright/cp108-cierre-movimientos-mixtos.js | Registra entrada ₡8,000 + salida ₡2,500 via dialog_cash_movement, luego F12→dialog_cash_closing, valida entradas≥₡8,000 en modal y cierra via btn_close_cash. Escenario completo de movimientos mixtos antes del cierre. |
| CP-109 | tests-playwright/cp109-enviar-a-caja-cliente.js | Shift+C→#dialog_send_sale. Selector #search_pos_customer_send_sale es independiente del cliente POS (no se auto-llena con selectCustomerToPos). Pago Contado default, #send_sale_payment→SweetAlert "Enviar". 4/5 validaciones (v4 cliente en modal = ⚠️ comportamiento esperado). |
| CP-110 | tests-playwright/cp110-shift-c-enviar-caja.js | Valida apertura de dialog_send_sale con Shift+C. Antes: {display:none, height:0, hasIn:false}. Después: {visible:true, clase "in", height:1200}. Verifica: #total_send_sale_txt, #search_pos_customer_send_sale, #ck_is_send_sale_payment_cash (Contado por defecto), #send_sale_payment "Enviar a caja", #send_sale_observation. 5/5. |
| CP-111 | tests-playwright/cp111-facturar-orden-taller.js | F3→btn_taller_option, itera .pos-order-card hasta encontrar orden con ítems en #tb_table_buy_list (orden 778: 28 filas). F1→btn_cash_pos→dialog_payment, efectivo (#ck_is_payment_cash/#is_payment_cash), make_payment; SweetAlert cambio ₡131,593.30. Intercepta window.print. 5/5. |
| CP-112 | tests-playwright/cp112-agregar-producto-rapido-taller.js | El catálogo de productos se oculta con una orden de taller activa — busca vía #product_search ("aaa") para forzar al servidor a repoblar el grid con resultados visibles, luego agrega el primero. Valida filas de carrito antes/después, total y contenido de la última fila. |
| CP-113 | tests-playwright/cp113-credito-orden-taller.js | Toma la primera orden del tab Taller y le agrega un producto fresco vía #product_search (evita depender de ítems pre-existentes con precio inválido — varias órdenes de QA disparan "¿Desea continuar?" y dejan el total en ₡0, documentado como hallazgo). Asocia cliente 12735, activa switch_payment_type(2). El cliente 12735 tiene el crédito agotado en este entorno (acumulado de CP-074 a CP-083) → "! Not valid!" detectado en la sweet-alert inmediatamente tras make_payment y documentado como ⚠️ RESULT (mismo patrón que CP-083), no como fallo. |
| CP-114 | tests-playwright/cp114-agregar-items-orden-taller.js | Selecciona primera orden de taller, agrega 3 productos adicionales (Multímetro, Bombillos, Filtros) vía #product_search, factura en efectivo. Valida que el total del carrito creció y coincide con el total del modal de pago ±1. El conteo de filas del carrito no es confiable tras usar #product_search sobre una orden activa (puede reordenarse/consolidarse) — se usa el total como indicador. |
| CP-115 | tests-playwright/cp115-exoneracion-orden-taller.js | Orden de taller + producto gravado fresco + set_apply_exoneration_modal() (100%). Monto exonerado ≈ IVA leído ±1 (mismo patrón que CP-071). Al facturar, Factura Electrónica queda bloqueada por validación de cliente (BUG-005/BUG-007 conocido, mencionado en el pedido original) incluso cambiando a Tiquete Electrónico — se documenta como hallazgo sin completar la venta. |
| CP-116 | tests-playwright/cp116-descuento-general-pos.js | 3 productos en colones, descuento general 15% vía total_discount_input, valida reducción ±1, factura en efectivo. |
| CP-117 | tests-playwright/cp117-descuento-unitario-producto.js | 3 productos, descuento individual 20% vía input_product_discount_TOKEN — mismo hallazgo que CP-082: el input está disabled por servidor y removeAttribute('disabled')+set_product_total(token) no cambia el total visible. Documentado como limitación conocida, factura igual en efectivo. |
| CP-118 | tests-playwright/cp118-producto-rapido-con-iva.js | Intenta producto rápido gravado vía flujo CABYS (mismo patrón que CP-075/CP-051); CABYS consistentemente inestable → fallback a AAA-Multímetro del catálogo. Valida IVA > 0 vía show_invoice_advanced_detail, factura en efectivo. |
| CP-119 | tests-playwright/cp119-producto-rapido-sin-iva.js | Igual que CP-118 pero producto exento; fallback a AAA-Bombillos. Valida IVA = 0. |
| CP-120 | tests-playwright/cp120-cambio-moneda-pos.js | Lee total de un producto en colones, limpia carrito, cambia a Dólar Americano (menu_type_currency → "Dólar Americano"), agrega el mismo producto y lee total en dólares. El elemento con el tipo de cambio en pantalla no se pudo localizar (hallazgo) pero la conversión implícita es consistente. |
| CP-121 | tests-playwright/cp121-lista-precios-pos.js | Aplica cada una de las listas ID 186, 185, 194 vía set_current_pos_price_list() y compara precios (input_product_edit_price_TOKEN) de 2 productos AAA-* contra el precio base — sin variación en ninguna lista (misma limitación de datos QA documentada en CP-092: esos productos no tienen precio alternativo configurado). |
| CP-122 | tests-playwright/cp122-buscador-productos.js | 3 búsquedas vía #product_search: por nombre ("multimetro"), por código completo y por código de barras parcial. En este sistema el "código" interno y el código de barras son el mismo campo (input_hide_product_code_<id>, ej. "7441003590489" para AAA-Multímetro) — las 3 búsquedas encuentran el mismo producto. |
| CP-123 | tests-playwright/cp123-vista-cuadricula-lista.js | style_list → agrega un producto, style_box → agrega otro. Tras cada cambio de vista hace falta esperar ~2.5s a que el grid repinte antes de buscar el product_box. Valida que ambos productos quedan en el carrito tras alternar de vista. |
| CP-124 | tests-playwright/cp124-limpiar-productos-ctrl-x.js | Agrega 3 productos en colones, ejecuta `page.keyboard.press('Control+x')` (tras `document.body.focus()`), confirma el diálogo "Limpiar lista" si aparece (mismo patrón que `cancel_sale` en CP-052). Valida 0 filas en `tb_table_buy_list` y el placeholder "Agrega productos para facturar" visible. |
| CP-125 | tests-playwright/cp125-observaciones-factura.js | Campo de observación de venta: `#sale_observation` (textarea, placeholder "Observaciones de venta"), visible dentro de `dialog_payment` tras abrir el modal de pago. **Hallazgo de pago reproducible**: al facturar en efectivo, si solo se marca el checkbox `ck_is_payment_cash` sin llamar `switch_payment_type(1)` explícitamente, el sistema devuelve "! Not valid!" indefinidamente (probado sin cliente asociado y en colones y dólares — no es un problema de cliente ni de moneda). El orden correcto para confirmar "Su cambio es: X — Pagar (↵ ENTER)" es: click en `make_payment` → esperar ~1.5s → UN solo `Enter` → esperar ~1s → recién ahí entrar al loop que cierra sweet-alerts subsiguientes (mismo orden que CP-082; hacerlo en el mismo ciclo que el click genérico de botón termina clickeando "Cancel" por error). **Hallazgo secundario**: montos pequeños en Dólar Americano (ej. $0.55) devuelven "! Not valid!" de forma reproducible incluso con el monto exacto y sin cliente — no se pudo determinar la causa exacta (posible validación de monto mínimo o redondeo), se documenta y se factura en colones. La verificación de la observación en el detalle del historial (F5, `#dialog_invoice_import_detail_view`) no encontró el texto — puede que ese popup no incluya el campo; se envuelve en un `Promise.race` con timeout duro de 20s porque en un intento previo esa verificación quedó colgada sin explicación clara. |
| CP-126 | tests-playwright/cp126-facturar-sinpe-movil.js | Método de pago SINPE Móvil: checkbox `is_payment_check` (nombre interno engañoso — NO es cheque, es SINPE) y su monto en `payment_check_total`. Los checkboxes de método de pago usan un slider CSS fuera del viewport del modal — hay que activarlos/desactivarlos con `page.evaluate(id => document.getElementById(id).click(), id)`, nunca con `page.locator().click()`. Hay que desactivar `is_payment_cash` (activo por defecto) ANTES de activar el método nuevo. `#payment_cash_total` es más confiable que `#total_sale_txt` para confirmar que el modal ya abrió (el segundo puede seguir hidden durante el render inicial). SINPE exige el monto EXACTO del total leído de `#total_sale_txt` (no admite exceso como efectivo). Pasó a la primera con 2 productos de catálogo + 1 rápido (CABYS falló, fallback a catálogo, mismo hallazgo que CP-051). |
| CP-127 | tests-playwright/cp127-facturar-transaccion-bancaria.js | Método de pago transacción bancaria: checkbox `is_payment_transaction` y su monto en `payment_transaction_total`. Mismo patrón que CP-126 (activar/desactivar vía `page.evaluate` + click, monto exacto del total, `#payment_cash_total` como señal de modal abierto). Probado en dólares ($123.10) sin problemas — el hallazgo de "! Not valid!" en dólares documentado en CP-125 era específico de efectivo (`switch_payment_type`), no aplica a transacción bancaria. |
| CP-128 | tests-playwright/cp128-carga-modulo-rutas.js | Primer CP con sesión reutilizable (`abrirContextoConSesion` + `refrescarConCacheLimpia`, ver sección "Autenticación en las pruebas" del README). Carga de `/route/adminRoute`: título, `#search_route`/`#btn_search_route`, `#btn_add_route`, listado `.pce-table` con ≥1 ruta. Tras `refrescarConCacheLimpia` la tabla tarda en poblarse vía AJAX — hace falta poll hasta que aparezca texto "clientes" antes de leer el estado. |
| CP-129 | tests-playwright/cp129-crear-nueva-ruta.js | Crea ruta con nombre único (timestamp) + zona "Cedral" vía `#dialog_add_route`, confirma que el modal se cierra tras guardar y que la ruta aparece al buscarla por nombre tras refrescar. |
| CP-130 | tests-playwright/cp130-validar-nombre-vacio.js | Intenta guardar `#dialog_add_route` con `#route_name_input` vacío — el modal permanece abierto (validación nativa) y el conteo de rutas no cambia. Caso de error/validación. |
| CP-131 | tests-playwright/cp131-buscar-ruta-nombre.js | 3 búsquedas con `#search_route`/`#btn_search_route`: término existente (filtra), término inexistente (0 resultados), búsqueda vacía (restaura el listado completo). El texto de cada `<tr>` incluye el menú `.dropdown-menu` oculto (contiene "Asignar clientes/repartidores") — hay que clonar la fila y remover ese menú antes de leer el nombre real de la ruta, si no el nombre queda truncado/contaminado. |
| CP-132 | tests-playwright/cp132-asignar-cliente-ruta.js | Crea una ruta fresca (0 clientes), abre "Asignar clientes" (`routeManager.showClientModal`), agrega el primer cliente seleccionable clickeando el ícono `i.fa-angle-double-right`, valida que el contador de la ruta pasa de 0 a 1 tras refrescar y volver a buscarla. |
| CP-133 | tests-playwright/cp133-asignar-repartidor-ruta.js | Mismo patrón que CP-132 con `routeManager.showDealerModal` y `#dialog_add_dealer_route`. También valida que desaparece el texto "No hay repartidores vinculados" (validación secundaria, no bloqueante — puede tardar en re-renderizar). |
| CP-134 | tests-playwright/cp134-editar-comision.js | Admin. Comisiones (`/route/adminCommission`): abre "Editar Comision" (`add_commission`), ingresa un monto aleatorio (100-500) en `#modal_input_commission_amount` SIN tocar el checkbox `#modal_ck_commission_value` (viene premarcado; clickearlo lo desmarca y oculta el campo), guarda con el botón `.btn-success` (sin `type="submit"`, no matchea ese selector) y valida que el valor persiste ±1 tras refrescar. Confirmado por red: `POST /route/updateDocumentCommission`. |
| CP-135 | tests-playwright/cp135-editar-ruta-existente.js | Crea ruta fresca, abre "Editar ruta" (edición inline, no modal — ver sección 14). Extrae el ID de la ruta desde `tr#tr_route_<ID>`, modifica `#input_route_name_<ID>` vía JS y guarda con el botón `tr#tr_route_<ID> button.btn-success` (`routeManager.saveRouteChange(id)`). Valida que el nombre nuevo persiste y el original ya no existe (usando coincidencia exacta, no `includes`, porque el nombre editado contiene el original como substring). |
| CP-136 | tests-playwright/cp136-eliminar-ruta-existente.js | Crea una ruta descartable exclusiva ("... DESCARTABLE ..." + timestamp) para no arriesgar rutas de otros CPs — acción destructiva sin deshacer. Usa "Eliminar la ruta" → SweetAlert "¿Está seguro? Esta acción eliminará la ruta" con botones "Cancelar"/"Sí, eliminar" (buscar por texto). Confirmado por red: `POST /route/deleteRoute` → `{"success":true,"message":"Ruta eliminada correctamente"}`. Nota: el texto del SweetAlert a veces incluye ruido "! Not valid!" mezclado (boilerplate residual de otro diálogo) sin afectar el resultado — la validación usa un regex laxo (`/segur/i`), no comparación exacta. |

---

## 6. URL base del sistema bajo prueba

URL base principal:
- https://dev.designsoftcr.com/qa_talleralpha/public/

URLs frecuentes usadas en los scripts:
- Login: https://dev.designsoftcr.com/qa_talleralpha/public/log/login
- Dashboard: https://dev.designsoftcr.com/qa_talleralpha/public/dashboard
- Recepción: https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/vehicularQuickReception
- Tablero: https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/workOrderBoard
- Reportes: https://dev.designsoftcr.com/qa_talleralpha/public/reports/order_report

---

## 7. Credenciales de prueba usadas

Usuario de QA utilizado en los scripts:
- Usuario: qadesignsoftcr@gmail.com
- Contraseña: qa0000

Estas credenciales aparecen en múltiples casos de login y navegación.

---

## 8. Dependencias del proyecto

Dependencia declarada en el proyecto:
- selenium-webdriver ^4.45.0

Instalación:
```bash
npm install
```

El archivo package-lock.json está presente y registra la dependencia exacta instalada.

---

## 9. Cómo ejecutar las pruebas

### Ejecutar un caso individual
```bash
node tests/cp001-login-valido.js
```

### Ejecutar toda la suite
```bash
node tests/runner.js
```

### Comportamiento del runner
- El archivo tests/runner.js recorre todos los archivos que coinciden con el patrón cpNNN-*.js.
- Ejecuta cada script con Node.
- Genera un reporte HTML en reports/reporte-pruebas.html.

### Recomendación práctica
- Ejecutar casos individuales para depurar.
- Ejecutar runner.js cuando se quiere validar la suite completa.

---

## 10. Repositorio GitHub y rama principal

Repositorio remoto:
- https://github.com/vvaalz/proyecto-dsd.git

Rama principal actual:
- main

---

## 11. Próximos casos de prueba pendientes o áreas sin cubrir aún

Áreas que aún requieren refuerzo o implementación formal:
- CP-026 (caso pendiente de definición).
- Validación end-to-end más robusta de mensajes de WhatsApp, chat interno y abonos.
- Mejora de selectores para que los casos no dependan tanto de textos o elementos ambiguos.
- Estandarización de assertions con mayor comprobación visual y de estado.
- Generación de reportes más detallados con evidencia por caso.
- Posible migración a un framework de automatización más estructurado (por ejemplo, Mocha/Jest + Selenium + Page Objects).

---

## 12. Notas importantes sobre el entorno

- Se usa Chrome como navegador principal.
- En varios scripts se habilita la opción para deshabilitar notificaciones.
- Se recomienda usar resolución de ventana 1440x1200 para minimizar problemas de layout.
- Los waits suelen basarse en:
  - until.urlContains(...)
  - until.elementLocated(...)
  - driver.sleep(...) como fallback para tiempos de renderizado.
- Algunos casos son de naturaleza exploratoria y dependen de elementos dinámicos del sistema.
- Para mantener estabilidad, conviene evitar selectores demasiado frágiles y preferir IDs o placeholders cuando estén disponibles.
- La suite está pensada para pruebas funcionales de aceptación y exploración rápida, no para un framework de regresión muy formalizado.

---

## 13. Recomendaciones para Claude Code

- Priorizar cambios sobre archivos en tests/.
- Mantener el estilo existente de funciones async con nombres cpNNN_... .
- No romper el patrón try/catch/finally y cierre del driver.
- Si se agregan nuevos casos, seguir el formato cpNNN-descripcion.js.
- Si se mejora la arquitectura, mantener compatibilidad con runner.js.
- Para depuración, ejecutar primero el caso individual antes de correr toda la suite.

---

## 14. Módulo Ruteo (CP-128 en adelante)

Explorado con `auth/usar-sesion.js` (sesión reutilizable) el 2026-07-07. En el menú lateral el módulo aparece como **"Rutas"** (no "Ruteo"); es un acordeón con dos sub-ítems: "Admin. Rutas" y "Admin. Comisiones". El buscador rápido Ctrl+B del dashboard usa un input embebido `#quick_search` (distinto del `#dialog_quick_search` de POS) cuyos resultados devuelven `href="javascript:void(0);"` repetido en varios ítems — no sirve para hacer match por href, hay que clickear el link del sidebar por texto o navegar directo por URL.

### URLs
- Admin. Rutas: `https://dev.designsoftcr.com/qa_talleralpha/public/route/adminRoute`
- Admin. Comisiones: `https://dev.designsoftcr.com/qa_talleralpha/public/route/adminCommission`
- Dashboard (tras login): `https://dev.designsoftcr.com/qa_talleralpha/public/dash/dashboard` (¡`/public/dashboard` sin `dash/` da 404!)

### Admin. Rutas — filtros/búsqueda (barrido completo, 2026-07-07)
- **Único filtro real de la pantalla**: `#search_route` (input de texto, placeholder "Buscar ruta...") + `#btn_search_route` — busca por nombre de ruta, ya cubierto en detalle por CP-131 (término existente, inexistente, limpiar búsqueda).
- **No hay ningún otro control de filtrado** para rutas: se inspeccionó exhaustivamente la barra completa (todos los `input`/`select`/`button`/checkbox visibles antes de la tabla `.pce-table`) y no existe filtro por zona, por cliente, por repartidor asignado, ni por estado.
- El dropdown visible como **"Compañía" (ej. "TALLER ALPHA PREMIUM")** que aparece junto al buscador NO es un filtro de rutas — es el **selector global de compañía/tenant** compartido por el header de la app (mismo widget y mismas opciones que en el dashboard: TALLER ALPHA PREMIUM, ACTUALIZACIÓN DE TALLER ALPHA, COLOMBIA, COMPAÑÍA CONTABILIDAD, Design Soft, El Salvador, HONDURAS, MAKAN DEMO DE GUATEMALA, Panama 2, etc.). No es un `<select>` nativo — es un widget custom (no se encontró vía `document.querySelectorAll('select')`, hubo que clickearlo por coordenadas de pantalla). Cambiarlo navegaría a un contexto de compañía totalmente distinto (out of scope — todos los CPs 001-136 asumen "TALLER ALPHA PREMIUM").
- Conclusión: la cobertura de filtrado de CP-131 (búsqueda por nombre) ya es completa para este módulo; no hay superficie adicional de filtros que cubrir con nuevos CPs.

### Admin. Rutas — listado
- `#search_route` (input, placeholder "Buscar ruta...") + `#btn_search_route`
- `#btn_add_route` ("Agregar Nueva Ruta") → abre `#dialog_add_route`
- Tabla `.pce-table`: cada fila = una ruta, con franja de color a la izquierda, nombre, badges "N Clientes" / "M Repartidores", y un botón `more_vert` (`button.mdl-button--icon[data-toggle="dropdown"]`) que despliega un `ul.dropdown-menu[role="menu"]` con 4 acciones (ojo: la primera exploración truncó el HTML del menú a 800 caracteres y solo mostró las primeras 2 — hay 2 más):
  - "Asignar clientes" → `onclick="routeManager.showClientModal(ID_RUTA)"` → abre `#dialog_add_client_route`
  - "Asignar repartidores" → `onclick="routeManager.showDealerModal(ID_RUTA)"` → abre `#dialog_add_dealer_route`
  - "Editar ruta" → `onclick="routeManager.editRoute(ID_RUTA)"` — **NO abre un modal**: convierte la fila `<tr>` en edición inline (ver detalle abajo)
  - "Eliminar la ruta" → `onclick="routeManager.confirmDeleteRoute(ID_RUTA)"` → abre un SweetAlert de confirmación
- **No existe campo de "estado" (activo/inactivo) para las rutas** — se confirmó explícitamente: no hay checkboxes/switches en la página, el nombre de la ruta no navega a ningún detalle (la fila `<tr>` no tiene onclick propio), y no hay ninguna mención de "estado/activo/inactivo/habilitar" en el texto visible de la pantalla.
- Rutas existentes en QA: "RUTA 3" (id 39, 2 clientes/0 repartidores), "RUTA 2" (3 clientes/1 repartidor), "RUTA PUERTO VIEJO - SAN JOSÉ" (3 clientes/1 repartidor)

### "Editar ruta" (edición inline, NO es un modal) — CP-135
- Al hacer clic en "Editar ruta" del menú de acciones, la fila `<tr id="tr_route_<ID_RUTA>">` se reemplaza in-place por campos editables:
  - `input#input_route_name_<ID_RUTA>` (nombre, texto plano)
  - `select#c_zone_select_<ID_RUTA>` (zona)
  - Botón guardar: `<button class="btn btn-success ..." onclick="routeManager.saveRouteChange(<ID_RUTA>)">` (ícono `i.fa-save`)
  - Botón cancelar: `<button class="btn btn-default ..." onclick="routeManager.cancelEdit(<ID_RUTA>)">` (ícono `i.fa-times`)
- El ID de la ruta se puede extraer del atributo `id` de la fila (`tr_route_50` → 50) o de cualquiera de los `onclick` de sus botones de acción (`routeManager.showClientModal(50)`, etc.)
- Después de "saveRouteChange" hay que recargar/refrescar y volver a buscar la ruta para confirmar el nombre nuevo persistido — la fila vuelve a su vista normal (no-edición) sola tras guardar.

### "Eliminar la ruta" (SweetAlert de confirmación) — CP-136
- Al hacer clic en "Eliminar la ruta" se abre un `.sweet-alert` con ícono de advertencia: título "¿Está seguro?", texto "Esta acción eliminará la ruta", botones "Cancelar" y "Sí, eliminar" (buscar por texto, sin id propio)
- Confirmado por red: `POST /route/deleteRoute` → `{"success":true,"message":"Ruta eliminada correctamente","data":1}`. Es una acción **destructiva sin deshacer** — solo usar sobre rutas creadas por el propio CP.

### Modal "Agregar Nueva Ruta" (`#dialog_add_route`)
- `#route_name_input` (text, requerido, placeholder "Ej: Ruta Centro")
- `#route_zone_select` (select; en QA solo hay una zona real además del placeholder: value="19" text="Cedral")
- `#btn_save_new_route` ("Guardar"), botón "Cancelar"
- Validación: guardar con nombre vacío NO cierra el modal ni muestra sweet-alert — se queda abierto (validación nativa del campo requerido)

### Modal "Asignar Clientes" (`#dialog_add_client_route`)
- Layout de 2 columnas: "Todos los clientes seleccionables" (izquierda) / "Todos los clientes seleccionados" (derecha)
- Izquierda: `#select_filter_canton_client`, `#select_filter_district_client`, `#input_search_internal_client` (placeholder "Buscar cliente..."), `#btn_search_client`. Cada fila de cliente tiene un ícono `i.fa-angle-double-right` (dentro de un `<td>`, sin `onclick` propio — el handler está delegado más arriba, un `.click()` normal sobre el ícono dispara el evento igual) para agregarlo a la ruta. El mismo ícono/patrón aplica en el modal de repartidores.
- Derecha: `#select_filter_canton_client_linked`, `#select_filter_district_client_linked`, `#input_search_internal_client_linked` (placeholder "Buscar cliente seleccionado..."), `#btn_search_client_linked`. Los clientes ya asignados aparecen numerados con un ícono de arrastre (reordenar) y un ícono de basurero (desvincular).
- Botón "Cerrar" (sin id propio localizado, buscar por texto)

### Modal "Asignar Repartidores" (`#dialog_add_dealer_route`)
- Mismo layout de 2 columnas pero sin filtros de cantón/distrito
- Izquierda: `#input_search_internal_dealer` (placeholder "Buscar repartidor..."), `#btn_search_dealer`
- Derecha: `#input_search_internal_dealer_linked` (placeholder "Buscar repartidor seleccionado..."), `#btn_search_dealer_linked`
- Cuando no hay repartidores vinculados muestra el texto "No hay repartidores vinculados"

### Admin. Comisiones (`/route/adminCommission`)
- Tabla `#table_products` con una fila por tipo de documento: "Factura Electrónica", "Tiquete Electrónico", "Factura Interna" — cada una muestra "Tipo comisión: N/A / Valor: N/A" cuando no está configurada
- Botón `#ddMenuList` (more_vert) por fila → menú con un solo ítem "Editar Comision" (`onclick="add_commission(ID)"`) → abre `#dialog_add_commission`
  - `#modal_input_commission_amount` (text, placeholder "Valor en monto")
  - Botón "Guardar" → `<button class="btn btn-success ..." onclick="save_document_commission()">` **sin `type="submit"`** — un selector `button[type="submit"]` nunca lo encuentra; hay que buscarlo por texto ("guardar") o por clase `.btn-success`. Botón "Salir" (`data-dismiss="modal"`, sin tipo tampoco).
  - **Hallazgo/trampa**: el checkbox `#modal_ck_commission_value` ("Valor") YA viene marcado por defecto al abrir el modal. `switch_commission_option()` actúa como **toggle**, no como selección — clickearlo lo DESMARCA y oculta `#modal_commission_amount_content` (display:none), dejando el monto sin efecto aunque se llene. No hay que tocar ese checkbox si ya se quiere comisión por "Valor"; solo llenar `#modal_input_commission_amount` (vía JS directo: `el.value = X; el.dispatchEvent(new Event('input',{bubbles:true}))` — el campo puede no estar "visible" para Playwright en algunos casos por el toggle previo, así que `page.fill()` puede colgarse esperando visibilidad).
  - Confirmado por red: guarda vía `POST /route/updateDocumentCommission` (`commission_type=0` para "Valor"), responde `{"success":true,"message":"Comisión actualizada correctamente"}`. El valor persiste y es legible tras refrescar en el texto de la fila ("Valor: NNN.00").
