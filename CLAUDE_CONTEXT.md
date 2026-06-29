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
