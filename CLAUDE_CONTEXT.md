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

**Actualizado 2026-07-08** tras la reorganización de `tests-playwright/` en subcarpetas por módulo → submódulo del sistema real (antes los 145 archivos estaban sueltos en una sola carpeta).

```text
proyecto-dsd/
├── README.md
├── CLAUDE_CONTEXT.md
├── package.json / package-lock.json
├── playwright.config.js
├── reports/
│   └── screenshots/            (screenshots de fallo, generadas en cada corrida)
├── auth/
│   ├── generar-sesion.js       (login único → storageState)
│   ├── usar-sesion.js          (abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH)
│   ├── test-sesion.js
│   └── sesion-qa.json          (ignorado por git — tokens activos)
├── tests/
│   └── selenium-backup/        (suite histórica en Selenium — respaldo, NO se ejecuta ni se modifica)
└── tests-playwright/           (suite ACTIVA, Playwright)
    ├── example.spec.js         (boilerplate de `npm init playwright`, no es un CP)
    ├── 00-acceso/
    │   ├── 01-login/                      (CP-001 – CP-004)
    │   └── 02-dashboard/                  (CP-005)
    ├── 01-facturar/
    │   ├── 01-pos-basico/                 (CP-031 – CP-057)
    │   ├── 02-pos-avanzado/               (CP-058 – CP-073)
    │   ├── 03-factura-credito/            (CP-074 – CP-083)
    │   ├── 04-proforma-cotizaciones/      (CP-084 – CP-098)
    │   ├── 05-apartados/                  (CP-099 – CP-103)
    │   ├── 06-cierre-caja/                (CP-104 – CP-108)
    │   ├── 07-ordenes-caja-taller/        (CP-109 – CP-125)
    │   ├── 08-metodos-pago-generales/     (CP-126 – CP-127)
    │   ├── 09-ruteo-pos/                  (CP-137 – CP-145)
    │   ├── 11-end-pintura/                (CP-171 – CP-172)
    │   └── 12-productos-externos/         (CP-177 – CP-182)
    ├── 02-gestion-taller/
    │   ├── 01-recepcion-vehiculo/         (CP-006 – CP-016)
    │   └── 02-taller-basico/              (CP-017 – CP-030, incluye el CP-017 duplicado: dos archivos cp017-*.js)
    ├── 03-rutas/
    │   └── 01-admin-rutas/                (CP-128 – CP-136)
    └── 04-panel-control/
        └── 01-general/                    (CP-146 – CP-176)
```

Notas:
- La suite ACTIVA es `tests-playwright/` (Playwright). `tests/selenium-backup/` es un respaldo histórico de la suite anterior en Selenium — no se ejecuta, no se modifica.
- Cada CP se ejecuta con `node tests-playwright/<modulo>/<submodulo>/cpNNN-descripcion.js` (ruta completa, ya no hay archivos sueltos en la raíz de `tests-playwright/`).
- Como cada CP vive 2 niveles por debajo de `tests-playwright/`, las rutas relativas dentro del código usan 3 `../`: `require('../../../auth/usar-sesion')` y `path.join(__dirname, '..', '..', '..', 'reports', 'screenshots')`.
- "01-facturar/09-ruteo-pos" (órdenes de ruteo creadas desde el POS) y "03-rutas/01-admin-rutas" (administración de rutas/zonas/clientes/repartidores) son módulos DISTINTOS aunque ambos usan la palabra "ruteo"/"rutas" — ver secciones 14 y 15.
- Ver sección 16 "Convención de carpetas para CPs nuevos" antes de crear un CP nuevo.

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
**Actualizado 2026-07-08** — la suite activa usa Playwright, no Selenium (ver sección 4 para el patrón real y actualizado).
- Los scripts usan async/await.
- La lógica se organiza en funciones asíncronas.
- El patrón estándar (CP-128 en adelante, y el que debe seguir todo CP nuevo) es:
  1. Lanzar `chromium.launch()`.
  2. Obtener un contexto con sesión reutilizable vía `abrirContextoConSesion(browser)` (`auth/usar-sesion.js`) — no login manual.
  3. Navegar al módulo correspondiente (con reintento automático si la sesión expiró — patrón `navegarAModulo`).
  4. Ejecutar `refrescarConCacheLimpia(page)` para evitar HTML/JS cacheado de una corrida anterior.
  5. Esperar por elementos o estado esperado del módulo.
  6. Ejecutar la lógica y validaciones del caso.
  7. Registrar resultado en consola (`✅ PASSED` / `⚠️ RESULT` / `❌ FAILED`).
  8. Cerrar el browser en `finally` (`browser.close()`).
  - CP-001 a CP-127 usan una variante "legacy" de este mismo patrón con login manual (`#email`/`#password`/`#loginButton`) en vez de sesión reutilizable — ya están congelados, no se tocan, y no es el patrón a replicar en CPs nuevos.

### Manejo de errores
- El patrón típico es try/catch/finally, con `browser.close()` en el finally.
- Los fallos se registran con mensajes claros en consola y toman un screenshot (`screenshotOnFail`) antes de salir.
- Se usa `process.exit(1)` cuando una validación crítica no se cumple.
- Si una acción puede disparar una llamada AJAX síncrona del lado de la app (pagos, cierres de caja, confirmaciones contra el servidor), envolver ese `page.evaluate()` con un timeout explícito (`evaluateConTimeout`, ver hallazgo CP-107/CP-108 más abajo) para fallar rápido con mensaje claro en vez de colgarse indefinidamente si el servidor no responde.

---

## 4. Patrón de código estándar de los casos de prueba

**Actualizado 2026-07-08.** Este es el patrón vigente en Playwright (no Selenium) que debe seguir todo CP nuevo — es el mismo que genera el skill `crear-caso-prueba`. Basado en el patrón real usado en CP-137 y siguientes:

```javascript
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');

const URL_MODULO = 'https://dev.designsoftcr.com/qa_talleralpha/public/URL_DEL_MODULO';

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function navegarAModulo(browser, context, url) {
  let page = await context.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(3000);
  if (/\/log\/login/i.test(page.url())) {
    console.log('⚠️ Sesión expirada (redirect a /log/login) — regenerando y reintentando...');
    await page.close();
    fs.rmSync(SESION_PATH, { force: true });
    const contextNuevo = await abrirContextoConSesion(browser);
    page = await contextNuevo.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: 180000 });
    await page.waitForTimeout(3000);
    if (/\/log\/login/i.test(page.url())) throw new Error('Sigue redirigiendo a /log/login tras regenerar la sesión');
    return { context: contextNuevo, page };
  }
  return { context, page };
}

async function cpNNN_nombre_descriptivo() {
  console.log('🔄 Ejecutando CP-NNN: <descripción corta del caso>...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, URL_MODULO));
    await page.waitForSelector('SELECTOR_DE_CARGA', { state: 'attached', timeout: 60000 });
    evaluarCargaPagina(Date.now() - t0, 'Carga del módulo');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('SELECTOR_DE_CARGA', { state: 'attached', timeout: 60000 });

    // ... lógica específica del caso (localizar elementos, interactuar) ...

    // ── VALIDACIONES ──
    const v1 = true; // reemplazar por la verificación real
    console.log('\n📊 === VALIDACIONES CP-NNN ===');
    console.log('  <validación 1>: ' + (v1 ? '✅' : '❌'));
    if (!v1) throw new Error('<razón concreta del fallo>');

    console.log('✅ CP-NNN PASSED | <resumen> | validaciones: 1/1');

  } catch (error) {
    await screenshotOnFail(page, 'cpNNN-fail');
    console.log('❌ CP-NNN FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cpNNN_nombre_descriptivo();
```

### Características del patrón
- Sesión reutilizable (`abrirContextoConSesion`) en vez de login manual — estándar desde CP-128.
- `refrescarConCacheLimpia(page)` después de cada navegación, antes de la lógica del caso.
- `navegarAModulo` maneja sesión expirada (redirect a `/log/login`): regenera y reintenta una sola vez.
- Uso de console.log con emojis para trazabilidad (🔄 inicio, 📊 validaciones, ✅/⚠️/❌ resultado).
- Screenshot automático en fallo (`screenshotOnFail`) antes de salir con `process.exit(1)`.
- Cierre del browser en `finally`.
- Acciones que puedan disparar una llamada AJAX síncrona bloqueante del lado de la app se envuelven con un timeout explícito (`evaluateConTimeout`) — ver hallazgo y ejemplo real a continuación.

### Hallazgo 2026-07-08 — timeout explícito para acciones de caja/pago (CP-107, CP-108)
Durante la reorganización de carpetas se detectó que `tests-playwright/01-facturar/06-cierre-caja/cp108-cierre-movimientos-mixtos.js` se colgaba **indefinidamente** al clickear `btn_send_movement` (botón "Procesar" del modal de movimiento de caja). Investigado con un script de diagnóstico descartable (`page.on('dialog')` + `Promise.race` por paso): no era un diálogo nativo `alert()`/`confirm()` bloqueando Playwright — el `page.evaluate()` que dispara el click nunca resolvía ni rechazaba, consistente con que el handler de `btn_send_movement` en la app hace una llamada AJAX **síncrona** al servidor que nunca recibe respuesta (confirmado por errores `net::ERR_CONNECTION_CLOSED` en consola contra `dev.designsoftcr.com`, un problema del servidor compartido de QA, no del script ni de la reorganización).

**Fix aplicado** (2026-07-08) en CP-107 y CP-108: se envolvió la acción de riesgo con un helper `evaluateConTimeout` que corre `page.evaluate()` contra un timeout explícito (25s) vía `Promise.race`, y si se cumple el timeout, lanza un error descriptivo en vez de dejar el proceso colgado:
```javascript
async function evaluateConTimeout(page, fn, timeoutMs, mensajeTimeout) {
  const raced = await Promise.race([
    page.evaluate(fn).then(resultado => ({ ok: true, resultado })),
    new Promise(resolve => setTimeout(() => resolve({ ok: false }), timeoutMs))
  ]);
  if (!raced.ok) throw new Error(mensajeTimeout);
  return raced.resultado;
}
```
- **CP-108**: envuelve el click en `btn_send_movement` (registro de entrada/salida de caja) — mensaje: `"Timeout: el servidor no respondió al procesar movimiento de caja (posible ERR_CONNECTION_CLOSED) — btn_send_movement no completó en 25000ms"`.
- **CP-107**: envuelve `start_open_cash()` (apertura de caja cuando estaba cerrada) con el mismo patrón, por el mismo tipo de riesgo (timing-race ya observado en CP-104, que usa un fallback similar).
- Verificado tras el fix: CP-107 corrió y pasó normalmente (4/5, caja ya abierta — no ejerció la ruta de apertura). CP-108 falló en ~25s (antes se colgaba 5+ minutos) con el mensaje descriptivo esperado, confirmando que el fix cumple su objetivo: fallar rápido y claro en vez de colgarse. Nota: en este escenario específico (hilo de JS de la página bloqueado en segundo plano) el screenshot de fallo puede no capturarse — no afecta el objetivo principal del fix.
- Este patrón (`evaluateConTimeout`) debe aplicarse a futuro en cualquier CP nuevo que dispare una acción de guardado/confirmación contra el servidor donde un cuelgue silencioso sea posible — ver plantilla del skill `crear-caso-prueba`.

---

## 5. Lista de casos de prueba (CP-001 a CP-145)

La suite en el repositorio contiene actualmente los CP-001 a CP-145, organizados en `tests-playwright/` bajo subcarpetas de módulo/submódulo (ver sección 16 "Convención de carpetas para CPs nuevos"). La tabla de rutas de archivo abajo refleja esa estructura.

