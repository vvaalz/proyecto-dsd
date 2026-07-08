---
name: crear-caso-prueba
description: Genera un nuevo caso de prueba cpNNN-descripcion.js con Playwright, sesión reutilizable y ubicado en su carpeta de módulo/submódulo correspondiente dentro de tests-playwright/. Usar cuando el usuario pida crear, agregar o automatizar un nuevo caso de prueba (CP) para TallerAlpha.
---

# Crear caso de prueba

## Cuándo usar este skill
- El usuario pide crear/agregar un CP nuevo (por número o por descripción funcional).
- Hay que automatizar un flujo que todavía no tiene caso de prueba.

No usar este skill para modificar un CP ya existente y marcado como pasando (✅) en README.md sin confirmar antes con el usuario — ver regla en CLAUDE.md.

## Pasos

1. **Aclarar con el usuario** (si no vino ya especificado en el pedido):
   - Número de CP a usar (siguiente disponible en la tabla de README.md / CLAUDE_CONTEXT.md sección 5).
   - Descripción corta del flujo a probar.
   - Módulo y submódulo real del sistema al que pertenece (ver tabla en README.md / CLAUDE_CONTEXT.md sección 2). Si el módulo/submódulo no tiene carpeta todavía, crearla siguiendo el patrón `NN-nombre-modulo/NN-nombre-submodulo` — ver sección 16 de CLAUDE_CONTEXT.md.
   - URL del módulo a probar (ver CLAUDE_CONTEXT.md sección 6 para URLs conocidas; si la pantalla es nueva, usar primero el skill `inspeccionar-modulo` para descubrir selectores).
   - Criterio de PASSED / FAILED.

2. **Ubicar el archivo en la carpeta correcta**: `tests-playwright/<modulo>/<submodulo>/cpNNN-descripcion.js`. **Nunca** generar el archivo suelto en la raíz de `tests-playwright/` — es la regla vigente desde la reorganización del 2026-07-08 (CLAUDE_CONTEXT.md sección 16). Como el archivo queda 2 niveles por debajo de `tests-playwright/` (3 niveles por debajo de la raíz del repo), todas las rutas relativas usan **3** `../`, no 1.

3. **Generar el archivo** siguiendo el patrón estándar Playwright (async/await, try/catch/finally con `browser.close()` en el finally, sesión reutilizable por defecto vía `auth/usar-sesion.js`, `refrescarConCacheLimpia` tras cada navegación):

```javascript
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const URL_MODULO = `${BASE_URL}/URL_DEL_MODULO`;

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
  const tiempoInicioCP = Date.now();

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, URL_MODULO));
    // Esperar el selector que confirma que el módulo cargó (ajustar por módulo real):
    await page.waitForSelector('SELECTOR_DE_CARGA', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    evaluarCargaPagina(Date.now() - t0, 'Carga ' + 'NOMBRE_MODULO');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('SELECTOR_DE_CARGA', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);

    // ... lógica específica del caso (localizar elementos, interactuar) ...

    // ── VALIDACIONES ──
    const v1 = true; // reemplazar por la verificación real
    console.log('\n📊 === VALIDACIONES CP-NNN ===');
    console.log('  <descripción de la validación 1>: ' + (v1 ? '✅' : '❌'));

    if (!v1) throw new Error('<razón concreta del fallo>');

    console.log('✅ CP-NNN PASSED | <resumen de resultado> | validaciones: 1/1');
    registrarResultado({ cp: 'CP-NNN', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: Date.now() - tiempoInicioCP });

  } catch (error) {
    await screenshotOnFail(page, 'cpNNN-fail');
    console.log('❌ CP-NNN FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-NNN', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cpNNN_nombre_descriptivo();
```

