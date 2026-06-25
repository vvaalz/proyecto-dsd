---
name: crear-caso-prueba
description: Genera un nuevo caso de prueba cpNNN-descripcion.js siguiendo el patrón estándar de la suite (login, navegación, validación, try/catch/finally). Usar cuando el usuario pida crear, agregar o automatizar un nuevo caso de prueba (CP) para TallerAlpha.
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
   - URL del módulo a probar (ver CLAUDE_CONTEXT.md sección 6 para URLs conocidas; si la pantalla es nueva, usar primero el skill `inspeccionar-modulo` para descubrir selectores).
   - Criterio de PASSED / FAILED.

2. **Generar el archivo** `tests/cpNNN-descripcion.js` siguiendo el patrón estándar (snake_case en el nombre de función, async/await, try/catch/finally con `driver.quit()` en el finally):

```javascript
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cpNNN_nombre_descriptivo() {
  console.log('🔄 Ejecutando CP-NNN: <descripción corta del caso>...');

  const options = new chrome.Options();
  options.addArguments('--disable-notifications');
  options.addArguments('--window-size=1440,1200');
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

  try {
    // Login
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();
    await driver.wait(until.urlContains('dashboard'), 20000);

    // Navegar al módulo correspondiente
    await driver.get('URL_DEL_MODULO');
    await driver.sleep(3000);

    // ... lógica específica del caso (localizar elementos, interactuar) ...

    // Validación y resultado
    const condicionEsperada = true; // reemplazar por la verificación real
    if (condicionEsperada) {
      console.log('✅ CP-NNN PASSED: <razón por la que pasó>');
    } else {
      console.log('❌ CP-NNN FAILED: <razón por la que falló>');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-NNN FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cpNNN_nombre_descriptivo();
```

3. **Ejecutar el caso individualmente** antes de darlo por terminado (regla obligatoria de CLAUDE.md):
```bash
node tests/cpNNN-descripcion.js
```
Ajustar selectores/esperas si falla; no asumir que pasa sin haberlo corrido.

4. **Actualizar la documentación** para que no quede desincronizada:
   - Agregar la fila correspondiente en la tabla de `README.md` (sección "Casos de prueba implementados").
   - Agregar la fila correspondiente en la tabla de `CLAUDE_CONTEXT.md` sección 5.
   - No es necesario registrar el archivo en `runner.js`: descubre automáticamente cualquier `cpNNN-*.js`.

## No hacer
- No reescribir ni modificar un CP existente marcado ✅ en README.md sin confirmar primero con el usuario.
- No introducir frameworks nuevos (Mocha/Jest/Page Objects) ni helpers que cambien el patrón estándar.
- No hardcodear credenciales o URLs distintas a las fijas del entorno de QA.
- No omitir el `try/catch/finally` con `driver.quit()` en el finally.
- No dar el caso por terminado sin haberlo ejecutado al menos una vez.