| Código | Archivo | Descripción breve |
|--------|---------|-------------------|
| CP-001 | tests-playwright/00-acceso/01-login/cp001-login-valido.js | Valida login correcto con credenciales válidas. |
| CP-002 | tests-playwright/00-acceso/01-login/cp002-login-invalido.js | Verifica que un login con contraseña incorrecta no entre al sistema. |
| CP-003 | tests-playwright/00-acceso/01-login/cp003-campos-vacios.js | Valida que el sistema rechace el login si los campos están vacíos. |
| CP-004 | tests-playwright/00-acceso/01-login/cp004-usuario-inexistente.js | Comprueba el comportamiento ante un usuario inexistente. |
| CP-005 | tests-playwright/00-acceso/02-dashboard/cp005-carga-dashboard.js | Verifica que el dashboard cargue correctamente tras iniciar sesión. |
| CP-006 | tests-playwright/02-gestion-taller/01-recepcion-vehiculo/cp006-acceso-recepcion-vehiculo.js | Valida acceso al módulo de Recepción de Vehículo. |
| CP-007 | tests-playwright/02-gestion-taller/01-recepcion-vehiculo/cp007-agregar-cliente-nuevo.js | Comprueba la creación de un cliente nuevo con datos mínimos. |
| CP-008 | tests-playwright/02-gestion-taller/01-recepcion-vehiculo/cp008-asignar-mecanico-servicio.js | Verifica que al agregar un servicio se pueda asignar mecánico. |
| CP-009 | tests-playwright/02-gestion-taller/01-recepcion-vehiculo/cp009-modal-confirmacion-guardar.js | Valida la aparición de confirmación al guardar una recepción. |
| CP-010 | tests-playwright/02-gestion-taller/01-recepcion-vehiculo/cp010-cancelar-generacion-orden.js | Verifica que cancelar la generación de orden regrese a la recepción. |
| CP-011 | tests-playwright/02-gestion-taller/01-recepcion-vehiculo/cp011-whatsapp-modal-orden.js | Prueba del modal de WhatsApp tras generar una orden. |
| CP-012 | tests-playwright/02-gestion-taller/01-recepcion-vehiculo/cp012-buscar-orden-placa.js | Valida búsqueda de órdenes por placa. |
| CP-013 | tests-playwright/02-gestion-taller/01-recepcion-vehiculo/cp013-buscar-orden-nombre-cliente.js | Valida búsqueda de órdenes por nombre de cliente. |
| CP-014 | tests-playwright/02-gestion-taller/01-recepcion-vehiculo/cp014-cambiar-vista-lista-caja.js | Comprueba el cambio de vista entre lista y caja. |
| CP-015 | tests-playwright/02-gestion-taller/01-recepcion-vehiculo/cp015-cambiar-sucursal-selector.js | Verifica que cambiar de sucursal actualice la vista. |
| CP-016 | tests-playwright/02-gestion-taller/01-recepcion-vehiculo/cp016-chat-interno-orden.js | Valida apertura e interacción del chat interno de una orden. |
| CP-017 | tests-playwright/02-gestion-taller/02-taller-basico/cp017-carga-tablero-ordenes.js | Verifica carga del tablero de órdenes. |
| CP-017b | tests-playwright/02-gestion-taller/02-taller-basico/cp017-tablero-carga-columnas.js | Comprueba que el tablero cargue sus columnas. |
| CP-018 | tests-playwright/02-gestion-taller/02-taller-basico/cp018-buscar-orden-tablero.js | Valida búsqueda de órdenes desde el tablero. |
| CP-019 | tests-playwright/02-gestion-taller/02-taller-basico/cp019-crear-seccion-tablero.js | Verifica creación de una nueva sección en el tablero. |
| CP-020 | tests-playwright/02-gestion-taller/02-taller-basico/cp020-avanzar-orden-siguiente-etapa.js | Prueba interacción con la configuración del tablero. |
| CP-021 | tests-playwright/02-gestion-taller/02-taller-basico/cp021-carga-modulo-reporte-ordenes.js | Valida que el módulo de reportes de órdenes cargue correctamente. |
| CP-022 | tests-playwright/02-gestion-taller/02-taller-basico/cp022-filtrar-ordenes-rango-fechas.js | Comprueba filtrado de órdenes por rango de fechas. |
| CP-023 | tests-playwright/02-gestion-taller/02-taller-basico/cp023-descarga-reporte-excel.js | Verifica intento de descarga del reporte en Excel. |
| CP-024 | tests-playwright/02-gestion-taller/02-taller-basico/cp024-detalle-orden-muestra-informacion.js | Valida apertura del detalle de una orden. |
| CP-025 | tests-playwright/02-gestion-taller/02-taller-basico/cp025-agregar-abono-orden.js | Prueba la interacción para registrar un abono. |
| CP-026 | tests-playwright/02-gestion-taller/02-taller-basico/cp026-descargar-pdf-orden.js | Verifica la descarga del PDF de una orden desde el menú de tres puntos en Recepción de Vehículo. |
| CP-027 | tests-playwright/02-gestion-taller/02-taller-basico/cp027-ver-orden-online.js | Verifica que "Ver orden online" (Opciones avanzadas) abra la vista pública de la orden. |
| CP-028 | tests-playwright/02-gestion-taller/02-taller-basico/cp028-ver-bitacora-orden.js | Verifica que "Ver bitácora" (Opciones avanzadas) cargue la bitácora de la orden. |
| CP-029 | tests-playwright/02-gestion-taller/02-taller-basico/cp029-desactivar-orden.js | Verifica que "Desactivar orden" (Opciones avanzadas) cambie el estado de una orden de prueba a inactiva. |
| CP-030 | tests-playwright/02-gestion-taller/02-taller-basico/cp030-eliminar-orden.js | Verifica que "Eliminar orden" (Opciones avanzadas) elimine permanentemente una orden de prueba del listado. |
| CP-031 | tests-playwright/01-facturar/01-pos-basico/cp031-carga-modulo-pos.js | Verifica que el módulo POS (Facturar) cargue con la compañía, categorías y productos visibles. |
| CP-032 | tests-playwright/01-facturar/01-pos-basico/cp032-buscar-producto-pos.js | Verifica que buscar un producto en el POS lo muestre en los resultados. |
| CP-033 | tests-playwright/01-facturar/01-pos-basico/cp033-agregar-producto-carrito.js | Verifica que agregar un producto al carrito muestre el precio correcto. |
| CP-034 | tests-playwright/01-facturar/01-pos-basico/cp034-buscar-cliente-pos.js | Verifica que se pueda asociar un cliente a la factura del POS (vía cliente rápido; el buscador existente no responde). |
| CP-035 | tests-playwright/01-facturar/01-pos-basico/cp035-generar-cotizacion-pos.js | Verifica que se pueda generar una cotización (Proforma) desde el menú de tres puntos del POS. |
| CP-036 | tests-playwright/01-facturar/01-pos-basico/cp036-generar-apartado-pos.js | Verifica que se pueda generar un apartado desde el menú de tres puntos del POS. |
| CP-037 | tests-playwright/01-facturar/01-pos-basico/cp037-facturacion-contado-efectivo.js | Verifica el flujo completo de facturación de contado en efectivo, con datos de prueba propios. |
| CP-038 | tests-playwright/01-facturar/01-pos-basico/cp038-facturacion-credito.js | Documenta un defecto confirmado: switch_payment_type() no activa Crédito (código comentado), revierte siempre a Contado. |
| CP-039 | tests-playwright/01-facturar/01-pos-basico/cp039-importar-factura-historico.js | Verifica que el tab (F5) Importar factura cargue el historial de facturas. |
| CP-040 | tests-playwright/01-facturar/01-pos-basico/cp040-ver-apartados-pos.js | Verifica que el tab (F7) Apartados cargue la lista de apartados existentes. |
| CP-041 | tests-playwright/01-facturar/01-pos-basico/cp041-panel-totales-pos.js | Verifica que el panel de totales muestre subtotal, IVA, descuento, devolución de tarifa, total utilidad y total. |
| CP-042 | tests-playwright/01-facturar/01-pos-basico/cp042-aplicar-descuento-carrito.js | Verifica que aplicar un porcentaje de descuento cambie el total del carrito. |
| CP-043 | tests-playwright/01-facturar/01-pos-basico/cp043-cambio-moneda-pos.js | Verifica que el selector de moneda muestre Colón, Dólar Americano, Euro y Peso Dominicano. |
| CP-044 | tests-playwright/01-facturar/01-pos-basico/cp044-formato-impresion-pos.js | Verifica que el selector de impresión muestre los 9 formatos de factura disponibles. |
| CP-045 | tests-playwright/01-facturar/01-pos-basico/cp045-abrir-cerrar-caja.js | Verifica que "(F12) Abrir/Cerrar Caja" abra el modal de gestión de caja. |
| CP-046 | tests-playwright/01-facturar/01-pos-basico/cp046-movimientos-caja.js | Verifica que "(F9) Movimientos de caja" cargue su pantalla. |
| CP-047 | tests-playwright/01-facturar/01-pos-basico/cp047-historial-movimientos-caja.js | Documenta un defecto confirmado: "(F8) Historial Mov. de Caja" no tiene manejador funcional (ni clic ni la tecla F8 real, que está ligada a otra función). |
| CP-048 | tests-playwright/01-facturar/01-pos-basico/cp048-vista-lista-grilla-pos.js | Verifica que los botones style_list/style_box cambien la visualización de productos entre lista y grilla. |
| CP-049 | tests-playwright/01-facturar/01-pos-basico/cp049-filtro-vehiculos-pos.js | Verifica que "Filtros de Vehículos" despliegue Marca, Modelo, Año, Transmisión, Motor y Categoría. |
| CP-050 | tests-playwright/01-facturar/01-pos-basico/cp050-tres-puntos-carrito.js | Verifica que el menú de tres puntos (more_horiz) del carrito muestre sus opciones. |
| CP-051 | tests-playwright/01-facturar/01-pos-basico/cp051-producto-rapido-pos.js | Documenta un hallazgo: "Producto Rápido" exige un código CABYS cuya búsqueda resultó inestable (timeout, crashes, guardado silenciosamente fallido) en este entorno. |
| CP-052 | tests-playwright/01-facturar/01-pos-basico/cp052-vaciar-carrito-pos.js | Verifica que vaciar el carrito (cancel_sale + confirmar "Limpiar lista") lo deje vacío. |
| CP-053 | tests-playwright/01-facturar/01-pos-basico/cp053-tab-ordenes-caja.js | Verifica que el tab (F2) Órdenes de caja cargue correctamente. |
| CP-054 | tests-playwright/01-facturar/01-pos-basico/cp054-tab-taller-pos.js | Verifica que el tab (F3) Taller cargue la vista de selección de vehículo con etapa/servicios. |
| CP-055 | tests-playwright/01-facturar/01-pos-basico/cp055-tab-tienda-linea.js | Verifica que el tab "Tienda en línea" cargue correctamente. |
| CP-056 | tests-playwright/01-facturar/01-pos-basico/cp056-tab-ruteo.js | Verifica que el tab "Ruteo" cargue correctamente. |
| CP-057 | tests-playwright/01-facturar/01-pos-basico/cp057-tab-cotizacion-f4.js | Verifica que el tab (F4) Cotización cargue el listado de cotizaciones existentes. |
| CP-058 | tests-playwright/01-facturar/02-pos-avanzado/cp058-facturar-producto-gravado.js | Verifica la facturación completa de un producto gravado: IVA > 0, cliente asociado vía selectCustomerToPos(), pago en efectivo y doble confirmación SweetAlert. |
| CP-059 | tests-playwright/01-facturar/02-pos-avanzado/cp059-facturar-producto-exento.js | Verifica la facturación completa de un producto exento: IVA = 0, mismo flujo de cliente/pago/confirmación que CP-058. |
| CP-060 | tests-playwright/01-facturar/02-pos-avanzado/cp060-toggle-impresion-facturar.js | Verifica que la tecla F8 alterne "Impresión de facturas ACTIVADA/DESACTIVADA" y que se pueda facturar correctamente en ambos estados. |
| CP-061 | tests-playwright/01-facturar/02-pos-avanzado/cp061-facturar-pago-mixto.js | Verifica la facturación con pago mixto (efectivo + tarjeta), distribuyendo el monto total 50/50 entre ambos métodos. |
| CP-062 | tests-playwright/01-facturar/02-pos-avanzado/cp062-facturar-pago-unico.js | Verifica la facturación con un único método de pago (tarjeta), desmarcando Efectivo (activo por defecto). |
| CP-063 | tests-playwright/01-facturar/02-pos-avanzado/cp063-agregar-orden-existente.js | Verifica que se pueda cargar una orden de taller existente (add_repair_order_to_table) al carrito, agregar un producto adicional y facturar. |
| CP-064 | tests-playwright/01-facturar/02-pos-avanzado/cp064-agregar-factura-importada.js | Verifica que se pueda importar una factura histórica (botón IMPORTAR / add_pos_invoice_import_to_table) al carrito, agregar un producto adicional y facturar. |
| CP-065 | tests-playwright/01-facturar/02-pos-avanzado/cp065-agregar-producto-vista-lista.js | Verifica que se pueda agregar un producto al carrito con el catálogo en formato lista (style_list). |
| CP-066 | tests-playwright/01-facturar/02-pos-avanzado/cp066-agregar-producto-vista-cuadricula.js | Verifica que se pueda agregar un producto al carrito con el catálogo en formato cuadrícula (style_box). |
| CP-067 | tests-playwright/01-facturar/02-pos-avanzado/cp067-comentario-factura-electronica.js | Verifica que se pueda agregar un comentario a un producto y facturar como Factura Electrónica (payment_electronic_document_type='1', requiere disparar 'chosen:updated' en el select). |
| CP-068 | tests-playwright/01-facturar/02-pos-avanzado/cp068-comentario-tiquete-electronico.js | Verifica que se pueda agregar un comentario a un producto, valida el total del carrito con tolerancia ±1, y factura como Tiquete Electrónico (payment_electronic_document_type='4', requiere disparar 'chosen:updated' en el select). |
| CP-069 | tests-playwright/01-facturar/02-pos-avanzado/cp069-facturar-contingencia.js | Activa "Factura por Contingencia" (ck_contingency_invoice) y valida que revela el formulario (No. Comprobante/Fecha/Motivo) y fuerza el tipo de documento a Factura Electrónica. Factura Electrónica + contingencia queda bloqueada por el sistema con "debe seleccionar un cliente" pese a tener cliente y datos completos (hallazgo documentado en el código); la alternativa válida confirmada es cambiar a Tiquete Electrónico DESPUÉS de marcar la contingencia, con la cual la venta sí se completa. |
| CP-070 | tests-playwright/01-facturar/02-pos-avanzado/cp070-facturar-ice-hacienda.js | Activa "Facturar al ICE" (ck_is_ice_invoice, dentro de "Opciones avanzadas" del modal de pago) con el cliente 12735 y un producto gravado. Factura Electrónica + ICE queda bloqueada por la misma validación de cliente que CP-069 (se documenta); la venta se completa con Tiquete Electrónico. Intenta validar "Estado Hacienda = Aceptado" en /ElectronicBilling/ElectronicBillingReport (buscador electronic_billing_search no filtra, mismo defecto que CP-034/customer_search) con reintentos de ~75s; si no resuelve a tiempo, lo reporta como hallazgo (⚠️) en vez de fallar. |
| CP-071 | tests-playwright/01-facturar/02-pos-avanzado/cp071-exoneracion-hacienda.js | Agrega 2 productos (AAA-Multímetro x2 gravado + AAA-Bombillos x1 exento), lee el IVA del carrito, y aplica una exoneración (set_apply_exoneration_modal(), tipo "01 - Compras autorizadas DGT", 100%) vía el panel de totales (no es por producto, es a nivel de venta). Valida que el monto exonerado (total_exoneration_amount) coincide ±1 con el IVA leído antes de exonerar, confirmando que el monto exonerado corresponde exactamente al impuesto. Mismo bloqueo de Factura Electrónica y mismo patrón de reintentos (~75s) para el estado de Hacienda que CP-070. |
| CP-072 | tests-playwright/01-facturar/02-pos-avanzado/cp072-planillas-factura-configuracion.js | Mide el tiempo de carga de /invoiceSetting/invoiceSetting ("Admin. factura"); verifica los tabs Factura/Proforma/Ticket (step_invoice/step_proform/step_ticket) y recorre las 36 opciones de plantilla (.btn_element_number_config_panel) y el guardado (save_settings_invoice, confirmado con noty "¡Cambios guardados exitosamente!"). Incluye medición de performance (carga de página, acciones, total del CP) según umbrales acordados con el usuario; una carga >8000ms se documenta como hallazgo (⚠️ RESULT) sin cortar la prueba, para no perder cobertura funcional. **Hallazgo reproducible**: la página tarda 12-18s en cargar (vs. umbral 8000ms) y "Guardar" toma ~7s; toda la funcionalidad (tabs, 36 opciones, guardado) responde correctamente. |
| CP-073 | tests-playwright/01-facturar/02-pos-avanzado/cp073-factura-credito.js | Verifica factura a crédito con 3 productos distintos: AAA-Multímetro x1 (gravado), AAA-Bombillos x1 (exento), AA-Maletero x1 fracción (prod_frag_q input en el diálogo dialog_product_fragmented_quantity_view). Activa crédito con switch_payment_type(2) — el defecto CP-038 está corregido en la versión actual; la venta a crédito procede incluso con ₡0 de crédito disponible para el cliente 12735. Valida saldo pendiente en /credit_sale/clientCreditSales. Lógica verificada via scripts de inspección pero **script de CP necesita re-ejecución**: en el momento de generarlo, el entorno QA sufrió renderer crashes y timeouts de 100+ segundos por carga acumulada de la sesión de pruebas. |
| CP-074 | tests-playwright/01-facturar/03-factura-credito/cp074-credito-producto-normal.js | Factura a crédito: 3 productos normales (AAA-Multímetro, AAA-Bombillos, AAA-Filtros) + 1 fraccionado (AA-Maletero) en colones. selectCustomerToPos(12735), switch_payment_type(2), valida saldo en /credit_sale/clientCreditSales. Patrón base para CPs de crédito. **Actualización 2026-07-08**: al re-ejecutar durante la reorganización de carpetas, falla de forma reproducible ("el carrito no quedó vacío tras el pago a crédito", modal de pago muestra "estimado cliente" con crédito disponible en blanco) — mismo síntoma que el hallazgo ya documentado en CP-113 (cliente 12735 con crédito agotado en QA, acumulado por las corridas repetidas de CP-074 a CP-083 a lo largo de las sesiones). Confirmado que NO es causado por la reorganización (el diff del movimiento solo tocó rutas relativas, sin cambios de lógica); es degradación del dato compartido de QA. |
| CP-075 | tests-playwright/01-facturar/03-factura-credito/cp075-credito-producto-rapido-dolares.js | Factura a crédito con producto rápido (CABYS fallback a catálogo) en dólares. Conversión de moneda, IVA gravado + exento. CABYS consistentemente falla → fallback a productos del catálogo. |
| CP-076 | tests-playwright/01-facturar/03-factura-credito/cp076-credito-abono-inicial.js | Factura a crédito + abono inicial en colones. Fuerza colones al inicio (persistencia server-side de moneda). Valida: saldo = total − abono (±1). Patrón para forzar colones: menu_type_currency + querySelectorAll('.mdl-menu'). |
| CP-077 | tests-playwright/01-facturar/03-factura-credito/cp077-credito-multiples-tipos-descuento.js | Factura a crédito + descuento global 10% via total_discount_input. 3 productos (normal + rápido + fraccionado). Valida descuento = total × 10% (±1). agregarProductoRapidoOFallback() helper. |
| CP-078 | tests-playwright/01-facturar/03-factura-credito/cp078-abono-factura-credito.js | Busca factura de crédito en /credit_sale/clientCreditSales (#search + #btn_search), aplica abono via pay_customer_invoice(cId, curId) que navega. Usa Promise.all([waitForNavigation, evaluate]) para manejar navegación. Input: invoice_input_NNN (type=number). |
| CP-079 | tests-playwright/01-facturar/03-factura-credito/cp079-abono-cierre-caja.js | Abono 20% del saldo + verificar en Movimientos de Caja (F9 desde menú #menu_cash). Los abonos de crédito NO aparecen como entradas individuales en movimientos de caja — son sistemas separados. Se reporta como ⚠️ RESULT. |
| CP-080 | tests-playwright/01-facturar/03-factura-credito/cp080-abono-multiples-metodos-pago.js | Navega con Ctrl+B (helper navegarCtrlB). Aplica 2 abonos secuenciales: efectivo 15% del saldo + tarjeta 10%. aplicarAbono() helper reutilizable. Valida suma total ±1. |
| CP-081 | tests-playwright/01-facturar/03-factura-credito/cp081-descuento-general-credito.js | Descuento general 15% via total_discount_input en factura a crédito. 3 productos colones. Valida: totalPre − totalPost = totalPre × 15% (±1). Resultado: ₡37,540 → ₡31,909 (diff ₡0.00). |
| CP-082 | tests-playwright/01-facturar/03-factura-credito/cp082-descuento-linea-credito.js | Descuento por línea: input_product_discount_* está DISABLED por servidor; removeAttribute('disabled') + set_product_total(token) no cambia el total (limitación UI conocida). Carrito POS carga lazily — requiere trigger de producto para forzar render. Pago en efectivo (crédito del cliente agotado): payment_cash_total pre-llenado, make_payment + Enter para confirmar. dialog_payment tiene clase .sweet-alert — excluir del loop. |
| CP-083 | tests-playwright/01-facturar/03-factura-credito/cp083-limite-credito-cliente.js | Consulta saldo del cliente (₡66M acumulado en QA). Agrega 2 productos, activa crédito, detecta "! Not valid!" como BLOQUEO_DETECTADO del límite. mensajeLimite regex incluye "not valid". Resultado: BLOQUEO_DETECTADO confirmado. |
| CP-084 | tests-playwright/01-facturar/04-proforma-cotizaciones/cp084-historial-proformas.js | Navega a /proform/printPosProform. Valida 7 elementos: receip_search, start_date, end_date, btn_search_receip, btn_proform, btn_consignation_proform, btn_workshop_proform. Header "Cotizaciones Ver cotizaciones". Buscar + 3 tabs de tipo. La lista de proformas renderiza con AJAX en contenedor no capturado por selector genérico — test valida estructura, no contenido. |
| CP-085 | tests-playwright/01-facturar/04-proforma-cotizaciones/cp085-buscar-proforma-codigo.js | Usa receip_search + btn_search_receip para buscar por código de proforma (e.g. "2303"). Valida antes/después de filtro. Reset con campo vacío. |
| CP-086 | tests-playwright/01-facturar/04-proforma-cotizaciones/cp086-proforma-cliente-modal.js | POS F4 (btn_proform_option) → show_create_proform_modal() → abre #dialog_proform. Campo cliente: customer_proform_select (placeholder "Nombre del cliente"). Confirmar: botón "Crear Proforma". Inputs: input_product_quantity_TOKEN, input_product_edit_price_TOKEN, input_product_discount_TOKEN, ck_is_proform__invoice, end_proform_date, proform_observation. |
| CP-087 | tests-playwright/01-facturar/04-proforma-cotizaciones/cp087-proforma-productos-rapidos.js | Agrega productos (catálogo fallback — show_quick_product_modal no disponible vía regex). F4 → show_create_proform_modal() → "Crear Proforma". El modal #dialog_proform captura automáticamente los productos del carrito POS. |
| CP-088 | tests-playwright/01-facturar/04-proforma-cotizaciones/cp088-proforma-mixta.js | 2 productos del catálogo en dólares (Multímetro + Filtros = $123.26). F4 → show_create_proform_modal() → "Crear Proforma". |
| CP-089 | tests-playwright/01-facturar/04-proforma-cotizaciones/cp089-proforma-producto-rapido-exento.js | AAA-Bombillos (exento IVA) + AAA-Multímetro (gravado) en colones. show_invoice_advanced_detail para leer IVA. F4 → crear proforma. |
| CP-090 | tests-playwright/01-facturar/04-proforma-cotizaciones/cp090-proforma-descuento-general.js | 3 productos colones. Descuento 15% via total_discount_input → validación ±1 (₡56,285 → ₡47,842.25, diff ₡0.00). F4 → show_create_proform_modal() → "Crear Proforma". selectCustomerToPos(12735) antes de abrir modal. |
| CP-091 | tests-playwright/01-facturar/04-proforma-cotizaciones/cp091-proforma-descuentos-individuales.js | 3 productos colones. input_product_discount_TOKEN en modal dialog_proform están disabled (misma limitación que CP-082 en carrito). Limitación documentada. F4 → "Crear Proforma". |
| CP-092 | tests-playwright/01-facturar/04-proforma-cotizaciones/cp092-lista-precios-proforma-normal.js | Descubre 7 listas via menu_price_list. Aplica "50% Descuento mayorista" (ID 185) via set_current_pos_price_list(id). Productos AAA-* no tienen precio alternativo en listas QA (limitación de datos). Valida precios carrito↔modal ±1 por token. "Crear Proforma". |
| CP-093 | tests-playwright/01-facturar/04-proforma-cotizaciones/cp093-lista-precios-proforma-consignacion.js | Aplica lista ID 186 (10% frecuente). Activa ck_is_consignment_invoice → ck_is_proform__invoice se desmarca automáticamente (mutuamente excluyentes). Valida precios carrito↔modal ±1 por token (diff=0.00). "Crear Proforma". Navega a historial y verifica tab "Prof. de Consignación" con registros. |
| CP-094 | tests-playwright/01-facturar/04-proforma-cotizaciones/cp094-proforma-taller-a-orden.js | Activa ck_is_workshop_proform (exclusivo). "Crear Proforma" exitoso. Historial tab "btn_workshop_proform" visible. Botón "convertir a orden" no tiene onclick discernible en el DOM visible del historial (listado AJAX lento o flujo diferente). Limitación documentada. |
| CP-095 | tests-playwright/01-facturar/04-proforma-cotizaciones/cp095-consignacion-normal.js | Bombillos + Filtros en colones. ck_is_consignment_invoice=false por defecto → activado → exclusivo confirmado. Total modal "₡56,185.00" = POS. "Crear Proforma". Historial: tab "Prof. de Consignación" (btn_consignation_proform), 56 filas. |
| CP-096 | tests-playwright/01-facturar/04-proforma-cotizaciones/cp096-consignacion-taller.js | Multímetro x1 + Filtros x2 en dólares. ck_is_workshop_proform activado (exclusivo). POS=$123.26; modal input_product_edit_price_ muestra precio base sin IVA (~13% menor). "Crear Proforma". Historial: tab "Prof. de Taller" (btn_workshop_proform), 56 filas. |
| CP-097 | tests-playwright/01-facturar/04-proforma-cotizaciones/cp097-imprimir-proforma.js | Flujo: POS → crear proforma → historial → get_receip_detail(id) → downloadProformPdf(id, true)="Imprimir" / downloadProformPdf(id)="PDF". Popup about:blank contiene empresa, número, fechas, cliente. Performance: ~6 min para renderizar PDF (⚠️ hallazgo). Acciones descubiertas: confirm_proform, send_invoice_email, get_image_collection. |
| CP-098 | tests-playwright/01-facturar/04-proforma-cotizaciones/cp098-shift-p-proforma.js | Shift+P en POS abre #dialog_proform directamente (shortcut nativo). Modal: classes "modal fade in", height=1200px. Productos del carrito en modal. Tipo proforma por defecto (ck_is_proform__invoice=true). Total ₡56,135. "Crear Proforma". |
| CP-099 | tests-playwright/01-facturar/05-apartados/cp099-apartado-sin-abono.js | go_to_layaway_sale() → dialog_payment (mismo que Shift+L). payment_cash_total=0 (sin abono). confirm_add_layaway() crea el apartado directamente. Tab F7: #btn_layaway_option (list), #make_layaway_payment ("REALIZAR ABONO") confirma registro. |
| CP-100 | tests-playwright/01-facturar/05-apartados/cp100-apartado-con-abono.js | go_to_layaway_sale() → dialog_payment → #payment_cash_total=abono (105) → confirm_add_layaway(). Saldo esperado=total−abono (245). Validación numérica limitada por múltiples apartados existentes en QA; registro confirmado por #make_layaway_payment visible en tab F7. |
| CP-101 | tests-playwright/01-facturar/05-apartados/cp101-abono-apartado-existente.js | add_pos_layaway_to_table(id) carga ítems del apartado al carrito → go_to_layaway_sale() abre dialog_payment. En modal: #total_sale_txt=total, #initial_payment_change=abono previo acumulado, #make_layaway_payment="REALIZAR ABONO" (link dentro del modal). payment_cash_total=274.8 (20%) → confirm_add_layaway(). Saldo esperado=1,099.2; no aislable de vista lista. |
| CP-102 | tests-playwright/01-facturar/05-apartados/cp102-calculos-apartados.js | Carga apartado #521 (No.181, ₡1,374.00) desde F7 → dialog_payment muestra: #total_sale_txt, "TOTAL ABONO" / #initial_payment_change, "TOTAL DEVUELTO TARIFA (4.00%)", #make_layaway_payment. Validaciones 4/4: total_F7=total_modal ±1, saldo≥0, total-abono=saldo ±1, ítems en carrito. NOTA: go_to_layaway_sale()+confirm_add_layaway() con cliente 12735 y total>≈₡350 produce "Not valid!" (límite crédito); usar apartado existente evita este bloqueo. |
| CP-103 | tests-playwright/01-facturar/05-apartados/cp103-shift-l-apartados.js | Shift+L abre #dialog_payment nativamente. Antes: {display:none, classes:"modal fade", height:0}. Después: {classes:"modal fade in", height:1200, visible:true}. Contenido: #total_sale_txt=₡350, #initial_payment_change=₡0, #make_layaway_payment="REALIZAR ABONO", #payment_cash_total, Estudio de Crédito link. 5/5 validaciones. |
| CP-104 | tests-playwright/01-facturar/06-cierre-caja/cp104-abrir-cerrar-caja.js | F12 abre dialog_cash_closing (caja abierta) o modal de apertura (caja cerrada). ID clave: dialog_cash_closing. Campos en modal cierre: closure_posted_balance (saldo siguiente), next_cash_closing. Botón: btn_close_cash ("Cerrar Caja"). Confirma: SweetAlert button.confirm "Cerrar". Total cierre leído via regex: "Total general ([\d,]+\.\d{2})". Cierre #380 abierto 2026-07-04, total ₡188,474.57. |
| CP-105 | tests-playwright/01-facturar/06-cierre-caja/cp105-movimiento-entrada.js | F9 o menú Caja→"(F9) Movimientos de caja" abre #dialog_cash_movement. Campos: movenment_cash_quantity (typo intencional del sistema), movenment_cash_observation. Toggle: movenment_cash_in (checkbox, checked=default) → set_movement_in() → cash_movement_type="1"=entrada. Botón submit: #btn_send_movement ("Procesar"). Display efectivo: #movement_cash_total_display. |
| CP-106 | tests-playwright/01-facturar/06-cierre-caja/cp106-movimiento-salida.js | Mismo flujo que CP-105 pero activa movenment_cash_out → set_movement_out() → cash_movement_type="2"=salida. Modal confirma campo vacío y display actualizado. |
| CP-107 | tests-playwright/01-facturar/06-cierre-caja/cp107-calculos-cierre-caja.js | F12→dialog_cash_closing, lee: totalGeneral, ventasTotales, contado, crédito, abonos, entradas, salidas, saldoInicial. Valida: total≥0, parciales(contado+crédito+abonos)≈ventasTotales ±10%, total≤ingresos, todos≥0, ≥2 montos leídos. No cierra la caja — solo lectura. **Actualización 2026-07-08**: al re-ejecutar durante la reorganización de carpetas (2 intentos, ambos aislados), falla de forma reproducible con "dialog_cash_closing no visible tras apertura" — la caja estaba cerrada, `start_open_cash()` se ejecuta pero el modal de cierre no aparece dentro del tiempo de espera. Mismo tipo de timing-race que CP-104 (que sí tiene un fallback `confirm_close_cash()` para este caso). Confirmado por diff que no lo causa la reorganización (solo cambian rutas relativas); es fragilidad de timing ya presente en el flujo de apertura/cierre de caja de este entorno compartido de QA. |
| CP-108 | tests-playwright/01-facturar/06-cierre-caja/cp108-cierre-movimientos-mixtos.js | Registra entrada ₡8,000 + salida ₡2,500 via dialog_cash_movement, luego F12→dialog_cash_closing, valida entradas≥₡8,000 en modal y cierra via btn_close_cash. Escenario completo de movimientos mixtos antes del cierre. **Actualización 2026-07-08**: al re-ejecutar durante la reorganización de carpetas, se colgó indefinidamente (3 intentos, hasta 5 min cada uno) justo al clickear `btn_send_movement` (botón "Procesar" del modal de movimiento de caja) — nunca lanza excepción ni timeout propio. Investigado con un script de diagnóstico descartable (`page.on('dialog')` + `Promise.race` con timeout artificial en cada paso): NO es un diálogo nativo `alert()`/`confirm()` bloqueando Playwright (el listener de diálogos nunca se disparó). El `page.evaluate()` que dispara el click se queda colgado sin resolver ni rechazar — consistente con que el handler de `btn_send_movement` en la propia app hace una llamada AJAX **síncrona** al servidor que nunca recibe respuesta. Cada corrida mostró errores `net::ERR_CONNECTION_CLOSED` en consola contra `dev.designsoftcr.com`, apuntando a inestabilidad/sobrecarga del servidor compartido de QA (agravada por la carga sostenida de correr decenas de CPs seguidos durante la reorganización), no a un bug del script ni a la reorganización de carpetas (confirmado por diff — solo cambian rutas relativas). **Recomendación**: si se repite en corridas normales (no durante una sesión de reorg con carga alta), considerar envolver el click en `btn_send_movement` con un timeout explícito del lado del test para poder fallar limpio en vez de colgarse indefinidamente. |
| CP-109 | tests-playwright/01-facturar/07-ordenes-caja-taller/cp109-enviar-a-caja-cliente.js | Shift+C→#dialog_send_sale. Selector #search_pos_customer_send_sale es independiente del cliente POS (no se auto-llena con selectCustomerToPos). Pago Contado default, #send_sale_payment→SweetAlert "Enviar". 4/5 validaciones (v4 cliente en modal = ⚠️ comportamiento esperado). |
| CP-110 | tests-playwright/01-facturar/07-ordenes-caja-taller/cp110-shift-c-enviar-caja.js | Valida apertura de dialog_send_sale con Shift+C. Antes: {display:none, height:0, hasIn:false}. Después: {visible:true, clase "in", height:1200}. Verifica: #total_send_sale_txt, #search_pos_customer_send_sale, #ck_is_send_sale_payment_cash (Contado por defecto), #send_sale_payment "Enviar a caja", #send_sale_observation. 5/5. |
| CP-111 | tests-playwright/01-facturar/07-ordenes-caja-taller/cp111-facturar-orden-taller.js | F3→btn_taller_option, itera .pos-order-card hasta encontrar orden con ítems en #tb_table_buy_list (orden 778: 28 filas). F1→btn_cash_pos→dialog_payment, efectivo (#ck_is_payment_cash/#is_payment_cash), make_payment; SweetAlert cambio ₡131,593.30. Intercepta window.print. 5/5. |
| CP-112 | tests-playwright/01-facturar/07-ordenes-caja-taller/cp112-agregar-producto-rapido-taller.js | El catálogo de productos se oculta con una orden de taller activa — busca vía #product_search ("aaa") para forzar al servidor a repoblar el grid con resultados visibles, luego agrega el primero. Valida filas de carrito antes/después, total y contenido de la última fila. |
| CP-113 | tests-playwright/01-facturar/07-ordenes-caja-taller/cp113-credito-orden-taller.js | Toma la primera orden del tab Taller y le agrega un producto fresco vía #product_search (evita depender de ítems pre-existentes con precio inválido — varias órdenes de QA disparan "¿Desea continuar?" y dejan el total en ₡0, documentado como hallazgo). Asocia cliente 12735, activa switch_payment_type(2). El cliente 12735 tiene el crédito agotado en este entorno (acumulado de CP-074 a CP-083) → "! Not valid!" detectado en la sweet-alert inmediatamente tras make_payment y documentado como ⚠️ RESULT (mismo patrón que CP-083), no como fallo. |
| CP-114 | tests-playwright/01-facturar/07-ordenes-caja-taller/cp114-agregar-items-orden-taller.js | Selecciona primera orden de taller, agrega 3 productos adicionales (Multímetro, Bombillos, Filtros) vía #product_search, factura en efectivo. Valida que el total del carrito creció y coincide con el total del modal de pago ±1. El conteo de filas del carrito no es confiable tras usar #product_search sobre una orden activa (puede reordenarse/consolidarse) — se usa el total como indicador. |
| CP-115 | tests-playwright/01-facturar/07-ordenes-caja-taller/cp115-exoneracion-orden-taller.js | Orden de taller + producto gravado fresco + set_apply_exoneration_modal() (100%). Monto exonerado ≈ IVA leído ±1 (mismo patrón que CP-071). Al facturar, Factura Electrónica queda bloqueada por validación de cliente (BUG-005/BUG-007 conocido, mencionado en el pedido original) incluso cambiando a Tiquete Electrónico — se documenta como hallazgo sin completar la venta. |
| CP-116 | tests-playwright/01-facturar/07-ordenes-caja-taller/cp116-descuento-general-pos.js | 3 productos en colones, descuento general 15% vía total_discount_input, valida reducción ±1, factura en efectivo. |
| CP-117 | tests-playwright/01-facturar/07-ordenes-caja-taller/cp117-descuento-unitario-producto.js | 3 productos, descuento individual 20% vía input_product_discount_TOKEN — mismo hallazgo que CP-082: el input está disabled por servidor y removeAttribute('disabled')+set_product_total(token) no cambia el total visible. Documentado como limitación conocida, factura igual en efectivo. |
| CP-118 | tests-playwright/01-facturar/07-ordenes-caja-taller/cp118-producto-rapido-con-iva.js | Intenta producto rápido gravado vía flujo CABYS (mismo patrón que CP-075/CP-051); CABYS consistentemente inestable → fallback a AAA-Multímetro del catálogo. Valida IVA > 0 vía show_invoice_advanced_detail, factura en efectivo. |
| CP-119 | tests-playwright/01-facturar/07-ordenes-caja-taller/cp119-producto-rapido-sin-iva.js | Igual que CP-118 pero producto exento; fallback a AAA-Bombillos. Valida IVA = 0. |
| CP-120 | tests-playwright/01-facturar/07-ordenes-caja-taller/cp120-cambio-moneda-pos.js | Lee total de un producto en colones, limpia carrito, cambia a Dólar Americano (menu_type_currency → "Dólar Americano"), agrega el mismo producto y lee total en dólares. El elemento con el tipo de cambio en pantalla no se pudo localizar (hallazgo) pero la conversión implícita es consistente. |
| CP-121 | tests-playwright/01-facturar/07-ordenes-caja-taller/cp121-lista-precios-pos.js | Aplica cada una de las listas ID 186, 185, 194 vía set_current_pos_price_list() y compara precios (input_product_edit_price_TOKEN) de 2 productos AAA-* contra el precio base — sin variación en ninguna lista (misma limitación de datos QA documentada en CP-092: esos productos no tienen precio alternativo configurado). |
| CP-122 | tests-playwright/01-facturar/07-ordenes-caja-taller/cp122-buscador-productos.js | 3 búsquedas vía #product_search: por nombre ("multimetro"), por código completo y por código de barras parcial. En este sistema el "código" interno y el código de barras son el mismo campo (input_hide_product_code_<id>, ej. "7441003590489" para AAA-Multímetro) — las 3 búsquedas encuentran el mismo producto. |
| CP-123 | tests-playwright/01-facturar/07-ordenes-caja-taller/cp123-vista-cuadricula-lista.js | style_list → agrega un producto, style_box → agrega otro. Tras cada cambio de vista hace falta esperar ~2.5s a que el grid repinte antes de buscar el product_box. Valida que ambos productos quedan en el carrito tras alternar de vista. |
| CP-124 | tests-playwright/01-facturar/07-ordenes-caja-taller/cp124-limpiar-productos-ctrl-x.js | Agrega 3 productos en colones, ejecuta `page.keyboard.press('Control+x')` (tras `document.body.focus()`), confirma el diálogo "Limpiar lista" si aparece (mismo patrón que `cancel_sale` en CP-052). Valida 0 filas en `tb_table_buy_list` y el placeholder "Agrega productos para facturar" visible. |
| CP-125 | tests-playwright/01-facturar/07-ordenes-caja-taller/cp125-observaciones-factura.js | Campo de observación de venta: `#sale_observation` (textarea, placeholder "Observaciones de venta"), visible dentro de `dialog_payment` tras abrir el modal de pago. **Hallazgo de pago reproducible**: al facturar en efectivo, si solo se marca el checkbox `ck_is_payment_cash` sin llamar `switch_payment_type(1)` explícitamente, el sistema devuelve "! Not valid!" indefinidamente (probado sin cliente asociado y en colones y dólares — no es un problema de cliente ni de moneda). El orden correcto para confirmar "Su cambio es: X — Pagar (↵ ENTER)" es: click en `make_payment` → esperar ~1.5s → UN solo `Enter` → esperar ~1s → recién ahí entrar al loop que cierra sweet-alerts subsiguientes (mismo orden que CP-082; hacerlo en el mismo ciclo que el click genérico de botón termina clickeando "Cancel" por error). **Hallazgo secundario**: montos pequeños en Dólar Americano (ej. $0.55) devuelven "! Not valid!" de forma reproducible incluso con el monto exacto y sin cliente — no se pudo determinar la causa exacta (posible validación de monto mínimo o redondeo), se documenta y se factura en colones. La verificación de la observación en el detalle del historial (F5, `#dialog_invoice_import_detail_view`) no encontró el texto — puede que ese popup no incluya el campo; se envuelve en un `Promise.race` con timeout duro de 20s porque en un intento previo esa verificación quedó colgada sin explicación clara. |
| CP-126 | tests-playwright/01-facturar/08-metodos-pago-generales/cp126-facturar-sinpe-movil.js | Método de pago SINPE Móvil: checkbox `is_payment_check` (nombre interno engañoso — NO es cheque, es SINPE) y su monto en `payment_check_total`. Los checkboxes de método de pago usan un slider CSS fuera del viewport del modal — hay que activarlos/desactivarlos con `page.evaluate(id => document.getElementById(id).click(), id)`, nunca con `page.locator().click()`. Hay que desactivar `is_payment_cash` (activo por defecto) ANTES de activar el método nuevo. `#payment_cash_total` es más confiable que `#total_sale_txt` para confirmar que el modal ya abrió (el segundo puede seguir hidden durante el render inicial). SINPE exige el monto EXACTO del total leído de `#total_sale_txt` (no admite exceso como efectivo). Pasó a la primera con 2 productos de catálogo + 1 rápido (CABYS falló, fallback a catálogo, mismo hallazgo que CP-051). |
| CP-127 | tests-playwright/01-facturar/08-metodos-pago-generales/cp127-facturar-transaccion-bancaria.js | Método de pago transacción bancaria: checkbox `is_payment_transaction` y su monto en `payment_transaction_total`. Mismo patrón que CP-126 (activar/desactivar vía `page.evaluate` + click, monto exacto del total, `#payment_cash_total` como señal de modal abierto). Probado en dólares ($123.10) sin problemas — el hallazgo de "! Not valid!" en dólares documentado en CP-125 era específico de efectivo (`switch_payment_type`), no aplica a transacción bancaria. |
| CP-128 | tests-playwright/03-rutas/01-admin-rutas/cp128-carga-modulo-rutas.js | Primer CP con sesión reutilizable (`abrirContextoConSesion` + `refrescarConCacheLimpia`, ver sección "Autenticación en las pruebas" del README). Carga de `/route/adminRoute`: título, `#search_route`/`#btn_search_route`, `#btn_add_route`, listado `.pce-table` con ≥1 ruta. Tras `refrescarConCacheLimpia` la tabla tarda en poblarse vía AJAX — hace falta poll hasta que aparezca texto "clientes" antes de leer el estado. |
| CP-129 | tests-playwright/03-rutas/01-admin-rutas/cp129-crear-nueva-ruta.js | Crea ruta con nombre único (timestamp) + zona "Cedral" vía `#dialog_add_route`, confirma que el modal se cierra tras guardar y que la ruta aparece al buscarla por nombre tras refrescar. |
| CP-130 | tests-playwright/03-rutas/01-admin-rutas/cp130-validar-nombre-vacio.js | Intenta guardar `#dialog_add_route` con `#route_name_input` vacío — el modal permanece abierto (validación nativa) y el conteo de rutas no cambia. Caso de error/validación. |
| CP-131 | tests-playwright/03-rutas/01-admin-rutas/cp131-buscar-ruta-nombre.js | 3 búsquedas con `#search_route`/`#btn_search_route`: término existente (filtra), término inexistente (0 resultados), búsqueda vacía (restaura el listado completo). El texto de cada `<tr>` incluye el menú `.dropdown-menu` oculto (contiene "Asignar clientes/repartidores") — hay que clonar la fila y remover ese menú antes de leer el nombre real de la ruta, si no el nombre queda truncado/contaminado. |
| CP-132 | tests-playwright/03-rutas/01-admin-rutas/cp132-asignar-cliente-ruta.js | Crea una ruta fresca (0 clientes), abre "Asignar clientes" (`routeManager.showClientModal`), agrega el primer cliente seleccionable clickeando el ícono `i.fa-angle-double-right`, valida que el contador de la ruta pasa de 0 a 1 tras refrescar y volver a buscarla. |
| CP-133 | tests-playwright/03-rutas/01-admin-rutas/cp133-asignar-repartidor-ruta.js | Mismo patrón que CP-132 con `routeManager.showDealerModal` y `#dialog_add_dealer_route`. También valida que desaparece el texto "No hay repartidores vinculados" (validación secundaria, no bloqueante — puede tardar en re-renderizar). |
| CP-134 | tests-playwright/03-rutas/01-admin-rutas/cp134-editar-comision.js | Admin. Comisiones (`/route/adminCommission`): abre "Editar Comision" (`add_commission`), ingresa un monto aleatorio (100-500) en `#modal_input_commission_amount` SIN tocar el checkbox `#modal_ck_commission_value` (viene premarcado; clickearlo lo desmarca y oculta el campo), guarda con el botón `.btn-success` (sin `type="submit"`, no matchea ese selector) y valida que el valor persiste ±1 tras refrescar. Confirmado por red: `POST /route/updateDocumentCommission`. |
| CP-135 | tests-playwright/03-rutas/01-admin-rutas/cp135-editar-ruta-existente.js | Crea ruta fresca, abre "Editar ruta" (edición inline, no modal — ver sección 14). Extrae el ID de la ruta desde `tr#tr_route_<ID>`, modifica `#input_route_name_<ID>` vía JS y guarda con el botón `tr#tr_route_<ID> button.btn-success` (`routeManager.saveRouteChange(id)`). Valida que el nombre nuevo persiste y el original ya no existe (usando coincidencia exacta, no `includes`, porque el nombre editado contiene el original como substring). |
| CP-136 | tests-playwright/03-rutas/01-admin-rutas/cp136-eliminar-ruta-existente.js | Crea una ruta descartable exclusiva ("... DESCARTABLE ..." + timestamp) para no arriesgar rutas de otros CPs — acción destructiva sin deshacer. Usa "Eliminar la ruta" → SweetAlert "¿Está seguro? Esta acción eliminará la ruta" con botones "Cancelar"/"Sí, eliminar" (buscar por texto). Confirmado por red: `POST /route/deleteRoute` → `{"success":true,"message":"Ruta eliminada correctamente"}`. Nota: el texto del SweetAlert a veces incluye ruido "! Not valid!" mezclado (boilerplate residual de otro diálogo) sin afectar el resultado — la validación usa un regex laxo (`/segur/i`), no comparación exacta. |
| CP-137 | tests-playwright/01-facturar/09-ruteo-pos/cp137-carga-tab-ruteo-pos.js | Tab "Ruteo" dentro del POS (`#btn_routing_option`, ver sección 15 — distinto de Admin. Rutas). Carga ~5s vía AJAX. Valida los 5 filtros de estado y `#btn_toggle_advanced_filters`, y cuenta tarjetas `[id^="brand_"]` visibles. |
| CP-138 | tests-playwright/01-facturar/09-ruteo-pos/cp138-crear-orden-ruteo.js | Flujo completo de creación: `create_routing_order()` abre `#dialog_add_routing_order`. Asigna ruta (`#send_routing_order_route`) y repartidor (`#send_routing_order_agent_assigned`) vía JS directo (selects ocultos tipo Chosen). Cliente: buscar con `#search_routing_customer_send_sale` + `get_customer_by_pos_option(0)` puebla `#payment_send_routing_order_client` con opciones nuevas — hay que elegir una explícitamente después, la búsqueda sola no selecciona nada. Al confirmar aparece SweetAlert "¿Enviar órden a ruteo?" con "Cancelar"/"Enviar" — clickear "Enviar" por texto exacto, un selector genérico puede pegarle a "Cancelar". |
| CP-139 | tests-playwright/01-facturar/09-ruteo-pos/cp139-integracion-ruta-pos.js | Crea una ruta en Admin. Rutas y confirma que aparece de inmediato en `#send_routing_order_route` del modal Orden de Ruteo del POS — confirma que ambos módulos comparten el mismo catálogo de rutas en tiempo real (sin caché intermedio). |
| CP-140 | tests-playwright/01-facturar/09-ruteo-pos/cp140-filtrar-tablero-ruteo.js | Los botones de filtro (`filter_routing_order_btn_all/pending/in_route/delivered/history_orders`) SÍ filtran correctamente las tarjetas mostradas, pero NO se les pudo detectar una clase CSS "activo" reconocible (la validación se basa en el conteo de tarjetas por filtro, no en el estado visual del botón). |
| CP-141 | tests-playwright/01-facturar/09-ruteo-pos/cp141-acciones-orden-existente.js | Crea una orden propia (requiere cliente asignado, ver hallazgo de CP-142), la localiza en el tablero por su `textarea[id^="pos_routing_order_observation_"]`/`brand_<ID>`, ejecuta `show_routing_order_detail(id)` ("Ver órden" → abre `#dialog_view_routing_order_detail`) y `change_routing_order_status(id, 2)` ("Marcar como EN CAMINO"), valida que la orden se mueve del filtro Pendientes al filtro En Camino. No usa "Eliminar órden" (destructivo) ni prueba "Editar órden" (reutiliza el mismo modal de creación). |
| CP-142 | tests-playwright/01-facturar/09-ruteo-pos/cp142-orden-ruteo-incompleta.js | Caso de error: intenta "Enviar Orden" dejando cliente/ruta/repartidor sin seleccionar. **Comportamiento confirmado**: no aparece ningún SweetAlert de confirmación, el modal se queda abierto en silencio, y no se crea ninguna orden — el sistema rechaza el envío incompleto correctamente, aunque sin mensaje de error visible para el usuario. |
| CP-143 | tests-playwright/01-facturar/09-ruteo-pos/cp143-editar-orden-ruteo.js | Editar orden de ruteo (dentro del POS, distinto de "Editar ruta" de Admin. Rutas/CP-135). Crea orden propia, ejecuta `show_create_routing_order_modal(id)` desde el menú `more_vert` → **confirmado en vivo**: reutiliza el mismo modal `#dialog_add_routing_order` de la creación, con los campos YA pre-poblados (`send_routing_order_observation`, `send_routing_order_route`, `send_routing_order_agent_assigned` traen los valores existentes de la orden). Modifica solo la observación, guarda con el mismo botón `#send_routing_order` ("Enviar Orden") y confirma el mismo SweetAlert "¿Enviar órden a ruteo?" — el flujo de guardado de edición es idéntico al de creación, no hay un botón "Actualizar" separado. Valida que la nueva observación reemplaza a la anterior en la tarjeta del tablero. |
| CP-144 | tests-playwright/01-facturar/09-ruteo-pos/cp144-marcar-entregado.js | Marcar orden como ENTREGADO (dentro del POS). Crea orden propia, aplica `change_routing_order_status(id, 2)` ("EN CAMINO") y luego `change_routing_order_status(id, 3)` ("ENTREGADO") — **confirmado**: el sistema permite llamar ambas transiciones en secuencia sin bloqueos ni SweetAlert de confirmación adicional (solo un breve delay tras cada llamada). Valida el resultado con los filtros `filter_routing_order_btn_delivered` (aparece) y `filter_routing_order_btn_pending`/`filter_routing_order_btn_in_route` (ya no aparece) tras `refrescarConCacheLimpia`. |
| CP-145 | tests-playwright/01-facturar/09-ruteo-pos/cp145-eliminar-orden-ruteo.js | Eliminar orden de ruteo (dentro del POS, distinto de "Eliminar ruta" de Admin. Rutas/CP-136). Crea una orden descartable exclusiva ("... DESCARTABLE ..." + timestamp) — acción destructiva sin deshacer, nunca reutiliza órdenes de otros CPs. Ejecuta `show_confirm_delete_routing_order(id)` → SweetAlert **"Eliminar órden — ¿Estás seguro de eliminar la órden?"** con botones "Cancelar"/"Eliminar" (mismo ruido cosmético "! Not valid!" mezclado que en otros SweetAlerts del sistema, ver CP-136) — confirmar por texto exacto `/^\s*(eliminar|confirmar|s[ií]|aceptar)\s*$/i`, nunca con un selector genérico que pueda pegarle a "Cancelar". Tras confirmar, la tarjeta desaparece del tablero de inmediato y se mantiene ausente tras `refrescarConCacheLimpia`. |
| CP-146 | tests-playwright/04-panel-control/01-general/cp146-carga-modulo-panel-control.js | Carga de `/sett/setting`: valida título "Panel de Control", las 3 pestañas (`#dash`/`#store`/`#twilio_config`), buscador `#input_search_setting`, botón `#save_settings` y ≥15 secciones del acordeón (`[id^="dashboard_button_setting_"]`, hay 21 en total). Primer CP del módulo Panel de Control, ver sección 19. |
| CP-147 | tests-playwright/04-panel-control/01-general/cp147-navegacion-pestanas-panel-control.js | Navegación entre pestañas: Dashboard↔Tienda online cambian correctamente la clase `.active` del `.tab-pane` correspondiente. Confirma también (verificación rápida) que el click en "Twilio" no cambia nada — el hallazgo completo se investiga a fondo en CP-148. |
| CP-148 | tests-playwright/04-panel-control/01-general/cp148-tab-twilio-no-funcional.js | Investigación dedicada del tab "Twilio": 3 intentos de click, captura de `page.on('console')`/`page.on('dialog')`, comparación de URL y de la lista de `.tab-pane` antes/después. Confirma que es un link roto/no habilitado en este entorno (sin errores de consola, sin diálogos, sin romper el resto del módulo) — documentado como ⚠️ hallazgo, no como fallo. |
| CP-149 | tests-playwright/04-panel-control/01-general/cp149-buscador-configuraciones-no-filtra.js | Buscador `#input_search_setting`: escribe "comisiones" y cuenta secciones visibles del acordeón antes/después — confirma que las 18 secciones visibles siguen todas visibles (no filtra), y que limpiar el campo restaura el listado sin romper nada. Documentado como ⚠️ hallazgo. Si en el futuro se corrige el buscador, este CP pasará a ✅ automáticamente (la validación de "sí filtra" ya está codificada como camino alternativo). |
| CP-150 | tests-playwright/04-panel-control/01-general/cp150-configuracion-general-comisiones.js | Primer CP del Bloque B (secciones del acordeón). Sección 20: cambia `#commission_for_sale` (input numérico) de su valor original a `7.5000`, guarda con `#save_settings`, refresca (`refrescarConCacheLimpia`) y valida persistencia; restaura el valor original al final y guarda de nuevo — patrón "editar→guardar→verificar→restaurar" que se repite en los CPs siguientes del bloque. Si el CP falla a mitad de camino, el `catch` intenta restaurar igual (recuperación de emergencia) antes de salir. |
| CP-151 | tests-playwright/04-panel-control/01-general/cp151-envio-facturas-por-correo.js | Sección 7: invierte `#is_basic_template_send_invoices` (checkbox). **Hallazgo de patrón**: el primer intento solo disparando `change` NO persistió el valor — hubo que agregar también un `dispatchEvent(new Event('click'))` para que el listener de la app sincronizara el input hidden `is_basic_template_send_invoices_hide` (que es lo que realmente se envía al guardar). Ver nota de patrón en la sección 19. |
| CP-152 | tests-playwright/04-panel-control/01-general/cp152-compras-externas.js | Sección 18: invierte `#date_external_purchases_checkbox` (único campo de la sección) usando el patrón `click`+`change` ya confirmado en CP-151. |
| CP-153 | tests-playwright/04-panel-control/01-general/cp153-fidelidad-de-clientes.js | Sección 19: invierte `#points_by_company_checkbox` (único campo de la sección), mismo patrón. |
| CP-154 | tests-playwright/04-panel-control/01-general/cp154-consecutivos-comprobante-fiscal.js | Sección 14 (4 campos numéricos: `current_fiscal_credit_controcode`, `current_consume_controlcode`, `current_special_tax_regimes_controlcode`, `current_government_receipt_controlcode`). **Hallazgo confirmado por inspección de red**: se enganchó `page.on('request')` en la llamada real a `POST /sett/updateSetting` y se confirmó que `request.postData()` **no incluye ninguno de los 4 campos**, aunque el resto del payload (~6975 caracteres, decenas de otros settings) se envía normalmente. El cambio se ve en el DOM hasta refrescar, momento en el que se pierde porque nunca llegó al servidor. Es la primera sección del acordeón que resultó tener un gap real de guardado — ver detalle completo en la sección 19. |
| CP-155 | tests-playwright/04-panel-control/01-general/cp155-personalizar-terminos-condiciones.js | Sección 16: activa `#personalized_signature_checkbox` (patrón `click`+`change`) y escribe en el textarea asociado `#personalized_signature_text`, guarda, valida que ambos persisten, restaura el estado original (checkbox off + texto vacío). |
| CP-156 | tests-playwright/04-panel-control/01-general/cp156-ventas-de-credito.js | Sección 9: activa `#apply_interest_on_credit_sales_checkbox` y fija `#interest_percentage_on_credit_sales` en 3.5000, guarda, valida persistencia, restaura el estado original. La sección tiene 3 pares checkbox+número más (prórroga, interés recurrente) y un checkbox suelto (`cxc_select_bank_account_is_required`) no probados en este CP — candidatos si se quiere ampliar cobertura de esta sección más adelante. |
| CP-157 | tests-playwright/04-panel-control/01-general/cp157-configuracion-de-inventario.js | Sección 4 (18 campos): invierte `#generate_automatic_product_code` ("Generar código interno automático", patrón `click`+`change`), guarda, valida persistencia, restaura. Sección tiene además `utility_calculation_setup_id_select`, `rollback_enable_days` (texto numérico "8") y varios checkboxes hermanos no probados aún. |
| CP-158 | tests-playwright/04-panel-control/01-general/cp158-plantillas-pdf-ordenes.js | Sección 10 (20 campos): primer CP del Bloque B que prueba un `<select>` en vez de checkbox/número — `#order_template_id` (Chosen, opciones "Plantilla general"/"RD"/"MX"/"DS"/"HO"), cambia de la opción actual a otra distinta (elegida dinámicamente del DOM, no hardcodeada), guarda, valida persistencia, restaura. El patrón de cambio de select reutiliza `.value = X` + `dispatchEvent('change')` + `jQuery(sel).trigger('chosen:updated')`, igual que otros selects Chosen del sistema (POS, etc.). |
| CP-159 | tests-playwright/04-panel-control/01-general/cp159-configuracion-asada.js | Sección 12 (8 campos, específica del ente regulador de agua ASADA en Costa Rica): cambia `#moratorium_percentage` a un valor entero (5), guarda, valida persistencia, restaura. **Hallazgo secundario confirmado**: al probar con un valor decimal (2.5000) el servidor lo redondeó a 3.0000 al guardar — el campo numérico no preserva decimales tal como se ingresan (comportamiento de redondeo del backend, no un fallo de guardado como CP-154; el valor sí llega y persiste, solo que alterado). Documentado en el log del CP sin hacerlo fallar, ya que el caso de éxito principal (entero) sí funciona correctamente. |
| CP-160 | tests-playwright/04-panel-control/01-general/cp160-dashboard-idioma.js | Sección 1 (12 campos): cambia `#language_select` (Chosen: English/Español/Chino) de "2" (Español) a "1" (English), guarda, valida persistencia, restaura. Sección tiene además `timezone_select`, `country_select`, `number_of_decimals`, `company_token` (dato de identificación de la compañía, no se toca) — no probados aún. |
| CP-161 | tests-playwright/04-panel-control/01-general/cp161-impresion-cierres-de-caja.js | Sección 3 (15 campos): invierte `#enable_cash_counting_by_denomination` ("Activar cuadre por denominación en cierre de caja"), guarda, valida persistencia, restaura. Sección tiene además `type_cash_print_select` (tipo de impresión) y `cash_counting_denominations` (JSON de denominaciones de moneda/billete, hidden) — no probados aún. |
| CP-162 | tests-playwright/04-panel-control/01-general/cp162-compras.js | Sección 17 (11 campos): invierte `#show_image_purchase_proform_checkbox` ("Adjuntar Imágenes a Órdenes de Compra"), guarda, valida persistencia, restaura. |
| CP-163 | tests-playwright/04-panel-control/01-general/cp163-modulo-credito-para-clientes.js | Sección 21 (4 campos): invierte `#apply_credit_to_customers_of_other_companies_checkbox`, guarda, valida persistencia, restaura. **Decisión deliberada**: la sección tiene un segundo checkbox, `#show_credit_module_checkbox` ("Activar módulo de crédito... por defecto el módulo está inactivo, por lo cual no será visible en el menú de Configuración"), que controla la visibilidad de TODO el módulo de crédito del sistema — CP-163 lo lee para verificar que no cambió durante la corrida, pero nunca lo modifica, porque un fallo a mitad de camino podría dejarlo apagado y romper otros CPs que dependen de él (CP-074 a CP-083, CP-156). Ver también la nota equivalente sobre alcance de campos riesgosos en la sección 19. |
| CP-164 | tests-playwright/04-panel-control/01-general/cp164-tracking-ordenes-online.js | Sección 11 (31 campos, la más grande cubierta hasta ahora fuera de las 3 gigantes pendientes): invierte `#show_prices_totals_customer_order_tracking_checkbox` ("¿Mostrar precios y totales en el tracking de órdenes online?"), guarda, valida persistencia, restaura. La sección tiene 2 checkboxes hermanos con id limpio (`require_customer_service_approval_checkbox`, `require_customer_product_approval_checkbox`) no probados, y un 4to checkbox (`enable_hide_fields_online_repair_order`) que revela una tabla anidada de ~23 checkboxes **sin id propio**, respaldados por un único campo hidden JSON (`online_repair_order_hidden_fields_json`, ej. `["vehicular_reception_pdf_previous_mileage",...]`) que controla qué campos se ocultan en el PDF/vista online de la orden. Esa tabla anidada es una sub-funcionalidad genuinamente distinta (array JSON vs. booleano simple, sin selectores estables por fila) — no cubierta por este CP, candidata a su propio CP si se decide profundizar la cobertura de esta sección más adelante. |
| CP-165 | tests-playwright/04-panel-control/01-general/cp165-ventas-facturacion-stock.js | Sección 8 "Configuración general de ventas" (91 campos, la más grande de todo el panel — dividida en 3 CPs: 165/166/167, ver exploración completa en la nota de esta sección más abajo). Sub-tema facturación y stock: invierte `#allow_negative_product_sale` + `#show_total_dolar`, guarda, valida persistencia, restaura ambos. |
| CP-166 | tests-playwright/04-panel-control/01-general/cp166-ventas-descuentos-roles-impuestos.js | Sección 8, sub-tema descuentos y roles: cambia `#max_general_discount` (20.0000→15.0000) y activa `#limit_discount_by_role` confirmando que revela la tabla `role_discount_<roleId>`, guarda, valida persistencia, restaura ambos. **No** asigna un valor específico a `#role_discount_1` — investigado en vivo y confirmado poco confiable para automatizar (ver hallazgo detallado más abajo); el CP solo confirma que el toggle revela/oculta la tabla correctamente. |
| CP-167 | tests-playwright/04-panel-control/01-general/cp167-ventas-documento-electronico-seguridad.js | Sección 8, sub-tema documento electrónico y seguridad (último de 3): cambia `#default_electronic_document_type` (select: Factura Interna→Factura Electrónica→Tiquete Electrónico→Factura de Exportación) e invierte `#seller_confirmation_an_order_exceeds_max_discount`, guarda, valida persistencia, restaura ambos. |

---

## 6. URL base del sistema bajo prueba

**Actualizado 2026-07-08**: la URL base y las credenciales ahora viven en `.env` (no versionado) y se acceden vía `config.js` en la raíz del proyecto — ver sección 17 "Variables de entorno y config.js". `config.js` expone `BASE_URL`, `LOGIN_URL` y `DASHBOARD_URL` ya armadas.

URL base principal:
- https://dev.designsoftcr.com/qa_talleralpha/public/ (= `config.BASE_URL`)

URLs frecuentes usadas en los scripts:
- Login: https://dev.designsoftcr.com/qa_talleralpha/public/log/login (= `config.LOGIN_URL`)
- Dashboard real tras login: https://dev.designsoftcr.com/qa_talleralpha/public/dash/dashboard (= `config.DASHBOARD_URL` — **no** `/public/dashboard`, ese path da 404, ver hallazgo de `auth/test-sesion.js`)
- Recepción: https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/vehicularQuickReception
- Tablero: https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/workOrderBoard
- Reportes: https://dev.designsoftcr.com/qa_talleralpha/public/reports/order_report

CP-001 a CP-127 siguen con estas URLs hardcodeadas (patrón legacy, no se tocan). CP-128 en adelante que usan `auth/` ya obtienen la URL de sesión indirectamente; CP-146 en adelante deben construir cualquier URL de módulo a partir de `config.BASE_URL` en vez de hardcodear el dominio.

---

## 7. Credenciales de prueba usadas

**Actualizado 2026-07-08**: estas credenciales viven en `.env` (`QA_EMAIL`/`QA_PASSWORD`, no versionado) y se acceden vía `config.EMAIL`/`config.PASSWORD` — ver sección 17.

Usuario de QA utilizado en los scripts:
- Usuario: qadesignsoftcr@gmail.com
- Contraseña: qa0000

Estas credenciales aparecen hardcodeadas en CP-001 a CP-127 (patrón legacy, no se tocan) y en `auth/generar-sesion.js` antes del 2026-07-08 (ahora importadas de `config.js`). Todo CP nuevo debe importarlas de `config.js`, nunca escribirlas literalmente.

---

## 8. Dependencias del proyecto

**Actualizado 2026-07-08.**

Dependencias declaradas en el proyecto:
- `selenium-webdriver` ^4.45.0 (suite histórica en `tests/selenium-backup/`, ya no se ejecuta)
- `@playwright/test` ^1.61.1 (suite activa en `tests-playwright/`)
- `dotenv` (carga `.env` para `config.js` — agregado 2026-07-08)

Instalación:
```bash
npm install
```

Tras instalar, copiar `.env.example` a `.env` y completar las variables reales (ver sección 17) antes de correr cualquier CP que use `config.js` o `auth/`.

El archivo package-lock.json está presente y registra las dependencias exactas instaladas.

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
- **Panel de Control → sección "Consecutivos Comprobantes" (acordeón del tab Dashboard, `/sett/setting`)**: gap de cobertura real, no resuelto. La sección es visible y clicable en el ambiente QA de Costa Rica usado por toda la suite, pero renderiza vacía porque su contenido depende de un tenant de Honduras inexistente en este ambiente — no hay forma de ejercer ni validar esa funcionalidad con los datos de QA disponibles. Distinto de las funcionalidades exclusivas de Costa Rica (Hacienda, Factura Electrónica CR, exoneraciones, etc.), que sí están correctamente cubiertas y son el alcance esperado del proyecto — este gap es específico de esa sección puntual. Ver detalle en sección 19.
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

---

## 15. Ruteo dentro de POS (CP-137 en adelante)

Explorado con `auth/usar-sesion.js` el 2026-07-07. Es una funcionalidad **distinta** de "Admin. Rutas" (sección 14) — vive dentro del propio POS (`pointOfSale`) y tiene DOS puntos de entrada relacionados pero independientes: el tab **"Ruteo"** (tablero de órdenes de ruteo) y la acción rápida **"Orden de ruteo"** (crea una orden nueva a partir del carrito). Ambos comparten el catálogo de rutas de Admin. Rutas — **confirmado**: el select de ruta del modal de creación lista en vivo las mismas rutas creadas en `/route/adminRoute`, incluidas las rutas de prueba generadas por CP-129/132/133/135.

### Tab "Ruteo" (`#btn_routing_option`, texto visible "Ruteo N" con contador)
Es un **tablero de órdenes de ruteo/entrega** (delivery board), no un formulario. Al hacer clic tarda ~5s en cargar (AJAX). Contiene:
- Filtros de estado (botones tipo pill): `#filter_routing_order_btn_all` (Todos), `#filter_routing_order_btn_pending` (Pendientes), `#filter_routing_order_btn_in_route` (En Camino), `#filter_routing_order_btn_delivered` (Entregado), `#filter_routing_order_btn_history_orders` (H. de Órdenes)
- Filtros adicionales (selects, sin ID capturado aún — verificar en el siguiente CP): "Ruta" (Seleccionar ruta), "Seleccionar Repartidor", "Recurrencia de Pedidos" (Seleccionar recurrencia)
- `#btn_toggle_advanced_filters` ("Opciones Avanzadas")
- Panel de resumen: "Seleccionadas: N", "Faltantes: N", "Total: N"
- Tarjetas por cada orden existente: fecha/hora, "Orden #N", "Repartidor: <nombre>", bloque "INFORMACION DEL CLIENTE" (nombre/dirección/WhatsApp o "Seleccionar cliente" si no tiene), bloque "INFORMACION DE ENTREGA" (fecha de entrega o "Pendiente de entrega"), Total, nombre de la ruta asignada, 3 badges de estado ("Ruta"/"Envío"/"Factura", cada uno "Pendiente" por defecto), botón "Seleccionar órden", y su propio menú `more_vert`.
- Órdenes existentes en QA vistas durante la exploración: "Orden #2" (2026-04-16, Repartidor Alexa Brenes, sin cliente, ₡4,520,000.00, RUTA LA VICTORIA - RIO FRIO), "Orden #1" (2026-03-11, Repartidor Alexa Mecanico Prueba, cliente "DESIGN AND SOFTWARE DEVELOPMENT...", ₡1,655.96, RUTA GUAPILES SAN JOSE).

### Acción rápida "Orden de ruteo" (menú de 3 puntos superior derecho del POS, `#demo-menu-top-right`)
Este menú (distinto del `#demo-menu-lower-left` que tiene "Producto externo"/"Historial de Facturas"/etc.) contiene 4 acciones: `(⇧+P) COTIZACIÓN` (`create_proform()`), **`Orden de ruteo`** (`create_routing_order()`), `(⇧+L) Generar Apartado`, `(⇧+C) Enviar a caja` (`confirm_send_sale()`). Con productos en el carrito, ejecutar `create_routing_order()` abre `#dialog_add_routing_order`:

- `#total_routing_order_txt` — total de la orden (mismo total del carrito, ej. ₡56,185.00)
- `#search_routing_customer_send_sale` (input, placeholder "Buscar Cliente") + `#payment_send_routing_order_client` (select oculto, se puebla al elegir cliente)
- `#send_routing_order_route` (select oculto tipo Chosen, "Asignar ruta") — **poblado en vivo desde Admin. Rutas**: en la exploración mostró RUTA PUERTO VIEJO - SAN JOSÉ (35), RUTA 2 (38), RUTA 3 (39), y todas las rutas "Ruta QA CP1XX..." creadas por CPs anteriores
- `#send_routing_order_agent_assigned` (select oculto tipo Chosen, "Asignar repartidor") — poblado con la lista de usuarios/empleados del sistema (mismo universo que "Asignar repartidores" de Admin. Rutas: ADMI ALPHA=311, Design Soft=1, DEV MESC=323, MARIA ALEXANDRA BRENES RODRIGUEZ=243, valentina mecanico prueba=321, etc.)
- `#send_routing_order_client_address` (select oculto, "Seleccionar dirección") — depende del cliente elegido; vacío/solo placeholder si no hay cliente seleccionado
- `#ck_send_routing_order_third_person_name` (checkbox, "Factura a nombre de terceros") + `#send_routing_order_third_person_name` (input asociado, placeholder "Factura a nombre de terceros")
- `#send_routing_order_by_email` (input email, placeholder "Correo de cliente.", label "Enviar factura por correo")
- `#send_routing_order_observation` (textarea, placeholder "Observaciones de venta")
- Botón enviar: `<a id="send_routing_order" class="btn btn-success _btn_15 make_payment"><span id="send_routing_order_lbl_btn">Enviar Orden</span></a>` — **NO es un `<button>` ni tiene `onclick` inline**, es un `<a>` con clase `.make_payment` (el binding del evento es vía jQuery por clase, no atributo) — buscarlo por `#send_routing_order` o por texto "Enviar Orden", nunca por `[onclick]`.
- Los selects de ruta/repartidor/dirección son `display:none` (widget tipo Chosen los reemplaza visualmente) — para setear su valor por test hay que asignar `.value` vía JS y disparar `change` (y `jQuery(sel).trigger('chosen:updated')` si aplica, mismo patrón que otros selects Chosen del sistema, ver sección de hallazgos de POS/pago).

### Acciones sobre una orden de ruteo YA EXISTENTE (tarjeta del tablero) — para CP-141/143/144/145
Cada tarjeta es un contenedor `id="brand_<ID_ORDEN>"` con clase `.pos_order_list_item_content_id_<ID_ORDEN>`. Estructura de acciones:
- Botón `more_vert` (`button[data-toggle="dropdown"]` dentro de `.product_dropdown_options`, id dinámico tipo `dLabel<N>` — no confiar en el id, buscar por el ícono `more_vert` dentro de la tarjeta) → despliega `ul.dropdown-menu` con 5 acciones:
  - "Ver órden" → `onclick="show_routing_order_detail(<ID>)"`
  - "Editar órden" → `onclick="show_create_routing_order_modal(<ID>)"` — **reutiliza el mismo modal `#dialog_add_routing_order`** de la creación, mismos IDs de campos, pero pre-poblado (edición in-place del mismo formulario, no un modal distinto). **Confirmado en vivo en CP-143**: al abrir con una orden existente, `send_routing_order_observation`/`send_routing_order_route`/`send_routing_order_agent_assigned` ya traen los valores actuales de la orden, y el guardado usa el mismo botón/flujo "Enviar Orden" que la creación (no hay un botón "Actualizar" separado).
  - "Marcar como EN CAMINO" → `onclick="change_routing_order_status(<ID>, 2)"`
  - "Marcar como ENTREGADO" → `onclick="change_routing_order_status(<ID>, 3)"` — **confirmado en CP-144**: se puede llamar directamente tras pasar por estado 2 (EN CAMINO → ENTREGADO) sin SweetAlert de confirmación adicional; no se probó saltar directo de Pendiente (1) a Entregado (3).
  - "Eliminar órden" → `onclick="show_confirm_delete_routing_order(<ID>)"` — **acción destructiva**, usar solo sobre órdenes creadas por el propio CP. **Confirmado en CP-145**: abre un SweetAlert **"Eliminar órden — ¿Estás seguro de eliminar la órden?"** con botones "Cancelar"/"Eliminar" (mismo ruido cosmético "! Not valid!" mezclado que otros SweetAlerts del sistema, ver CP-136) — confirmar por texto exacto, nunca con selector genérico. Tras confirmar, la tarjeta desaparece de inmediato y se mantiene ausente tras refrescar con caché limpia.
  - (estados numéricos confirmados: 1=Pendiente por defecto, 2=En Camino, 3=Entregado — coincide con los filtros `filter_routing_order_btn_pending/in_route/delivered`)
- Botón "Seleccionar órden": `<a class="btn routing_order_card_btn_select_order ...">` — sin `onclick` inline (evento delegado por clase `.routing_order_card_btn_select_order`, no buscar por `[onclick]`)
- Badge de estado visible en la tarjeta (ej. "Pendiente") vive dentro de un tooltip/popover (`data-powertip`) asociado al link de ítems `#a_routing_order_items_<ID>`, con estilo propio (fondo oscuro, `Orden: #<N>` + badge de estado + Cliente + Fecha + Observación + lista de productos) — separado de los 3 badges "Ruta/Envío/Factura" visibles directamente en la tarjeta.
- Checkbox de selección múltiple: `#select_order_remove_<ID>` (`.sub_section_checkbox_order`, patrón checkbox-slider) — **confirmado en CP-185/186/187/188/189/190 (2026-07-19)**: es el ÚNICO mecanismo real de selección que usan las acciones en lote del menú superior del tablero. Requiere el mismo patrón que los checkboxes de Panel de Control (`.checked = valor` + `dispatchEvent('change')` + `dispatchEvent('click')`), un click normal no basta. **Importante**: el botón "Seleccionar órden" visible en cada tarjeta (`.routing_order_card_btn_select_order`) es un mecanismo DISTINTO y NO equivalente — solo resalta la tarjeta visualmente (borde verde) y no incrementa el contador "Seleccionadas: N" ni cuenta para las acciones en lote; confundir ambos lleva a falsos negativos ("No hay órdenes seleccionadas" pese a haber "seleccionado" tarjetas).

### Menú de acciones en lote del tablero (botón more_vert junto a los filtros de estado) — confirmado en CP-183 a CP-192
El id numérico de este botón (ej. `dLabel1298`) **cambia tras cada re-render AJAX del tablero** (al cambiar de filtro, etc.) — nunca depender de un id fijo, ubicarlo en vivo vía `document.querySelectorAll('button[data-toggle="dropdown"]')` (el primero visible, antes de las tarjetas). El menú tiene 8 opciones:
- **"Seleccionar"** (`select_orders()`) y **"Seleccionar todos"** (`toggle_all_order_switches()`) — "Seleccionar todos" marca los checkboxes reales `#select_order_remove_<ID>` de TODAS las órdenes actualmente visibles bajo el filtro/página activos (no "todas las órdenes del sistema") — confirmado en CP-189/190.
- **"Limpiar selección"** (`clear_selected_orders_quick()`) — desmarca todos los checkboxes, es una acción puramente de UI (no dispara ninguna petición al servidor) — confirmado en CP-188.
- **"Eliminar"** (`validate_delete_order_selected()`) — acción destructiva, abre un SweetAlert **"Eliminar Órdenes — ¿Estás seguro de eliminar las órdenes?"**.
- **"Cambiar Repartidor"** (`validate_change_seller_order_selected()`) — abre el modal **"Cambiar Repartidor de Órdenes"** con `#modal_new_agent_select` (nuevo repartidor) y botones Guardar/Cancelar; el cambio persiste tras refrescar — confirmado en CP-186/189.
- **"Enviar a Ruteo"** (`validate_send_orders_selected()`) — abre el modal **"Confirmar Envío de Órdenes"** (Ruta/Repartidor/Facturar automáticamente + Guardar/Cancelar); funciona igual sobre órdenes YA existentes en el tablero (reasigna ruta/repartidor de las seleccionadas) — confirmado en CP-185.
- **"Imprimir"** y **"Descargar PDF"** (ambos onclick literal `printReportRoutingPDF()`) — **comparten la misma función pero se diferencian por el atributo `data-mode` del `<a>`** ("0" para Imprimir, "1" para Descargar PDF), que la función lee vía `event.currentTarget` para decidir el camino: Imprimir abre una vista previa inline (`iframe blob:application/pdf`, visor nativo del navegador), Descargar PDF dispara una descarga real de archivo (`Reporte_Ruteo_SinRepartidor_<fecha>.pdf`, confirmado con `page.on('download')`). Ambos disparan `POST /pos/getReportRoutingData` con el filtro de estado activo — confirmado en CP-183/184. **Con muy pocas o ninguna orden visible** (probado con 1 y con 0), la función no genera ningún frame/descarga — comportamiento esperado para un reporte vacío, no un bug (sin errores de consola).
- Llamar a `printReportRoutingPDF()` directamente vía `page.evaluate()` (sin un evento de click real) **lanza `TypeError: Cannot read properties of undefined (reading 'currentTarget')`** — la función depende del objeto `event`, hay que clickear el `<a>` real, no invocar la función a mano.

### ⚠️ Incidente documentado (2026-07-19): aislamiento por fecha de creación NO es seguro para acciones destructivas en este tablero
Al validar CP-185 (selección + "Enviar a Ruteo" en lote), la limpieza automática del CP usaba `aislarPorFecha()` (filtro "Fecha creación desde/hasta" = hoy) para identificar y luego eliminar las órdenes de prueba creadas por el propio CP. **Ese filtro devolvió 11 órdenes, no las 2 creadas por el CP** — incluyó 9 órdenes preexistentes (ids 472-474, 384-388, 372) que en este ambiente QA también muestran fecha de creación "hoy". La limpieza las eliminó a todas. Las 9 órdenes preexistentes tenían datos claramente de prueba (cliente "cliente prueba tarea 5", repartidor "vendedor valentina", montos de ₡100.00) — el usuario confirmó que no representaba una pérdida grave dado que este ambiente es de datos descartables, pero el incidente expone que **filtrar por fecha de creación NO aísla de forma confiable un conjunto propio de órdenes en este tablero**, porque el ambiente QA acumula actividad de otras pruebas con la misma fecha. **Corrección aplicada desde CP-186 en adelante**: identificar las órdenes propias por **diferencia exacta de IDs** (comparar la lista completa de IDs visibles en el tablero ANTES y DESPUÉS de crear las órdenes de prueba, sin ningún filtro), nunca por fecha, para cualquier CP que vaya a seleccionar/eliminar/reasignar en lote. **Regla del usuario a partir de este incidente**: toda acción destructiva o en lote (Eliminar, Cambiar Repartidor en lote, Limpiar selección, o cualquier acción sobre más de 1 registro a la vez) debe confirmarse explícitamente con el usuario antes de ejecutarse contra el ambiente QA compartido, incluso si los datos "parecen" ser de prueba.

### Estado de implementación — ✅ completo (2026-07-19): menú de acciones en lote del tablero (CP-183–CP-192)
Los 10 CPs listados arriba (CP-183 Imprimir, CP-184 Descargar PDF, CP-185 Enviar a Ruteo en lote, CP-186 Cambiar Repartidor en lote, CP-187 Eliminar en lote, CP-188 Limpiar selección, CP-189 Seleccionar todos + Cambiar Repartidor, CP-190 Seleccionar todos + Eliminar, CP-191 Filtros avanzados, CP-192 hallazgo de buscador inexistente) pasaron 4/4 validaciones cada uno. CP-189/CP-190 validan "Seleccionar todos" únicamente de forma reversible (marcar → confirmar que afecta todo lo visible → "Limpiar selección" para deshacer) y ejecutan la acción real (Cambiar Repartidor/Eliminar) solo sobre 2 órdenes propias creadas y aisladas por diferencia exacta de IDs — nunca se confirmó una acción destructiva/en lote sobre el conjunto completo de "Seleccionar todos", por decisión explícita del usuario dado que ese conjunto incluye órdenes ajenas del ambiente QA compartido.

### Fragilidad de selectores descubierta al automatizar CP-186/189/191
- **Detección de modales por clase+regex es poco confiable en este tablero**: un selector genérico `.modal, [class*="modal"]` filtrado por `textContent` con regex (ej. `/Cambiar Repartidor/i`) puede capturar el elemento equivocado si hay overlays superpuestos en la página (ej. el modal de "Compañías con licencias vencidas" o un prompt de permisos de notificaciones), cuyo `textContent` concatenado a veces satisface la misma regex por coincidencia parcial. Esto causó fallos silenciosos en la primera versión de CP-186 (leía texto de un overlay no relacionado, validaciones de conteo/persistencia fallaban pese a que la acción real había funcionado). **Corrección**: ubicar el modal correcto a través de un elemento hijo único y confiable (ej. `document.getElementById('modal_new_agent_select').closest('.modal')` para "Cambiar Repartidor de Órdenes"), nunca por clase genérica + texto. Aplicado en CP-186 y CP-189.
- **Los selects de "Opciones Avanzadas" (`#filter_routing_order_province`, y presumiblemente cantón/distrito) están envueltos por el widget Chosen, cuyo contenedor visible (`.chosen-container`) es un HERMANO del `<select>` oculto, no un ancestro** — `elemento.closest('.chosen-container')` siempre devuelve `null` para estos campos porque `closest()` solo recorre ancestros. Hay que ubicarlo con el combinador de hermanos (`document.querySelector('#filter_routing_order_province ~ .chosen-container')`) tanto para verificar visibilidad como para interactuar (abrir `.chosen-single`, click real de Playwright sobre el `li.active-result` deseado en `.chosen-results` — `page.selectOption()` falla con timeout porque el `<select>` real nunca es visible). Confirmado en CP-191.

### Comportamiento tras "Enviar Orden" (confirmado en CP-138/141/142)
- Con cliente + ruta + repartidor asignados: al hacer clic en `#send_routing_order` aparece un SweetAlert de confirmación **"¿Enviar órden a ruteo?"** con botones "Cancelar" / "Enviar" (el texto puede incluir ruido "! Not valid!" mezclado, mismo hallazgo cosmético que en otros SweetAlerts del sistema — no bloquea nada). Hay que clickear el botón "Enviar" **por texto exacto**, no con un selector genérico `button.confirm,button` — ese selector puede pegarle a "Cancelar" si viene antes en el DOM. Tras confirmar: el modal se cierra, el carrito del POS queda vacío, y la orden aparece de inmediato como tarjeta nueva en el tablero del tab Ruteo (estado inicial "Pendiente").
- **Sin cliente asignado** (ruta/repartidor sí completos): el clic en "Enviar Orden" NO muestra ningún SweetAlert de confirmación, el modal permanece abierto silenciosamente, y NO se crea ninguna orden — el cliente es un campo requerido de facto aunque no haya mensaje de error visible. Confirmado en CP-142.
- El select de cliente (`#payment_send_routing_order_client`) empieza vacío (`options.length` chico) y se puebla dinámicamente tras buscar con `#search_routing_customer_send_sale` + `get_customer_by_pos_option(0)` — buscar NO selecciona automáticamente ninguna opción, hay que asignar `.value` a una de las opciones nuevas y disparar `change` después de la búsqueda.
- "Ver órden" (`show_routing_order_detail(ID)`) abre el modal `#dialog_view_routing_order_detail` (de solo lectura, no explorado en profundidad — suficiente para CP-141).

---

## 16. Convención de carpetas para CPs nuevos

A partir de la reorganización del 2026-07-08, `tests-playwright/` está organizada en subcarpetas por módulo → submódulo del sistema real (ver árbol completo en la sección 2 y la tabla módulo/submódulo/rango de CPs/ruta en el README).

**Regla:** todo CP nuevo que se genere debe guardarse directamente dentro de la subcarpeta correspondiente a su módulo y submódulo real del sistema (`tests-playwright/modulo/submodulo/`), **nunca suelto en la raíz de `tests-playwright/`**. Si el CP pertenece a un módulo o submódulo que todavía no tiene carpeta creada, crear la carpeta nueva siguiendo el mismo patrón de numeración (`NN-nombre-modulo/NN-nombre-submodulo`) antes de generar el archivo.

Esta regla debe respetarse en todas las sesiones futuras de trabajo en este proyecto, no solo en la reorganización que la originó.

Consecuencias prácticas de la profundidad de carpetas (2 niveles bajo `tests-playwright/`, es decir 3 niveles bajo la raíz del repo):
- `require('../../../auth/usar-sesion')` (3 `../`, no 1) para los CPs que usan sesión reutilizable (ver "Autenticación en las pruebas" del README).
- `path.join(__dirname, '..', '..', '..', 'reports', 'screenshots')` (3 `../`, no 1) para el patrón `screenshotOnFail` estándar de la suite.
- El skill `crear-caso-prueba` debe generar el archivo ya en la ruta anidada correcta, no en la raíz de `tests-playwright/` para luego moverlo.

---

## 17. Variables de entorno y config.js

**Agregado 2026-07-08.** La URL base y las credenciales de QA dejaron de estar hardcodeadas en `auth/` y ahora se centralizan en variables de entorno.

### Archivos involucrados
- **`.env`** (raíz del proyecto, **no versionado** — está en `.gitignore`): contiene los valores reales.
  ```
  QA_BASE_URL=https://dev.designsoftcr.com/qa_talleralpha/public
  QA_EMAIL=qadesignsoftcr@gmail.com
  QA_PASSWORD=qa0000
  ```
- **`.env.example`** (raíz, sí versionado): misma estructura con placeholders, documenta qué variables hacen falta sin exponer credenciales reales. Copiar a `.env` y completar antes de correr cualquier CP que dependa de `config.js` (ver README sección "Instalación").
- **`config.js`** (raíz): carga `dotenv` y exporta las constantes ya armadas:
  ```javascript
  require('dotenv').config();
  module.exports = {
    BASE_URL: process.env.QA_BASE_URL,
    LOGIN_URL: `${process.env.QA_BASE_URL}/log/login`,
    DASHBOARD_URL: `${process.env.QA_BASE_URL}/dash/dashboard`,
    EMAIL: process.env.QA_EMAIL,
    PASSWORD: process.env.QA_PASSWORD,
  };
  ```

### Qué se migró y qué NO
- `auth/generar-sesion.js` ahora importa `LOGIN_URL`, `EMAIL`, `PASSWORD` de `../config` en vez de tenerlos hardcodeados.
- `auth/test-sesion.js` ahora importa `DASHBOARD_URL` de `../config` en vez de tenerlo hardcodeado.
- `auth/usar-sesion.js` no tenía URLs/credenciales hardcodeadas (solo maneja `storageState` y CDP) — no requirió cambios.
- **CP-001 a CP-127 NO se tocaron** — siguen con sus credenciales/URLs hardcodeadas como patrón legacy, funcionando igual que antes. Esta migración aplica solo a la infraestructura compartida (`auth/`) y a los CPs nuevos de aquí en adelante.
- Verificado tras la migración: `node auth/generar-sesion.js`, `node auth/test-sesion.js` y un CP existente que usa `abrirContextoConSesion` (CP-128) corrieron sin cambios de comportamiento.

### Regla para CPs nuevos
Todo CP nuevo debe importar sus URLs y credenciales desde `config.js` (ajustando el número de `../` según la profundidad de la carpeta — 3 niveles para un CP en `tests-playwright/modulo/submodulo/`), **nunca hardcodearlas de nuevo**:
```javascript
const { BASE_URL } = require('../../../config');
const URL_MODULO = `${BASE_URL}/ruta/del/modulo`;
```

---

## 18. Reporte de tiempos de ejecución

**Agregado 2026-07-08.** Sistema para registrar y reportar cuánto tarda cada CP, pensado para CPs nuevos (CP-146 en adelante) — no se aplicó retroactivamente a CP-001–145 para no tocar CPs ya congelados.

### `utils/registrar-tiempo.js`
Exporta:
- `registrarResultado({ cp, modulo, estado, tiempoMs })`: agrega una entrada a `reports/tiempos-ejecucion.json` (array acumulado) con `cp`, `modulo`, `estado` (`'pass'`|`'fail'`), `tiempoMs` y un `timestamp` ISO generado automáticamente. Se llama una vez al final de cada CP, tanto en el camino de éxito (antes del `console.log('✅ ... PASSED')`) como en el `catch` de fallo (antes del `process.exit(1)`).
- `moduloDesdeRuta(dirname)`: deriva el string de módulo/submódulo (ej. `"01-facturar/09-ruteo-pos"`) a partir de `__dirname`, buscando el segmento `tests-playwright` en la ruta y tomando los 2 siguientes. Se le pasa `__dirname` del CP que llama, no hace falta escribir el módulo a mano.
- `RUTA_JSON`: ruta absoluta a `reports/tiempos-ejecucion.json`, por si algún script necesita leerlo directamente.

### `utils/generar-reporte-tiempos.js`
Script standalone (`node utils/generar-reporte-tiempos.js`) que lee `reports/tiempos-ejecucion.json` y genera `reports/reporte-tiempos.html` con:
- Resumen (total de registros, pasaron/fallaron, tiempo promedio general).
- Top 10 CPs más lentos, destacados con fondo amarillo.
- Promedio de tiempo por módulo/submódulo.
- Tabla completa de todos los CPs registrados, con badge ✅/⚠️/❌ por fila.

Umbrales de clasificación reutilizados del proyecto (`evaluarCargaPagina`/`evaluarAccion`), aplicados aquí al tiempo TOTAL del CP (no hay desglose por acción en el JSON acumulado): ✅ si `tiempoMs ≤ 3000`, ⚠️ si `> 3000`, ❌ si `> 8000`.

Si `reports/tiempos-ejecucion.json` no existe todavía (ningún CP nuevo corrió aún), el script lo indica por consola y no genera el HTML.

### Notas
- `reports/tiempos-ejecucion.json` y `reports/reporte-tiempos.html` están en `.gitignore` — son datos locales/regenerables de cada máquina, igual que `reports/screenshots/`, no se versionan.
- No hay lock/mutex contra escrituras concurrentes — asumido seguro porque los CPs de este proyecto se corren de a uno por vez (`node <ruta>`), nunca en paralelo real.
- Ver la plantilla actualizada del skill `crear-caso-prueba` para el patrón exacto de integración (dónde va la llamada, cómo se captura `tiempoInicioCP`).

---

## 19. Panel de Control (exploración 2026-07-08, CP-146 en adelante)

Explorado vía `abrirContextoConSesion` + navegación directa (sin pasar por el ítem del menú lateral, que está oculto dentro de un acordeón colapsado — el `<a>` real tiene `href` fijo, no hace falta expandir el menú para llegar).

### Ubicación y estructura general
- URL: `${BASE_URL}/sett/setting` (título de página: "Panel de Control | Sistema Web ERP").
- Ojo: en el menú lateral hay **3 ítems distintos** con "Panel de Control" en el texto — no confundir:
  - **"Panel de control"** → `/sett/setting` — **este es el módulo**, configuración general del sistema.
  - "Panel de Control" → `/soSetting/storeOnlineSetting` — configuración de Tienda en línea, un módulo aparte (no explorado, no confundir con el tab "Tienda online" que SÍ vive dentro de `/sett/setting`).
  - "Panel de Control de Solicitudes" → `/hr_pay_man/hr_payroll_approval_panel` — panel de aprobación de solicitudes de RRHH, módulo totalmente distinto.
- `/sett/setting` tiene 3 pestañas (`.nav-tabs a[data-toggle="tab"]`): **Dashboard** (`href="#dash"`, activa por defecto), **Tienda online** (`href="#store"`), **Twilio** (`href="#twilio_config"`).
- Un popup de notificaciones del navegador puede aparecer al cargar (`#workshop-web-notification-permission-dismiss` para cerrarlo) — mismo patrón visto en otros módulos POS.

### Tab "Dashboard" (`#dash`) — acordeón de 21 secciones de configuración
Patrón por sección: header clicable `#dashboard_button_setting_N` (con `data-target="#dashboard_content_settings_N"`) que expande/colapsa `#dashboard_content_settings_N` (inicia `style="display:none"`). **Un solo botón "Guardar" compartido** (`#save_settings`, clase `btn btn-success _btn_15`) al final de la página guarda TODAS las secciones a la vez — no hay guardado independiente por sección. Los números de sección (N) no son estrictamente correlativos con el orden visual (la sección 20 "Configuración general de comisiones" aparece visualmente entre la 8 y la 9).

Secciones encontradas (nombre — cantidad de campos input/select/textarea):
1. Dashboard — 12 (incluye `#language_select`: English/Español/Chino, tipo Chosen)
2. Impresión de factura de ventas — 58 (la más grande junto con la 8). **Explorada a fondo y cubierta con 3 CPs (CP-173/174/175, 2026-07-10)** — dividida en 3 sub-temas: formato general/moneda, contenido de la factura impresa, cliente/referencias/facturación electrónica. Ver hallazgo de campos huérfanos en "Notas para el diseño de CPs" más abajo.
3. Impresión de cierres de caja — 15
4. Configuración de inventario — 18
5. Configuración del sistema POS (Punto de venta) — 57
6. Recepción vehicular — 40
7. Envío de facturas por correo — 4
8. Configuración general de ventas — **91** (la sección más grande de todo el panel). **Explorada a fondo y cubierta con 3 CPs (CP-165/166/167, 2026-07-09)** — a diferencia de "Tracking de órdenes online" (CP-164), casi todos los 91 campos tienen IDs estables e individualmente direccionables, agrupables en ~8 sub-temas claros: (1) módulos ruteo/apartados/cocina, (2) facturación/stock/consecutivos/otras compañías, (3) impuesto/cobro adicional, (4) parámetros operativos (lector de código de barras, retención, devoluciones), (5) descuento general + descuento por rol (tabla `role_discount_<roleId>`, IDs estables por rol pero **ver hallazgo de fiabilidad más abajo**), (6) gastos operativos por rol (tabla `operating_expense_category_role_<roleId>`, no probada), (7) IVA/utilidad mínima/horas laboradas, (8) documento electrónico por defecto + seguridad de descuento excedido + consignar productos a OT + recordatorios. Se dividió en 3 CPs en vez de uno solo porque los temas son genuinamente distintos, no por simple volumen de campos.
20. Configuración general de comisiones — 9. Campos confirmados: "Comisión por Venta" (input numérico), "Comisión por Cobro" (input numérico), toggle "Activar comisión por rol Mecánico" (`#enable_mechanic_role_commission`, apagado por defecto) que al activarse revela 3 campos adicionales por rol (`#mechanic_role_commission_cash_percent`, `_card_percent`, `_mixed_percent`).
9. Ventas de Crédito — 11
10. Plantillas pdf de las órdenes — 20
11. Tracking de órdenes online para clientes — 31
12. Configuracíon ASADA — 8 (sic, con acento mal puesto en el HTML real — específico de un ente regulador de agua/instituciones de Costa Rica)
13. Activación de módulos para mobile — 4, pero **no tiene flecha de acordeón, tiene un ícono de teléfono** — parece ser un teaser de "contactar para activar", no una sección expandible normal; verificar antes de tratarla como sección editable.
14. Consecutivos Comprobante Fiscal — 4
15. Consecutivos Comprobantes — **⚠️ gap de cobertura confirmado (2026-07-08), no un "no aplica" trivial**: la sección SÍ aparece visible en el menú del mismo ambiente QA que usa toda esta suite (título real "Consecutivos Comprobantes", botón `dashboard_button_setting_15` clicable), pero al expandirla el contenido real es solo un aviso "¡Atención!" y un contenedor `#display_honduras_consecutive_detail_content` que queda vacío (0 campos) porque el tenant de este ambiente QA es Costa Rica, no Honduras. A diferencia de funcionalidades exclusivas de Costa Rica (Hacienda, Factura Electrónica CR, exoneraciones, etc.), que están correctamente fuera del alcance de un ambiente QA costarricense y NO representan ningún gap, esta sección puntual sí es una funcionalidad visible en la interfaz que la suite no puede ejercer ni validar en este ambiente por no tener un tenant de Honduras disponible. No tiene CP propio porque no hay nada renderizado que interactuar — pero queda documentado como cobertura pendiente/no verificable en este entorno, no como "sin importancia".
16. Personalizar términos y condiciones de la firma, para la recepción de vehículos App — 6
17. Compras — 11
18. Compras externas — 2
19. Fidelidad de clientes — 2
21. Módulo de Crédito para clientes — 4

### Tab "Tienda online" (`#store`) — explorado a fondo 2026-07-10/14, cubierto con CP-176
11 elementos detectados por escaneo genérico, mapeados a **6 configuraciones reales**: `#company_store_online_select` (select, ver hallazgo de integridad de datos abajo), `#currency_select` (select-multiple vía widget dual-listbox "Disponibles ⇄ Seleccionadas" + caja "Moneda por defecto" — no cubierto, gap documentado), `#color_select` (select, 8 opciones), `#file_header`/`#file_footer` (carga de imagen — no cubierto, gap documentado), `#enable_newsletter` (checkbox). Los otros 5 elementos del escaneo genérico son cajas de búsqueda ("Buscar...") de los widgets Chosen/dual-listbox, sin significado propio.

### Botón "Guardar cambios" de Tienda online (`#save_settings_store`) — ⚠️ HALLAZGO: no funcional — **confirmado en CP-176**
Al modificar `#color_select` y `#enable_newsletter` y clickear "Guardar cambios" (3 intentos, incluyendo un click real de Playwright, no solo sintético vía `page.evaluate`), **no pasa nada observable a nivel de red ni de persistencia**: `page.on('request')` no capta ninguna petición POST relacionada en ningún intento, y tras refrescar la página los valores vuelven a ser los originales — los cambios quedaron solo en memoria del DOM. Investigado a fondo antes de descartarlo como error del script: el botón `#save_settings_store` **no está dentro de ningún `<form>`** (`btn.closest('form') === null`), a diferencia de patrones de guardado que sí funcionan en el resto de la suite. Adicionalmente se detectó en la consola un error JS recurrente (`$(...).steps is not a function`) durante la carga de la pestaña, que probablemente interrumpe la ejecución síncrona de scripts de inicialización posteriores — una causa técnica plausible de por qué el handler de click del botón nunca llega a registrarse. Es decir, "Guardar cambios" en Tienda online es un botón roto o no cableado en este entorno de QA — mismo patrón exacto que el tab "Twilio" (CP-148): no un problema del test, sino de la aplicación. Por esto, CP-176 documenta el hallazgo (con 5 validaciones que confirman el diagnóstico y que el resto del módulo no queda roto) en vez de forzar una cobertura de "guarda y persiste" que nunca podría pasar de forma genuina.

### Selector "Compañía" de Tienda online (`#company_store_online_select`) — ⚠️ HALLAZGO DE INTEGRIDAD DE DATOS (posible bug, no solo un campo raro) — observado 2026-07-10, sin CP propio (no se modifica deliberadamente)
Este campo controla qué compañía se muestra "en la información del menú, pie de página, correos, etc." de la tienda en línea (según el texto de ayuda propio del campo). **Se esperaba que mostrara la compañía del contexto de sesión activo** — la misma que aparece en el selector "Compañía" en la parte superior de todo `/sett/setting` y con la que se ejecutaron los 30 CPs de Panel de Control (CP-146 a CP-176): **"TALLER ALPHA PREMIUM"** (id de compañía 20). En cambio, al explorar el tab "Tienda online" con la sesión QA reutilizada (`qadesignsoftcr@gmail.com`), el campo mostraba seleccionada **"Design Soft"** (id de compañía 8) — la compañía interna del proveedor del sistema (DesignSoft S.A.), no la del taller cliente. Esto coincide además con el nombre que aparece en el avatar de usuario de la topbar ("Design Soft"), sugiriendo que la cuenta QA tiene acceso multi-compañía (el `<select>` lista 14 compañías distintas: Taller Alpha Premium, Actualización de Taller Alpha, Colombia, Compañía Contabilidad, Contabilidad, Contablidad 4.0, Design Soft, El Salvador, Honduras, Makan Demo de Guatemala, 2 registros sin nombre configurado ("Nombre de la empresa:"), Panama 2, Valentina Compañía). **No se puede confirmar con certeza si esto es un bug o un valor de configuración legítimo e intencional** (una tienda puede, en teoría, mostrar deliberadamente los datos de otra compañía) — pero dado que el valor mostrado NO coincide con la compañía de la sesión activa ni con el contexto de todos los demás CPs de este módulo, y que un valor incorrecto aquí impactaría directamente información visible a clientes finales (menú, pie de página, correos de la tienda en línea), se documenta con prioridad alta como posible hallazgo de integridad de datos entre compañías, no como un gap menor de cobertura. **Deliberadamente no se modificó este campo** en ningún CP para no arriesgar alterar configuración cruzada entre compañías sin autorización explícita — recomendado confirmar con el equipo de producto/desarrollo si el valor "Design Soft" es intencional para esta compañía QA antes de decidir si amerita un bug ticket formal.

### Tab "Twilio" (`#twilio_config`) — ⚠️ HALLAZGO: no funcional en este entorno — **confirmado en CP-148**
Al clickear el `<a href="#twilio_config">`, **no pasa nada observable**: no cambia la URL, no aparece ningún `.tab-pane` con id `twilio_config` en el DOM (solo existen `#dash` y `#store` como `.tab-pane` reales), no hay error de consola ni diálogo nativo. CP-148 lo confirmó con 3 intentos de click + captura de `console`/`dialog` + comparación de estado antes/después: el resultado es idéntico en los 3 intentos, y el resto del módulo (Dashboard) no queda roto tras los clicks. Es decir, el tab "Twilio" es un link roto o placeholder en este entorno de QA (posiblemente una integración no habilitada para esta compañía) — no un problema del script.

### Buscador de configuraciones — ⚠️ HALLAZGO: no filtra — **confirmado en CP-149**
`#input_search_setting` (placeholder "Buscar en las configuraciones") existe y acepta texto, pero **no filtra visualmente las secciones del acordeón**: CP-149 escribió "comisiones" (término que debería coincidir con una sola sección, "Configuración general de comisiones") y las 18 secciones visibles antes de buscar siguieron las 18 visibles después, sin ocultar ninguna. Limpiar el campo sí restaura el listado sin dejar la pantalla en un estado roto. CP-149 quedó escrito para pasar a ✅ automáticamente el día que se corrija el filtrado (la validación positiva ya está codificada como camino alternativo, no hace falta reescribir el CP).

### Notas para el diseño de CPs
- Dado el tamaño de algunas secciones (91 y 58 campos), no tiene sentido probar campo por campo — el patrón realista por sección es: expandir → cambiar UN campo representativo (o activar un toggle) → guardar con el botón compartido `#save_settings` → refrescar y verificar que el valor persiste.
- Como el guardado es compartido entre TODAS las secciones del tab Dashboard, hay que tener cuidado de no dejar cambios de una sección afectando la corriente de otro CP — cada CP que modifique un valor debería idealmente restaurar el valor original al final, o usar campos que no rompan otros módulos si quedan modificados (similar al cuidado ya aplicado con datos descartables en otros módulos). Patrón usado desde CP-150: leer el valor original, cambiar, guardar, verificar, **restaurar el original y guardar de nuevo** — con un intento de restauración también en el `catch` por si el CP falla a mitad de camino.
- **Patrón de campos tipo checkbox — confirmado en CP-151** (hallazgo, no obvio de antemano): los checkboxes de este panel tienen un input `hidden` compañero (`<id>_hide`) que es el que realmente se envía al guardar. Para que la app sincronice ese hidden hay que disparar **tanto `'click'` como `'change'`** tras asignar `.checked` manualmente — disparar solo `'change'` (el patrón usado en el resto de la suite para selects/checkboxes simples) NO fue suficiente aquí y el valor no persistió en el primer intento de CP-151. Patrón validado:
  ```javascript
  await page.evaluate(({ id, valor }) => {
    const el = document.getElementById(id);
    el.checked = valor;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('click', { bubbles: true }));
  }, { id, valor });
  ```
  Este patrón ya se replicó con éxito en CP-152 y CP-153 (ambos pasaron al primer intento) — usarlo por defecto para cualquier checkbox nuevo dentro de `/sett/setting`, no solo disparar `change`.
- Al guardar (`#save_settings`) **no aparece ningún SweetAlert ni toast de confirmación observable** — la única forma confiable de validar que un cambio se guardó es refrescar la página (`refrescarConCacheLimpia`) y volver a leer el campo, no buscar un mensaje de éxito en pantalla.
- **No todos los campos que se ven en el formulario están conectados al guardado — confirmado en CP-154**: antes de asumir que un CP de "editar y guardar" va a funcionar, si el primer intento no persiste, no descartar que sea un hallazgo real de la app (campo no incluido en el payload) en vez de un error del test. La forma más rápida de diferenciarlo es enganchar `page.on('request')` filtrando `req.url().includes('/sett/updateSetting')` y revisar `req.postData()` — si el campo/su hidden companion no aparece ahí, el guardado nunca llegó al servidor para ese campo específicamente, aunque el resto de la página sí se guarde con normalidad (confirmado con response 200 y body `"1"`).
- **Los campos numéricos pueden redondearse al guardar — confirmado en CP-159**: a diferencia de CP-154 (campo ausente del payload), en `moratorium_percentage` (sección ASADA) el valor SÍ se guarda, pero el servidor redondea decimales (2.5000 → 3.0000). Antes de elegir el valor de prueba para un campo numérico nuevo, preferir un entero simple para el caso de éxito principal, y si se quiere documentar precisión decimal, hacerlo como verificación secundaria no bloqueante (ver patrón en CP-159) en vez de asumir que cualquier decimal se guardará tal cual.
- **No asumir que una sección con "0 campos" es un bug ni descartarla sin más como "no aplica"**: verificar el HTML real antes de decidir. Distinguir dos casos, confirmados con la sección 15 "Consecutivos Comprobantes" como ejemplo del segundo: (1) funcionalidades exclusivas de otro país que ni siquiera aparecen como opción en la interfaz de un ambiente QA costarricense (esas correctamente no se prueban, no son gap) vs. (2) una sección que SÍ es visible/clicable en este mismo ambiente QA pero queda vacía porque el tenant configurado es de otro país — ese caso concreto sí es un gap de cobertura real que hay que documentar como tal (ver sección 15 arriba), no despacharlo como "sin importancia".

### Estado de implementación (actualizado 2026-07-08)
Propuesta original de ~26 CPs organizada en 4 bloques:
- **Bloque A (carga + navegación) — ✅ implementado**: CP-146 (carga del módulo), CP-147 (navegación entre pestañas).
- **Bloque D (hallazgos) — ✅ implementado**: CP-148 (Twilio no funcional), CP-149 (buscador no filtra).
- **Bloque B (19 secciones del acordeón Dashboard) — ✅ completo, 18/18 secciones expandibles reales** ("Consecutivos Comprobantes" no tiene CP propio porque no renderiza campos en este ambiente, pero queda registrada como gap de cobertura, no como "resuelta"/"no aplica", ver sección 15 en la lista de arriba): CP-150 (comisiones, input numérico), CP-151 (envío de facturas por correo, checkbox), CP-152 (compras externas, checkbox), CP-153 (fidelidad de clientes, checkbox), CP-154 (consecutivos comprobante fiscal — hallazgo, no guarda), CP-155 (personalizar términos y condiciones, checkbox+textarea), CP-156 (ventas de crédito, checkbox+número), CP-157 (configuración de inventario, checkbox), CP-158 (plantillas pdf, primer select probado), CP-159 (configuración ASADA, número con hallazgo de redondeo), CP-160 (dashboard, select de idioma), CP-161 (impresión de cierres de caja, checkbox), CP-162 (compras, checkbox), CP-163 (módulo de crédito para clientes, checkbox acotado — evita deliberadamente el interruptor general del módulo), CP-164 (tracking de órdenes online, checkbox principal — tabla anidada de ~23 campos "ocultar campo" sin id propio queda sin cubrir), CP-165/166/167 (configuración general de ventas, la sección de 91 campos — dividida en 3 CPs por sub-tema: facturación/stock, descuentos/roles, documento electrónico/seguridad), CP-168/169/170 (configuración del sistema POS, la sección de 57 campos — dividida en 3 CPs por sub-tema: facturación/categorías/clientes, mesas/taller/aprobaciones, pagos/productos; hallazgo documentado en CP-168 sobre `generate_automatic_customer_code` sin persistir), CP-173/174/175 (impresión de factura de ventas, la sección de 58 campos — dividida en 3 CPs por sub-tema: formato general/moneda, contenido de la factura impresa, cliente/referencias/facturación electrónica; hallazgo documentado sobre 4 campos huérfanos sin ningún control de UI, ver "Notas para el diseño de CPs" arriba). Con esto, las 3 secciones grandes de 50+ campos (91, 58, 57) quedan todas cubiertas con el mismo patrón de 3 CPs por sub-tema.
- **Campos "interruptor general" a evitar o tratar con cuidado especial — confirmado en CP-163**: algunas secciones tienen un checkbox que controla la visibilidad/activación de un módulo COMPLETO del sistema (ej. `show_credit_module_checkbox` en "Módulo de Crédito para clientes": si se apaga, el módulo deja de aparecer en el menú de Configuración). Para estos campos, preferir NO modificarlos en un CP automatizado aunque técnicamente se puedan restaurar — el riesgo de dejarlos en el estado apagado ante un fallo a mitad de camino (aunque haya recuperación de emergencia en el catch) es demasiado alto porque puede romper CPs de OTROS módulos que dependen de que ese interruptor esté encendido. En su lugar: (a) usar otro campo de la misma sección con alcance más acotado si existe, y (b) leer el interruptor general al inicio y al final del CP solo para verificar que no cambió, sin tocarlo nunca.
- **Secciones grandes tardan más en guardar y pueden exceder timeouts de herramienta — confirmado en CP-165**: la sección "Configuración general de ventas" (91 campos) tarda notablemente más en el ciclo completo (~60-80s vs ~50-60s de secciones chicas) porque el payload de guardado es mucho más grande. Un primer intento de CP-165 murió por timeout de la herramienta (90s) **después** de que el guardado ya hubiera persistido el cambio en el servidor pero **antes** de llegar al paso de restauración — dejando el sistema con los dos checkboxes de prueba invertidos respecto al estado real original. Se detectó comparando el "estado original" leído por dos corridas consecutivas (debían coincidir y no coincidían) y se corrigió manualmente antes de continuar. Lección: para secciones grandes, usar timeouts generosos (150s+) en la ejecución de la herramienta, y si un CP se corta a mitad de camino, **no asumir que el estado quedó como estaba** — releer y comparar contra el valor documentado como "original real" antes de dar por buena la siguiente corrida.
- **Campos "huérfanos" sin ningún control de UI — confirmado en la exploración de "Impresión de factura de ventas" (2026-07-10)**: 4 campos de la sección (`print_command`, `target_view_kitchen`, `print_command_after_paying`, `print_products_without_assigned_printer`, todos `type="hidden"`, hijos directos de `#dashboard_content_settings_2`) no tienen ningún checkbox/select visible asociado en el HTML — a diferencia del resto del panel, donde el patrón `<id>_hide` + `<id>` (o `<id>_checkbox`) siempre está presente. Investigado a fondo antes de descartarlos: `setting.js` (script externo, `public/js/setting.js`) SÍ contiene lógica para sincronizar 3 de los 4 (`print_command`, `print_command_after_paying`, `print_products_without_assigned_printer`) contra checkboxes `#print_command_checkbox`, `#print_command_after_paying_checkbox` y `#print_products_without_assigned_printer_checkbox` respectivamente — pero **ninguno de esos 3 checkboxes existe en ningún lugar del DOM de la página**, confirmado expandiendo las 21 secciones del acordeón completo y buscando por id en toda la página, no solo dentro de la sección 2. `target_view_kitchen` no tiene ninguna referencia literal en `setting.js` ni companion bajo los patrones de nombre probados (`_hide`, `_checkbox`) — mismo diagnóstico por asociación estructural (hijo directo del mismo contenedor, mismo tipo `hidden` sin label). Conclusión: son remanentes huérfanos de una función eliminada de la plantilla (probablemente relacionada con impresión directa de comandas/impresoras sin asignar), **no accionables desde la interfaz en absoluto** — no es una limitación de datos de este ambiente QA (como el tenant de Honduras en "Consecutivos Comprobantes") sino un gap estructural del HTML/JS actual de la aplicación. No tienen CP propio por la misma razón que Twilio (CP-148): no hay ningún elemento interactivo real con el que un CP pueda operar.
- **No todos los campos con ID "estable" son confiables para asignación directa vía JS — confirmado en CP-166**: `role_discount_<roleId>` (tabla de descuento por rol dentro de "Configuración general de ventas") tiene atributos HTML5 `min="1" max="100" step="1"`, y asignarle un valor decimal o fuera de rango (`.value = '10.0000'`) no se refleja de forma confiable — en las pruebas, la lectura inmediata tras la asignación mostró un valor distinto al asignado (ej. quedó en `"100"` en vez de `"10.0000"`, y luego intentos de fijarlo en `"0"` se leyeron como `"1"`, el mínimo permitido). Además, mientras la tabla está oculta (`limit_discount_by_role=false`) sus campos no viajan en el payload de guardado (mismo patrón que CP-154). Por estas dos razones combinadas, CP-166 **no** verifica el valor de `role_discount_1`, solo que el toggle `limit_discount_by_role` revela/oculta la tabla correctamente. Si en el futuro se quiere automatizar el valor real de esta tabla, investigar primero si el campo requiere simular eventos de teclado reales (`page.fill()`/`page.type()` en vez de asignación directa de `.value`) en lugar de asumir que el patrón estándar de esta suite (`.value = X` + `dispatchEvent`) funciona igual que en el resto del panel.
- **Bloque C (tab Tienda online) — ✅ completo, CP-176 (2026-07-14)**: explorado a fondo (6 configuraciones reales de 11 elementos detectados), cubierto con 1 solo CP dado su tamaño real (no 58/91/57 como las secciones grandes del Dashboard). CP-176 documenta el hallazgo de que el botón "Guardar cambios" (`#save_settings_store`) no es funcional en este entorno (ver hallazgo dedicado arriba, mismo patrón que CP-148/Twilio) — no se pudo diseñar un CP de "editar y guardar" exitoso porque el guardado mismo está roto. Fuera de alcance, documentados como gaps: `currency_select` (widget dual-listbox), `file_header`/`file_footer` (carga de archivos). Hallazgo adicional de alta prioridad (posible integridad de datos entre compañías) en `#company_store_online_select`, ver sección dedicada arriba.

### 🎉 Panel de Control — 100% completo (2026-07-14)
Los 4 bloques de la propuesta original quedan cubiertos: **Bloque A** (carga/navegación, CP-146/147), **Bloque B** (18/18 secciones del acordeón Dashboard, CP-150 a CP-175, con el gap documentado de "Consecutivos Comprobantes" por tenant de Honduras no disponible), **Bloque C** (tab Tienda online, CP-176), **Bloque D** (hallazgos iniciales, CP-148/149). Total: CP-146 a CP-176 (30 CPs), más 2 hallazgos de alta prioridad documentados sin CP propio (botón de guardado no funcional en Tienda online, y posible integridad de datos en el selector de compañía de Tienda online) que ameritan seguimiento por el equipo de desarrollo.

## 20. End. Pintura (exploración 2026-07-09/10, sin CPs aún)

Wizard dentro del POS para armar un servicio de enderezado y pintura pieza por pieza (vehículo → parte → pieza → servicio → carrito), no cubierto por la suite hasta ahora. Explorado en vivo vía `abrirContextoConSesion` + navegación directa al POS.

### Ubicación y cómo llegar
- URL: la misma del POS (`${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`).
- Junto a las pestañas "Productos" y "Servicios" del POS hay una tercera pestaña, tab id **`#ck_view_straightening_and_paint`** ("End. Pintura"). Click directo en ese id (`document.getElementById('ck_view_straightening_and_paint')?.click()`) abre la vista de 3 columnas: **Vehículo** (con la lista de partes debajo, una vez elegido el tipo) | **Piezas** | **Servicios**.
- Igual que en otros módulos POS, puede aparecer el popup "Activa las notificaciones del navegador" (`#workshop-web-notification-permission-dismiss` para cerrarlo) — mismo patrón ya documentado, no es nada nuevo de este wizard.

### Paso 1 — Tipo de vehículo: sí es un widget Chosen, con una particularidad de interacción
- `#select_type_vehicle_chosen` es el contenedor visual Chosen que envuelve el `<select id="select_type_vehicle">` real (oculto). Opciones confirmadas: Hatchback, Crossover, Minivan, SUV, Automóvil, Pick-up.
- **Confirmado el patrón esperado por el usuario, con un matiz más específico**: hay que abrir el widget con `page.click('#select_type_vehicle_chosen')` y luego click en el `<li>` visible dentro de `.chosen-results` (`page.click('#select_type_vehicle_chosen .chosen-results li:has-text("SUV")')`). **Un click sintético disparado vía `page.evaluate()` (`elemento.click()` en JS) sobre el `<li>` NO selecciona la opción** (el valor del `<select>` se queda en el placeholder) — hace falta un click real de Playwright (`page.click(...)`) sobre el `<li>`, igual que para forzar el DOM de otros Chosen del proyecto, pero aquí el click sintético directamente no funciona en absoluto (no es solo un tema de que falte disparar `chosen:updated`).
- Al seleccionar el vehículo, debajo del selector aparece la lista de partes (tarjetas con imagen) — no hace falta ningún paso intermedio.

### Paso 2 — Partes: 14 tarjetas fijas, independientes del tipo de vehículo elegido
Cada tarjeta tiene un `onclick="getPiecesByPart(<partId>)"` en un ancestro de la tarjeta (no en el nodo de texto). Las 14 partes son siempre las mismas sin importar el vehículo elegido: **Parte frontal** (5642), **Parte trasera** (5643), **Puerta Del Izq** (5644), **Puerta Del Der** (5645), **Puerta Tras Izq** (5646), **Puerta Tras Der** (5647), **Costado Izq** (5648), **Costado Der** (5649), **Parte Superior** (5650), **Frente** (5758), **Laterales** (5759), **Techo** (5760), **Trasera** (5761), **Ruedas / frenos** (5762).

**⚠️ HALLAZGO — dos catálogos de partes conviven, y solo uno tiene servicios configurados**: las primeras 9 partes (Parte frontal, Parte trasera, Puertas, Costados, Parte Superior — el catálogo "viejo", con nombres de pieza en mayúsculas tipo "BUMPER DEL") **no tienen ningún servicio activo configurado en este ambiente QA**, sin importar la pieza elegida (probado con 20+ piezas distintas bajo Parte frontal/trasera/puertas/costados en los 6 tipos de vehículo). Las últimas 5 partes (Frente, Laterales, Techo, Trasera, Ruedas/frenos — catálogo "nuevo", nombres de pieza en formato oración tipo "Absorbedor de impacto delantero") **sí tienen servicios reales configurados con precios registrados**. Para cualquier CP de camino feliz, usar exclusivamente partes del catálogo nuevo (Frente/Laterales/Techo/Trasera/Ruedas-frenos); para el CP de "sin servicios disponibles", usar cualquier pieza del catálogo viejo (ver más abajo).

### Paso 3 — Piezas: lista buscable, poblada por `getPiecesByPart`
Cada pieza es un elemento con `onclick="getPiecesByPart(<pieceId>)"` — mismo patrón de "buscar ancestro con onclick real" que las partes. Bajo "Frente" (partId 5758) hay ~48 piezas (Absorbedor de impacto delantero, Bumper delantero, Parabrisas, Farol principal derecho/izquierdo, etc.).

### Paso 4 — Servicios: estructura real del DOM (importante para selectores)
Al hacer click en una pieza del catálogo nuevo, la columna "Servicios" se puebla con una lista de servicios reales (ej. para "Absorbedor de impacto delantero": Desmontar y montar, Sustituir, Pintar, Pintado completo, Pintado parcial, Pintado por desgaste, Pulir, Lavar y acondicionar, Lijado y alisado, Enderezar — 10 servicios típicos por pieza).

Cada servicio es un `<div>` con `onclick="prepare_service_before_add_item_to_table(<itemId>, <serviceId>, <pieceId>, <partId>, <priceId>)"` — **este es el selector correcto para "agregar servicio al carrito"**. Ojo con dos trampas del DOM:
- El **mismo `onclick`** aparece duplicado en 2 nodos distintos (el div del nombre del servicio y un div hijo con el precio, `div_price_...`) — si se cuentan elementos por `[onclick^="prepare_service_before_add_item_to_table"]` hay que deduplicar por el string del `onclick`, si no el conteo sale el doble.
- Cada servicio también tiene un botón **"Nuevo precio"** con `onclick="openModalNewPriceForServicePos(...)"` — es una función administrativa para **registrar** un nuevo precio para ese servicio (no para agregarlo al carrito). No confundir con el flujo de selección: no debe clickearse en un CP de "camino feliz".
- Hay además un botón "Buscar" (`onclick="searchServices()"`) y un link de "Ayuda" (`onclick="toggleHelp(...)"`) dentro de la misma columna — excluirlos de cualquier selector genérico de "servicios".

### Paso 5 — ⚠️ HALLAZGO principal: el camino de "modal de precio" NO se pudo reproducir en este ambiente QA
El usuario pidió confirmar si tras elegir un servicio el sistema (a) agrega directo al carrito o (b) abre un modal "Selecciona un precio" cuando hay varias opciones de precio. Se probó con **3 servicios distintos en 2 piezas distintas** ("Desmontar y montar" y "Sustituir" en "Absorbedor de impacto delantero"; "Desmontar y montar" en "Bumper delantero"):

- **En los 3 casos el resultado fue el mismo: agregado directo al carrito, sin modal**, confirmado leyendo el total visible del carrito antes/después del click (ej. ₡0 → ₡20,340.00 → ₡51,980.00 → ₡108,480.00, sumando correctamente cada precio agregado).
- **Causa**: en los datos de este ambiente QA, **cada servicio tiene exactamente un único precio registrado** ("1 ₡X.XX" — el "1" es la cantidad de precios registrados, no una cantidad de producto). El modal "Selecciona un precio" existe en el código (aparece un botón "Nuevo precio" que registraría un precio adicional para el mismo servicio, lo que en teoría generaría el escenario de 2+ precios), pero **no se encontró organicamente ningún servicio con 2+ precios ya registrados** tras revisar 4 piezas del catálogo nuevo. No se intentó forzar el escenario usando "Nuevo precio" porque implicaría mutar datos de catálogo compartidos con otros CPs/usuarios de QA, algo que se prefiere confirmar con el usuario antes de hacer.
- **Selector correcto para verificar "agregado al carrito"**: tabla `#tb_table_buy_list` (mismo selector ya usado en CP-033) + total visible vía el label "TOTAL:" seguido del monto (`Array.from(document.querySelectorAll('*')).find(el => /^TOTAL:$/i.test(el.textContent.trim()))`, luego `.nextElementSibling.textContent`). **No** usar selectores genéricos tipo `.cart-item` o `[class*="cart"]` — no existen en esta pantalla y devuelven falsos negativos (conteo en 0 aunque el carrito sí creció).

### Paso "sin servicios disponibles" — comportamiento confirmado, sin timeout genérico
Al elegir una pieza del catálogo viejo (ej. "BUMPER DEL" bajo "Parte frontal"), la columna Servicios muestra un estado vacío claro: placeholder **"Sin servicios"** junto a un botón "Agregar servicio", y aparece un **toast/tooltip con el texto "No hay servicios activos"**. No hay timeout ni cuelgue — el estado vacío es inmediato y detectable por texto. Buen candidato para un CP de "camino sin resultados" sin necesidad de `waitForTimeout()` ni reintentos.

### Estado de implementación — ✅ completo (2026-07-10)
Ubicados en `tests-playwright/01-facturar/11-end-pintura/`, carpeta nueva sugerida por el usuario:
- **CP-171** — camino feliz completo: SUV → Frente → Absorbedor de impacto delantero → Desmontar y montar, con `Promise.race()` entre "carrito creció" y "modal de precio" (en este ambiente siempre resuelve la primera rama). Verifica `#tb_table_buy_list` + total exacto.
- **CP-172** — camino sin servicios disponibles: SUV → Parte frontal (catálogo viejo) → BUMPER DEL, verifica el mensaje "Sin servicios" y el toast "No hay servicios activos" sin timeout genérico.

El camino del modal "Selecciona un precio" queda sin CP propio porque no se pudo reproducir organicamente en este ambiente QA (ver hallazgo del Paso 5 arriba) — decisión confirmada con el usuario en vez de forzarlo mutando datos de catálogo con "Nuevo precio".

---

## 21. Productos Externos (exploración y cobertura 2026-07-19, CP-177 en adelante)

Explorado en vivo vía `abrirContextoConSesion` + navegación directa al POS. Módulo con 0% de cobertura confirmado antes de empezar (no había ningún CP ni referencia a "Producto externo"/"Productos Externos" en la suite, salvo una mención de paso en la sección 15 sobre el menú `#demo-menu-lower-left`).

### Ubicación y acceso
- Vive dentro del **mismo menú de 3 puntos inferior izquierdo del carrito del POS** (`#demo-menu-lower-left`, distinto del `#demo-menu-top-right` que tiene Cotización/Orden de ruteo/Apartado/Enviar a caja — ver sección 15). Ese menú tiene 6 ítems: **`switch_compress`** ("Expandir/Encoger"), **`add_sc_product`** ("Producto externo", `onclick="add_product_sc()"`), `print_invoice` ("Historial de Facturas"), `view_proform` ("Historial de Proformas"), `show_pos_permissions_modal` ("Permisos del POS"), `open_invoice_setting_modal_pos` ("Configuración de Facturas").
- Click en "Producto externo" abre el modal `#dialog_add_sc_product_1`, título "AGREGAR PRODUCTO EXTERNO".

### Modal "AGREGAR PRODUCTO EXTERNO" — campos reales
- `#product_sc_company_select` — fijo a la compañía de la sesión activa (TALLER ALPHA PREMIUM, id 20); cambiarlo sería una acción cross-compañía fuera de alcance (mismo criterio que el hallazgo de `#company_store_online_select` en sección 19) — no se tocó en ningún CP.
- `#product_sc_name_preview` (texto, placeholder "Nombre del producto") — **cosmético únicamente**: el nombre que termina mostrándose en la fila del carrito es el del "Grupo de productos" seleccionado, no este campo. No se encontró ningún efecto observable de este campo más allá de la vista previa dentro del propio modal.
- `#product_sc_real_code` (texto, requerido) — "Código Real (inventario)".
- `#product_sc_code` (select, "Grupo de productos") — **en este ambiente QA solo existe UNA opción real**: "PRUEBAS BRENES PRUEBAS BRENES" (value `4030`), además del placeholder. Botón `#btn_show_add_product_sc_code` (+) permite crear un grupo nuevo — **deliberadamente no ejercitado**, mutaría el catálogo compartido de grupos de productos.
- `#product_sc_seller` (select, "Vendedor Responsable") — 4 opciones reales: Drinjol (249), Jorvendedor (335), USUARIO VENDEDOR (324), vendedor valentina (305). Las 4 se usaron, una por cada CP-177 a CP-180.
- `#product_sc_provider` (select, "Proveedor") — catálogo de proveedores reales de la compañía. Alternativa mutuamente excluyente: `#product_sc_another_provider` (texto libre, "Otro Proveedor"). Botón-lápiz `btn_show_add_product_sc_code_edit` (`show_quick_add_form_cabys_code_pe(1)`) abre edición del código CABYS — **deliberadamente no ejercitado**, es una acción administrativa de catálogo (mismo criterio que "Nuevo precio" en End. Pintura, sección 20).
- `#product_sc_cost` (número, "Costo") y `#product_sc_utility` (número, "Utilidad %") — alimentan un cálculo automático de Precio/Total vía `get_product_sc_price()` (atado al evento `change` del checkbox `#product_sc_tax_checkbox`).
- `#product_sc_tax_checkbox` ("¿Aplica Impuesto?") + botón "+" (`ext_product_add_tax_list_select_input(0,0)`) que agrega una fila con dos `<select>`: tipo de impuesto (`ext_product_add_product_tax_list_N`, ej. "01 Impuesto al valor agregado") y tarifa (`ext_product_add_product_tax_rate_list_N`, ej. "08 - 13.00% - Tarifa General 13%"). **Impuesto es obligatorio para guardar** (el intento de guardar sin esto muestra el noty "¡Seleccione al menos un impuesto con su tarifa correspondiente!").
- `#product_sc_quantity`, `#product_sc_price`, `#product_sc_total` (números, requeridos).
- `#product_sc_warranty_checkbox` ("¿Aplica Garantía?") revela `#product_sc_warranty_days` ("Días de garantía").
- `#product_sc_comment` (textarea, "Observaciones").
- Botón "Guardar" (`#save_external_product`, delega a `add_product_external_validation()`) y "Cerrar" (descarta el borrador sin guardar y cierra el modal — confirmado en CP-180).
- Toggle "Ayuda" (`toggleHelp()`) — control secundario, ejercitado por completitud en CP-177.

### ⚠️ HALLAZGO 1 — Gate de aprobación de administrador con Utilidad &lt; 25% (confirmado en CP-178)
Si `product_sc_utility` es menor a 25%, `add_product_external_validation()` no muestra el SweetAlert normal de confirmación sino un modal aparte, `#dialog_approve_product_external_utility`: *"Aprobación de utilidad — La utilidad aplicada a la compra no debe de ser menor a 25.0000%. Para continuar es necesaria la aprobación de un administrador."*, con un `<select>` "Seleccionar administrador" + campo "Contraseña" + botones "Aplicar"/"Cancelar". CP-178 confirma que el gate aparece con utilidad 10%, **no intenta bypasearlo** (requeriría credenciales reales de un usuario administrador, fuera de alcance de esta suite QA) y lo cancela, luego corrige la utilidad a 35% para continuar por el camino normal.

### 🔴 HALLAZGO 2 (CRÍTICO, confirmado en vivo antes de escribir ningún CP) — El total del carrito queda corrupto al agregar un Producto Externo
Con Costo + Utilidad% ≥25 + un impuesto/tarifa seleccionados, el modal calcula correctamente Precio/Total (ej. Costo ₡442.48 + Utilidad 30% + IVA 13% = ₡650.00 exactos, verificado leyendo `#product_sc_price`/`#product_sc_total` **antes** de guardar). Al confirmar con el botón real "Agregar" del SweetAlert *"¡Agregar producto externo! ¿Está seguro que desea continuar?"* (mismo botón que usaría un usuario real, no un click sintético), **el monto que efectivamente queda en el carrito no tiene relación con ese cálculo** — se observaron montos como `$46,924,500,443.40`, `$61,001,850,578.30` y `$63,348,075,598.83` en corridas independientes, junto con un renglón interno de "Utilidad: 45177.78%" también sin sentido.

- **Reproducido de forma limpia dos veces** en una corrida de un solo paso (sin re-disparar eventos duplicados), y luego reproducido consistentemente en los 6 CPs de este bloque (CP-177 a CP-182) — no es un artefacto del script de exploración.
- El grupo de productos usado ("PRUEBAS BRENES", id 4030) devolvió el **mismo monto exacto** (`$61,001,850,578.30`) en corridas separadas realizadas en momentos distintos (exploración inicial y luego CP-177), lo que sugiere que el registro de ese producto en el catálogo de QA quedó con datos de costo/precio corruptos de forma persistente en el servidor tras las pruebas de esta exploración, no que el cálculo varíe cada vez. **Posible efecto secundario de esta misma exploración sobre datos compartidos de QA** — recomendado que el equipo de desarrollo revise/resetee el producto "PRUEBAS BRENES" (grupo id 4030) en la base de datos de este ambiente.
- **Decisión confirmada con el usuario (2026-07-19)**: dado que facturar (confirmar el pago) con este monto corrupto dejaría una factura o saldo por cobrar absurdo persistido en el ambiente compartido (y posiblemente un envío a Hacienda con ese monto en el caso de Factura/Tiquete Electrónico), **ninguno de los 6 CPs de este bloque confirma el pago final** (`make_payment`/"Enviar a caja"). Cada CP llega hasta abrir el modal de pago (o hasta activar el modo crédito, en el caso de CP-181), documenta el hallazgo explícitamente en su salida de consola, y luego cierra el modal y vacía el carrito (`#cancel_sale` + confirmar "Limpiar lista") para no dejar el POS en un estado sucio para la siguiente sesión/CP.
- Esto no se investigó más a fondo (ej. probar si dejar Costo/Utilidad vacíos y solo llenar Precio/Total manualmente evita el problema) porque el usuario optó explícitamente por "documentar y no completar el pago" en vez de "investigar más". Queda como posible trabajo futuro si se decide continuar la investigación de causa raíz.

### Estado de implementación — ✅ completo hasta el punto seguro (2026-07-19)
Ubicados en `tests-playwright/01-facturar/12-productos-externos/`, carpeta nueva creada para este módulo (numeración `12-`, siguiente después de `11-end-pintura`):
- **CP-177** — cliente existente (ID 12735) + producto rápido (fallback a catálogo si CABYS es inestable, mismo hallazgo que CP-051). Cubre proveedor vía `<select>`, toggle de Ayuda.
- **CP-178** — producto rápido + descuento general (10%), sin cliente. Demuestra y cancela el gate de aprobación de utilidad (Hallazgo 1). Cubre "Otro Proveedor" (texto libre) e Impuesto Selectivo de Consumo.
- **CP-179** — cliente existente + producto rápido + descuento general (12%) + exoneración (patrón CP-071). Cubre proveedor vía `<select>` (otro id), garantía (checkbox + días) y observaciones.
- **CP-180** — vista expandida/encogida (`switch_compress`, revertida al terminar) + producto externo (demuestra el botón "Cerrar" descartando un borrador antes de completar el real) + cliente existente + producto normal de catálogo + producto rápido + descuento general (8%).
- **CP-181** — cliente existente + producto rápido + activar modo crédito (`ck_is_payment_credit` + `switch_payment_type(2)`, patrón CP-074/CP-081): valida checkbox y fecha de vencimiento, sin confirmar el pago a crédito.
- **CP-182** — cliente asociado solo por nombre (patrón CP-034) + producto rápido.

Los 6 CPs pasan (exit code 0) documentando el Hallazgo 2 como resultado (⚠️), no como fallo — mismo criterio que CP-071/CP-118/CP-176 para hallazgos confirmados de la aplicación, no del script. Ningún CP confirma el pago final; todos dejan el carrito vacío al terminar.

---

## 22. 🔴 HALLAZGO CRÍTICO — Corrupción generalizada de montos en el carrito del POS (detectado 2026-07-19, bloque "Retomar Proforma" PAUSADO)

**Contexto**: se inició la cobertura del gap "retomar una proforma existente desde el historial y facturarla" (mayor gap de AUDITORIA-FLUJOS-2026-07-15.md — nota: este archivo de auditoría no existe en el repositorio en el momento de escribir esto, referenciado solo por el usuario). Antes de escribir ningún CP, se exploró en vivo el mecanismo de "retomar" y luego, durante la exploración de flujos adicionales (catálogo de Servicios, verificación de montos), se detectó un problema mucho más grave y de alcance más amplio que bloqueó todo el bloque.

### Mecanismo de "retomar proforma" — SÍ confirmado y funcional
- En el historial de proformas (`/proform/printPosProform`), cada fila (`div.receip_item`, `onclick="get_receip_detail(ID)"`) abre un panel de detalle lateral con botones: "Eliminar proforma" (`confirm_proform(ID)`), **"Facturar"** (`<a id="print_proform_btn" href=".../pos/pointOfSale?company_pos=20&proform_id=ID&pos_type_option&pos_type_option=5&customer_id=0">`), "Imprimir"/"PDF" (`downloadProformPdf`), "Enviar email" (`send_invoice_email`), "Imágenes" (`get_image_collection`).
- Click real en "Facturar" navega al POS con el query param `proform_id`, que carga los ítems de esa proforma directamente en `#tb_table_buy_list` — confirmado que esto SÍ es el mecanismo real para "retomar" una proforma, distinto de crear una nueva.
- Verificado una vez con una proforma real preexistente ("1800 ANEJO TEQUILA 750ML"): el total cargado en el POS (₡915.30) coincidió exactamente con el total mostrado en el detalle de la proforma — la carga fue correcta en ese momento.
- El campo `customer_proform_select` del modal "Crear Proforma" (usado para preparar proformas de prueba) es un `<input type="text">` **plano, sin autocompletado/selectize real** (a pesar de que otros campos similares como `#email_tags` sí usan selectize) — basta con llenarlo con cualquier texto no vacío para que `validate_proform()` lo acepte y dispare `confirm_create_proform()` (SweetAlert "¿Está seguro de crear esta proforma?" → botón "Aceptar"). Asociar un cliente real vía `selectCustomerToPos()` en el carrito ANTES de abrir el modal **no** propaga ese cliente a este campo (queda vacío) — para crear una proforma con cliente real hay que investigar más a fondo cómo populas este campo con un ID válido en vez de solo texto libre (no resuelto, bloqueado por el hallazgo de abajo antes de continuar).
- Hallazgo secundario (menor): `validate_proform()` con `customer_proform_select` vacío falla **completamente en silencio** (no muestra ningún `noty`/mensaje de error al usuario, solo agrega una clase CSS `error` al campo) — el usuario no tiene forma de saber por qué "Crear Proforma" no hizo nada. Mismo patrón de "fallo silencioso" ya visto en Productos Externos (Costo/Utilidad vacíos).

### 🔴 El hallazgo que detuvo el bloque — montos absurdos en prácticamente cualquier producto, empeorando en vivo
Al explorar el catálogo de "Servicios" del POS (`#ck_view_services`, alternativa a `#ck_view_products`) para cubrir el flujo 3 ("producto normal+rápido+fraccionado+servicio"), se encontraron montos absurdos ya en el propio listado del catálogo (ej. "CAMBIO DE FAJAS ... $468,436,640.33 2260.00" — dos cifras en la misma línea). Se verificó agregando servicios reales al carrito:
- "Lavado exterior rápido" → total de carrito **$1,794,439,822.41**
- "CAMBIO DE FILTROS" → **$234,218,319.39**

Para descartar que fuera un problema exclusivo de Servicios, se probó con productos de catálogo ya usados como base "conocida y confiable" en decenas de CPs congelados de esta suite, en un carrito recién cargado y limpio (`refrescarConCacheLimpia` + verificado 0 filas antes de agregar):
- **AAA-Multímetro Automotriz Digital** (usado en CP-058, CP-074, CP-081, CP-118, CP-177 y muchos más) → **$20,727,286.09** (probado cambiando el selector de moneda de USD a Colones: sigue corrupto, **₡20,651,572.47** — descarta que sea un problema de formato/tipo de cambio en la UI, es el cálculo mismo)
- AAA-Bombillos / luces halógenas → ₡30,977,357.04
- AAA-Filtros de combustible → ₡11,551,456,440.22
- AA-Maletero (fraccionado) → **₡0.00** (falla en la dirección opuesta — monto en cero en vez de inflado)
- La proforma de "1800 ANEJO TEQUILA 750ML", que **minutos antes** en esta misma sesión de exploración había cargado correctamente (₡915.30), al volver a retomarla mostró **₡189,023,832.66** — es decir, el mismo dato que antes era correcto **se corrompió durante la propia sesión de exploración**, no es un dato ya corrupto de antemano.

**Por qué esto es más grave que el hallazgo de Productos Externos (sección 21)**: aquello estaba acotado a un producto de catálogo específico ("PRUEBAS BRENES"/grupo 4030) usado solo por esa funcionalidad. Esto afecta productos de uso **transversal** en toda la suite (AAA-Multímetro, AAA-Bombillos, AAA-Filtros son la base de docenas de CPs ya congelados en 01-pos-basico, 02-pos-avanzado, 03-factura-credito, etc.), y el patrón temporal (un dato correcto que se corrompe minutos después, en la misma sesión, sin que este agente haya tocado ese producto específico) sugiere una causa activa/en curso en el ambiente compartido — posiblemente relacionada con alguna configuración de listas de precio, tipo de cambio, o "Configuración general de ventas" (Panel de Control, sección 19), o con actividad de otra sesión concurrente sobre datos compartidos — **no confirmado, no investigado a fondo** (el usuario optó explícitamente por pausar y solo reportar, no investigar la causa raíz en este momento).

### Decisión (confirmada con el usuario, 2026-07-19)
Ante este hallazgo, el usuario optó por **"pausar todo y solo reportar el hallazgo"** — no seguir escribiendo CPs de "retomar proforma" mientras esto no esté resuelto/aclarado. Estado del bloque:
- **No se creó ningún CP nuevo** para el gap de "retomar proforma" — el bloque queda pendiente de reanudar cuando se confirme que el cálculo de montos en el POS volvió a ser confiable.
- No se modificó ningún archivo de código de la suite; solo se documenta este hallazgo.
- **Recomendación para el equipo de desarrollo**: verificar con urgencia el estado de cálculo de precios/totales en el POS de este ambiente QA antes de que se ejecute cualquier CP nuevo que dependa de montos correctos (no solo los de este bloque) — de lo contrario, cualquier factura confirmada en este momento en este ambiente podría quedar con un monto absurdo persistido, incluyendo posible envío a Hacienda con datos incorrectos en el caso de Factura/Tiquete Electrónico.
- **Antes de reanudar este bloque**: revalidar que un producto simple y conocido (ej. AAA-Multímetro) vuelva a mostrar un total razonable en un carrito limpio, y solo entonces continuar con los 10 flujos pedidos originalmente (retomar proforma directo, +rápido, taller con fraccionado/servicio, lista+crédito, descuento general, descuento individual, persistencia de descuento/exoneración sin facturar, eliminar productos y dejar uno, vista expandida, cambio de cliente — distribuidos entre los 3 tabs normal/consignación/taller).
- **Nota de numeración para la próxima sesión que retome esto**: al momento de pausar, la sesión de Ruteo tenía (sin commitear/pushear) `CP-183` a `CP-187` en `tests-playwright/01-facturar/09-ruteo-pos/` — revisar de nuevo el último CP existente en el repo (commiteado) antes de numerar, no asumir que sigue en 182.

### Seguimiento del hallazgo — verificaciones mínimas de solo lectura (2026-07-19 a 2026-07-22)
A pedido del usuario, se hicieron 2 verificaciones adicionales de solo lectura (carrito limpio, 1x AAA-Multímetro, sin confirmar pago, carrito vaciado al final) en fechas distintas para monitorear si el ambiente se corrige:
- 2026-07-19 (tarde): **₡20,651,572.47** — corrupto.
- 2026-07-22: **₡20,651,572.47** — **idéntico**, sin cambios. El hallazgo sigue activo; el bloque de "retomar proforma" continúa pausado.

### Hallazgo adicional (2026-07-22/25) — la página de login/landing cambió de diseño
Durante la sesión de la demo de defensa (sección 23), se detectó que `/log/login` dejó de ser una pantalla de login simple y ahora es una **landing page de marketing completa**: título grande de compañía (visto como "COLOMBIA", `<h1 class="ilandinge-company-title">`, no un selector real — no existe ningún `<select>`/dropdown de compañía en esa pantalla, es texto estático), panel de "Módulos del Sistema" con carrusel promocional, banners de descarga de app, y un footer corporativo completo (Servicios/Productos/Ayuda/Design Soft/dirección/redes). **Los campos técnicos `#email`, `#password`, `#loginButton` siguen existiendo con los mismos IDs** (el botón cambió su clase a `ilandinge-login-button`) — el login manual sigue funcionando con las credenciales de siempre, solo cambió el diseño visual alrededor. Confirmado explícitamente que el login sí completa y redirige a `/dash/dashboard` tras este rediseño (ver sección 23, Bloque 1 del CP-194).

### Hallazgo de performance (2026-07-25) — lentitud general sostenida en todo el ambiente
Durante la construcción del CP-194 (sección 23) se observó lentitud consistente y mucho mayor a la habitual en pasos que antes eran rápidos: carga de login+dashboard ~20-25s, guardar un cliente nuevo ~11s, cargar la Torre de Control ~11-17s, y la búsqueda del tablero mostrando literalmente el mensaje "Cargando órdenes de trabajo..." durante 5-25s antes de resolver. No se investigó la causa (fuera de alcance de esa tarea) pero se ajustaron las esperas del CP-194 para tolerarlo (`waitForFunction` esperando a que desaparezca el texto "Cargando órdenes de trabajo" en vez de un `waitForTimeout` fijo). Cualquier CP nuevo que se escriba mientras este patrón persista debería usar esperas generosas y, cuando sea posible, esperas activas sobre una condición real en vez de tiempos fijos cortos.

---

## 23. Demo de defensa de proyecto final (CP-194, 2026-07-22/25) — PLAN-PROYECTO-FINAL.md sección 3

**Contexto**: a diferencia de los demás CPs de la suite, este no es cobertura/QA nueva — es una **narrativa visual que encadena flujos ya validados** de distintos módulos, pensada para presentarse en vivo frente a un jurado universitario. Nota: `PLAN-PROYECTO-FINAL.md` no existe en el repositorio al momento de escribir esto, referenciado solo por el usuario en su instrucción.

### Diseño: 4 bloques independientes, cortables en cualquier punto
Por instrucción explícita del usuario (no se sabe cuánto tiempo dará el jurado), el script se estructuró en 4 bloques que cada uno cierra una idea completa por sí solo, controlados por una constante `BLOQUES_A_EJECUTAR` al inicio del archivo (ej. `[1, 2]`) — no hace falta tocar el resto del código para correr un subconjunto.

- **Bloque 1 — Login + Dashboard → Recepción de vehículo nuevo (✅ implementado)**: basado en CP-006/CP-007/CP-009/CP-011 (00-acceso/, 02-gestion-taller/01-recepcion-vehiculo/), pero usando el patrón moderno de sesión reutilizable (no el login manual legacy de esos CPs). Flujo real encadenado y validado en vivo:
  1. `button.add-reception-btn` → nueva recepción → campo `#vehicle_plaque` (placa nueva) → `#vr_add_vehicle_btn`.
  2. Botón "Agregar Cliente" → formulario con campos requeridos `#c_identifier`, `#c_name`, `#c_address` (textarea), `#c_whatsapp`, `#c_telefono_1` → botón **"Guardar y Salir"** (⚠️ el botón "Siguiente" de este sub-formulario NO avanza el wizard, solo cambia de tab interno PRINCIPAL↔OPCIONES AVANZADAS dentro del mismo modal "Agregar Cliente" — no confundir ambos).
  3. Selección de estilo de vehículo: tarjetas visuales (ej. "SEDAN") — el onclick real (`setVehicleStyle(ID)`) vive en el DIV interno `.card.style-vehicle`, **no** en el wrapper `.col-lg-*` que lo envuelve; hay que ubicar y clickear el nodo correcto o el click no tiene efecto.
  4. "Detalles del vehículo": `#vehicle_brand` (Chosen, ej. BMW=131) → dispara vía AJAX las opciones de `#vehicle_model` (esperar antes de leerlas) → `#vehicle_reception_branch_id` (Sucursal) → botón "Siguiente".
  5. **Hallazgo confirmado**: el wizard tiene 8 pasos más (Seleccionar servicios, Inspección, Enderezado y Pintura, Abonos, Partes del vehículo, Seleccionar fotos, Marcación de daños, Observaciones generales) que son **todos opcionales** — se puede pulsar "Siguiente" repetidamente sin llenar nada en ninguno y el wizard no bloquea, hasta llegar a "Firma del cliente" (sin firmar tampoco es obligatorio) donde aparece el botón verde **"Generar"** (texto exacto "Generar", no "Generar Orden").
  6. Clic en "Generar" → SweetAlert "¿Está seguro de generar la orden?" → botón "Generar orden" → toast "Orden generada con éxito, ya está disponible en el POS(Taller)" → se abre automáticamente un modal para compartir la orden por WhatsApp (documentos a compartir, mensaje prellenado) — el CP-194 lo **cierra con "Cancelar" sin enviar nada**, no es parte de la demo.
  7. **Deliberadamente NO se interactúa con el paso "Seleccionar servicios"** (catálogo de productos/servicios) — ver el hallazgo de montos corruptos abajo.

- **Bloque 2 — Torre de Control: la orden aparece en el tablero (✅ implementado, REDEFINIDO)**: la idea original del usuario era "la orden avanza — cambio de etapa/estado" (basado en CP-017 a CP-030), pero se investigó en vivo y **no tiene, en este ambiente, un mecanismo simple ni confiable de automatizar**:
  - El tablero (`/vehicularReception/workOrderBoard`, "Torre de Control") en este ambiente QA solo tiene **una columna/etapa activa: "RECEPCION"**. Existen "Secciones" creadas pero no asignadas como columnas reales (ej. "prueba 1", "prueba 2", y una "EN PROCESO" creada durante esta exploración) vía el "Administrador de Secciones" (botón engranaje ⚙ → "Configurar Tablero") — la relación Sección↔Columna de esa UI no quedó clara ni se pudo asignar una segunda columna de forma confiable sin arriesgar mutar configuración compartida del tablero a ciegas.
  - Las tarjetas del tablero (`.kanban-card`, con `data-card-id`/`data-order-id`/`data-status-id`) **no tienen `draggable="true"` nativo** ni un botón/menú de "cambiar etapa" — el movimiento entre columnas depende de una librería JS de drag-and-drop basada en eventos de mouse, no del atributo HTML nativo, lo que lo hace mucho más frágil de automatizar de forma confiable.
  - El ítem de menú lateral "Relacionar servicios a estados de la órden" sugiere además que el avance de etapa podría estar ligado al progreso de **servicios** de la orden — lo cual reintroduciría el catálogo de precios corrupto que se quiere evitar.
  - **Con aprobación explícita del usuario**, el Bloque 2 se redefinió a: reutilizar el buscador real del tablero (mismo mecanismo que **CP-018** "buscar-orden-tablero", `#repair_order_search` + Enter) para localizar por nombre de cliente la orden recién creada en el Bloque 1, y mostrar su tarjeta completa (placa, marca, modelo, año, cliente, total). Esto demuestra que la orden ya vive en el sistema de gestión de taller, sin depender del drag-and-drop ni de servicios/precios.
  - **Hallazgo de performance confirmado durante esta validación**: la búsqueda del tablero puede tardar bastante en resolver (mensaje "Cargando órdenes de trabajo..." visible varios segundos, hasta ~25s en las corridas de prueba) — el CP-194 espera activamente a que ese mensaje desaparezca (`waitForFunction`) en vez de usar un tiempo fijo corto, que fallaba de forma intermitente.

- **Bloque 3 — Facturación POS (⏸️ PENDIENTE, diseño acordado, sin implementar)**: retomar la orden vía el tab (F3) Taller del POS (mismo mecanismo que **CP-063**, tarjeta `.pos-order-card` + su atributo `onclick`), agregar un producto + un servicio, facturar como Factura Electrónica con pago mixto, mostrar IVA y total en consola (patrón CP-058/CP-074). **Bloqueado**: antes de escribir este bloque se hizo una verificación en vivo (ver sección 22) y el catálogo de productos/servicios seguía mostrando montos absurdos — mostrar esto en una defensa universitaria sería contraproducente. No implementar hasta que se confirme que el ambiente fue corregido (repetir la verificación mínima de solo lectura de la sección 22 antes de retomar).

- **Bloque 4 — Cierre de caja (⏸️ PENDIENTE, diseño acordado, sin implementar)**: F12 en el POS para abrir el modal de cierre (patrón CP-104/CP-107), comparar el total de ventas contra lo facturado en el Bloque 3. **Bloqueado por depender directamente del Bloque 3** — no tiene sentido implementarlo mientras ese bloque siga bloqueado por el mismo hallazgo de montos corruptos.

### Estado de implementación
Ubicado en `tests-playwright/05-demo-defensa/01-general/cp194-demo-defensa-proyecto-final.js` — carpeta nueva top-level (`05-demo-defensa/`) porque este CP cruza varios módulos existentes, siguiendo igualmente la convención de profundidad de 2 niveles bajo `tests-playwright/` (mismo patrón de 3 `../` para `auth/usar-sesion` y `config`). Validado en vivo de punta a punta en una sola sesión continua (Bloques 1→2 con `BLOQUES_A_EJECUTAR = [1, 2]`): crea cliente + vehículo BMW, genera la orden (ej. #810), y la localiza inmediatamente en el tablero con total limpio (₡0.00, sin productos/servicios). Tiempo total de la corrida combinada: ~2 minutos (con el ambiente en su estado lento de la sección 22).

---

## 24. Tab "Tienda en línea" dentro del POS (CP-196, 2026-07-25) — distinto del tab de Panel de Control

**Contexto**: CP-055 (`01-facturar/01-pos-basico/`) solo verificaba que el tab `#btn_get_virtual_order_list` del POS cargara y mostrara los textos "Órdenes pendientes"/"Órdenes aprobadas" — sin interactuar con nada real. Este tab es **distinto** del tab "Tienda online" de Panel de Control (`/sett/setting`, configuración de la tienda — moneda, colores, newsletter — cerrado en CP-176, sección 19): el de POS es una **bandeja de seguimiento de pedidos ya colocados** en la tienda en línea del taller, no configuración.

### Contenido real descubierto (no depende de montos/totales)
- El tab muestra 3 contadores reales, cada uno con su propio `onclick="show_fast_traking(N)"`: **Pendientes** (N=1), **Aprobadas** (N=2), **En camino** (N=5). Cada uno abre el mismo panel lateral deslizante **"Seguimiento"** (`.esthela`, función `getPosStoreOnlineTrackingTable(N)`), pre-filtrado por esa categoría.
- El panel "Seguimiento" tiene controles reales de gestión de pedidos:
  - Texto de ayuda inline (3 pasos: seleccionar órdenes → validar estado → "Guardar Cambios"; nota de que se envía correo/notificación push al cliente).
  - `#order_tracking_state` — dropdown (Chosen) "Cambiar estado". **Hallazgo confirmado**: las opciones **no son fijas** — son contextuales al estado de la categoría abierta (comportamiento de máquina de estados): con "Pendientes" abierto ofrece las 4 opciones (Aprobada/Rechazada/En camino/Entregado); con "Aprobadas" ofrece 3 (Rechazada/En camino/Entregado); con "En camino" ofrece solo 1 (Entregado, el único estado siguiente válido).
  - `#fast_select_all_order_tracking` — checkbox "Seleccionar todos".
  - `#btn_save_masive_tracking` (`onclick="save_tracking_order_state()"`) — acción **en lote**: guarda el nuevo estado para todas las órdenes seleccionadas y, según el propio texto de ayuda del panel, dispara correo electrónico y/o notificación push al cliente. **Deliberadamente no se invoca en el CP** — es una acción en lote que requiere confirmación explícita del usuario antes de ejecutarse (regla del proyecto desde el incidente de Ruteo, sección 15), y además tiene un efecto externo real (notificar clientes).
  - `#close_sidebar` (icono fa-times) — cierra el panel.
- **Gap de cobertura documentado (no resuelto)**: este ambiente QA no tiene ninguna orden real de tienda en línea (0 en las 3 categorías al momento de escribir esto) — no se pudo ejercer el flujo completo de principio a fin (aprobar/rechazar una orden real y confirmar que el "Guardar cambios" efectivamente cambia su estado). Ninguno de los controles ejercitados depende de calcular precios/totales, por lo que este bloque no se vio afectado por el hallazgo crítico de la sección 22.

### Estado de implementación
**CP-196** (`tests-playwright/01-facturar/01-pos-basico/`, misma carpeta que CP-055 al que reemplaza en profundidad de cobertura): abre el tab, lee los 3 contadores reales, abre el panel "Seguimiento" para las 3 categorías (confirmando que abre correctamente en cada una y documentando las opciones contextuales del dropdown en cada una), ejercita el dropdown "Cambiar estado" con las opciones reales de la última categoría abierta, ejercita el checkbox "Seleccionar todos", y cierra el panel — sin invocar nunca "Guardar cambios". Pasa documentando el hallazgo como resultado (⚠️), no como fallo, mismo criterio que otros CPs con gaps de datos de ambiente (ej. Honduras en sección 19).
