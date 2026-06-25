---
name: inspeccionar-modulo
description: Genera y ejecuta un script inspect-*.js para explorar selectores CSS e IDs de una pantalla nueva del sistema TallerAlpha. Usar cuando se necesite automatizar un módulo desconocido o cuando fallen los selectores de un CP existente.
---

# Inspeccionar módulo del sistema

## Cuándo usar este skill
- Antes de crear un CP para un módulo nuevo que no se ha automatizado antes
- Cuando un CP existente falla por selectores inválidos (el sistema cambió)
- Para descubrir IDs, nombres o clases CSS de elementos interactivos

## Pasos

1. **Aclarar con el usuario:**
   - ¿Qué módulo o pantalla se quiere inspeccionar?
   - ¿Cuál es la URL de esa pantalla? (ver sección 6 de CLAUDE_CONTEXT.md para URLs conocidas)

2. **Generar el script** `tests/inspect-NombreModulo.js`:

```javascript
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function inspectNombreModulo() {
  console.log('🔍 Inspeccionando: NombreModulo...');

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

    // Navegar al módulo
    await driver.get('URL_DEL_MODULO');
    await driver.sleep(3000);

    // Extraer elementos interactivos
    const elements = await driver.findElements(By.css('button, input, select, a, [id]'));
    console.log(`\n📋 Elementos encontrados: ${elements.length}`);

    for (const el of elements) {
      const tag = await el.getTagName();
      const id = await el.getAttribute('id');
      const name = await el.getAttribute('name');
      const className = await el.getAttribute('class');
      const text = await el.getText().catch(() => '');
      console.log(`  <${tag}> id="${id}" name="${name}" class="${className}" text="${text.substring(0, 50)}"`);
    }

  } finally {
    await driver.quit();
  }
}

inspectNombreModulo();
```

3. **Ejecutar el script:**
```bash
node tests/inspect-NombreModulo.js
```

4. **Analizar la salida** para identificar los selectores correctos a usar en el CP.

5. **Eliminar el script** de inspección una vez que ya no se necesite — no forma parte de la suite de pruebas.

## No hacer
- No incluir scripts `inspect-*.js` en commits permanentes salvo que sean útiles como referencia.
- No usar este script como caso de prueba — es solo una herramienta de exploración.