Notas sobre el patrón:
- `abrirContextoConSesion(browser)` reutiliza la sesión de `auth/sesion-qa.json` si tiene menos de 2 horas, o la regenera automáticamente. Es el estándar por defecto para todo CP nuevo (vigente desde CP-128) — no implementar login manual (`#email`/`#password`/`#loginButton`) salvo pedido explícito del usuario para un caso legacy.
- `refrescarConCacheLimpia(page)` limpia la caché de red vía CDP y recarga, evitando que HTML/JS cacheado de una corrida anterior interfiera con la siguiente. Se llama siempre después de `navegarAModulo` y antes de la lógica propia del caso.
- `navegarAModulo` maneja el caso de sesión expirada (redirect a `/log/login`): borra `auth/sesion-qa.json`, regenera la sesión y reintenta una sola vez antes de fallar.
- `require('../../../config')` (`BASE_URL`, y también `LOGIN_URL`/`DASHBOARD_URL`/`EMAIL`/`PASSWORD` si el caso los necesita) — **estándar desde 2026-07-08**: ningún CP nuevo debe hardcodear la URL base ni credenciales; siempre se importan de `config.js` (que a su vez lee `.env`, ver README "Variables de entorno"). Ajustar el número de `../` según la profundidad real de la carpeta del CP.
- `registrarResultado({ cp, modulo, estado, tiempoMs })` (`utils/registrar-tiempo.js`) — **estándar desde 2026-07-08 para CPs nuevos (CP-146 en adelante)**: se llama una vez al final de cada corrida, tanto en el camino de éxito como en el catch de fallo, con el tiempo total transcurrido desde el inicio del CP. Alimenta `reports/tiempos-ejecucion.json`, que se puede convertir en un reporte HTML con `node utils/generar-reporte-tiempos.js`. `moduloDesdeRuta(__dirname)` deriva el módulo/submódulo automáticamente de la ubicación del archivo — no hace falta escribirlo a mano.
- Si una acción del sistema puede disparar una llamada AJAX síncrona del lado de la app (por ejemplo, procesar un pago, cerrar caja, o cualquier "guardar"/"confirmar" contra el servidor), envolver ese `page.evaluate()` puntual con un timeout explícito en vez de dejarlo colgarse indefinidamente si el servidor no responde — ver el patrón `evaluateConTimeout` aplicado en CP-107/CP-108 (`tests-playwright/01-facturar/06-cierre-caja/`) como referencia:
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
- Screenshot en fallo (`screenshotOnFail`) usa 3 `../` porque el archivo vive 2 niveles bajo `tests-playwright/`.
- El caso **legacy** con login individual (`#email`/`#password`/`#loginButton`, sin sesión reutilizable, sin config.js, sin registrarResultado) solo aplica a CP-001–CP-127, ya congelados — no es el patrón a replicar en CPs nuevos.

4. **Ejecutar el caso individualmente** antes de darlo por terminado (regla obligatoria de CLAUDE.md):
```bash
node tests-playwright/<modulo>/<submodulo>/cpNNN-descripcion.js
```
Ajustar selectores/esperas si falla; no asumir que pasa sin haberlo corrido.

5. **Actualizar la documentación** para que no quede desincronizada:
   - Agregar la fila correspondiente en la tabla de `README.md` (sección "Casos de prueba implementados"), incluyendo la ruta completa con subcarpeta.
   - Agregar la fila correspondiente en la tabla de `CLAUDE_CONTEXT.md` sección 5, con la ruta completa (`tests-playwright/modulo/submodulo/cpNNN-....js`).
   - Si se creó una carpeta de módulo/submódulo nueva, agregarla también al árbol de la sección 2 y a la tabla del README.
   - No es necesario registrar el archivo en ningún runner: no hay descubrimiento automático de CPs de Playwright en este proyecto — cada CP se ejecuta individualmente con `node <ruta>`.

## No hacer
- No reescribir ni modificar un CP existente marcado ✅ en README.md sin confirmar primero con el usuario.
- No introducir frameworks nuevos (Mocha/Jest/Page Objects) ni helpers que cambien el patrón estándar.
- No hardcodear credenciales o URLs — siempre importarlas de `config.js` (que lee `.env`), nunca escribir el dominio/usuario/password literal en un CP nuevo.
- No omitir el `try/catch/finally` con `browser.close()` en el finally.
- No generar el archivo suelto en la raíz de `tests-playwright/` — siempre en `modulo/submodulo/`.
- No implementar login manual (patrón legacy) en un CP nuevo — usar `abrirContextoConSesion` salvo pedido explícito en contrario.
- No omitir la llamada a `registrarResultado()` (éxito y fallo) en un CP nuevo — es lo que alimenta el reporte de tiempos de ejecución.
- No dar el caso por terminado sin haberlo ejecutado al menos una vez.
