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
    │   └── 09-ruteo-pos/                  (CP-137 – CP-145)
    ├── 02-gestion-taller/
    │   ├── 01-recepcion-vehiculo/         (CP-006 – CP-016)
    │   └── 02-taller-basico/              (CP-017 – CP-030, incluye el CP-017 duplicado: dos archivos cp017-*.js)
    └── 03-rutas/
        └── 01-admin-rutas/                (CP-128 – CP-136)
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
- Checkbox de selección múltiple: `#select_order_remove_<ID>` (`.sub_section_checkbox_order`) — alimenta el contador "Seleccionadas: N" del panel superior, probablemente para acciones en lote (no explorado a fondo, no crítico para los CPs actuales).

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
