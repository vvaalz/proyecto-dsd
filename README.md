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