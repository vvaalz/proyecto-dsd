const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const path = require('path');

async function tomarScreenshot(driver, nombre) {
  try {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${nombre}-${Date.now()}.png`);
    const data = await driver.takeScreenshot();
    fs.writeFileSync(file, data, 'base64');
    console.log('📸 Screenshot guardado en: ' + file);
  } catch (screenshotError) {
    console.log('⚠️ No se pudo guardar el screenshot: ' + screenshotError.message);
  }
}

// Umbrales de performance acordados: carga de página <3000ms ✅, 3000-8000ms
// ⚠️, >8000ms ❌. Una carga >8000ms se documenta como hallazgo de performance
// (no corta la prueba) para no perder la cobertura funcional de tabs/opciones/
// guardado — decisión explícita del usuario tras ver que esta página falla
// el umbral de forma reproducible (12-18s en 2/2 corridas).
function evaluarCargaPagina(ms, etiqueta) {
  if (ms > 8000) {
    console.log(`❌ PERFORMANCE FAILED (hallazgo, no corta la prueba): ${etiqueta} tardó ${ms}ms`);
    return false;
  }
  if (ms > 3000) {
    console.log(`⚠️ LENTO: ${etiqueta} tardó ${ms}ms`);
  } else {
    console.log(`⏱ ${etiqueta}: ${ms}ms`);
  }
  return true;
}

function evaluarAccion(ms, etiqueta) {
  if (ms > 4000) {
    console.log(`❌ Acción lenta: ${etiqueta} tardó ${ms}ms`);
  } else if (ms > 1500) {
    console.log(`⚠️ Acción algo lenta: ${etiqueta} tardó ${ms}ms`);
  } else {
    console.log(`⏱ ${etiqueta}: ${ms}ms`);
  }
}

async function cp072_planillas_factura_configuracion() {
  console.log('🔄 Ejecutando CP-072: Verificar planillas de factura en Configuración...');

  const options = new chrome.Options();
  options.addArguments('--disable-notifications');
  options.addArguments('--window-size=1440,1200');
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  const tiempoInicioCP = Date.now();
  const tiempos = {};

  try {
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.manage().deleteAllCookies();
    await driver.executeScript('window.localStorage.clear();');
    await driver.executeScript('window.sessionStorage.clear();');
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();
    await driver.wait(until.urlContains('dashboard'), 20000);

    // Configuración → Admin. factura → tab "Factura" (URL directa, equivalente
    // al menú "Configuración" del sidebar > Facturación Electrónica > Plantillas).
    const urlSettings = 'https://dev.designsoftcr.com/qa_talleralpha/public/invoiceSetting/invoiceSetting';
    const inicioCarga = Date.now();
    await driver.get(urlSettings);
    await driver.wait(until.elementLocated(By.id('step_invoice')), 20000);
    tiempos.cargaModulo = Date.now() - inicioCarga;
    const cargaDentroDeUmbral = evaluarCargaPagina(tiempos.cargaModulo, `Carga ${urlSettings}`);
    if (!cargaDentroDeUmbral) {
      await tomarScreenshot(driver, 'cp072-hallazgo-performance-carga');
    }
    await driver.sleep(1500);

    const tabFacturaActivaPorDefecto = await driver.executeScript(`
      return document.getElementById('step_invoice').className.includes('active');
    `);
    if (!tabFacturaActivaPorDefecto) {
      console.log('❌ CP-072 FAILED: El tab "Factura" no está activo por defecto al entrar a Admin. factura');
      await tomarScreenshot(driver, 'cp072-fail-tab-factura-no-activo');
      process.exit(1);
    }
    console.log('✔ Tab "Factura" activo por defecto');

    // Recorrer los 3 tabs (Factura / Proforma / Ticket) y verificar que cada
    // uno responde (se marca "active" al hacer clic, y los demás lo pierden).
    const tabsAVerificar = [
      { id: 'step_proform', nombre: 'Proforma' },
      { id: 'step_ticket', nombre: 'Ticket' },
      { id: 'step_invoice', nombre: 'Factura' },
    ];
    for (const tab of tabsAVerificar) {
      const inicioAccion = Date.now();
      await driver.executeScript(`
        const li = document.getElementById('${tab.id}');
        const a = li.querySelector('a') || li;
        a.click();
      `);
      await driver.sleep(700);
      const tiempoAccion = Date.now() - inicioAccion;
      evaluarAccion(tiempoAccion, `Cambiar a tab "${tab.nombre}"`);

      const quedoActivo = await driver.executeScript(`return document.getElementById('${tab.id}').className.includes('active');`);
      if (!quedoActivo) {
        console.log(`❌ CP-072 FAILED: El tab "${tab.nombre}" no respondió al hacer clic (no quedó activo)`);
        await tomarScreenshot(driver, 'cp072-fail-tab-' + tab.id);
        process.exit(1);
      }
      console.log(`✔ Tab "${tab.nombre}" responde correctamente al hacer clic`);
    }

    // Recorrer cada botón numerado de inserción de campos en la plantilla de
    // Factura (placeholders 1-38, con saltos en la numeración: 11,12,20,34
    // no existen en este catálogo) y confirmar que cada uno es clickeable sin
    // generar errores de JS no controlados.
    const inicioRecorrido = Date.now();
    const botonesNumerados = await driver.executeScript(`
      const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; };
      return Array.from(document.querySelectorAll('.btn_element_number_config_panel')).filter(isVisible).map((b, i) => i);
    `);
    console.log(`📋 Opciones de plantilla encontradas en tab "Factura": ${botonesNumerados.length}`);
    if (botonesNumerados.length === 0) {
      console.log('❌ CP-072 FAILED: No se encontraron opciones de plantilla (botones numerados) en el tab "Factura"');
      await tomarScreenshot(driver, 'cp072-fail-sin-opciones');
      process.exit(1);
    }

    let erroresAlRecorrer = 0;
    for (let i = 0; i < botonesNumerados.length; i++) {
      const ok = await driver.executeScript(`
        const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; };
        const btns = Array.from(document.querySelectorAll('.btn_element_number_config_panel')).filter(isVisible);
        const btn = btns[${i}];
        if (!btn) return false;
        try { btn.click(); return true; } catch (e) { return false; }
      `);
      if (!ok) erroresAlRecorrer++;
    }
    const tiempoRecorrido = Date.now() - inicioRecorrido;
    tiempos.recorrerOpciones = tiempoRecorrido;
    evaluarAccion(tiempoRecorrido, `Recorrer las ${botonesNumerados.length} opciones de plantilla`);

    if (erroresAlRecorrer > 0) {
      console.log(`❌ CP-072 FAILED: ${erroresAlRecorrer} de ${botonesNumerados.length} opciones de plantilla no respondieron al clic`);
      await tomarScreenshot(driver, 'cp072-fail-opciones-no-responden');
      process.exit(1);
    }
    console.log(`✔ Las ${botonesNumerados.length} opciones de plantilla respondieron al clic sin errores`);

    // Guardar los cambios y verificar que el sistema confirma el guardado
    // ("Verificar que los cambios se reflejan correctamente").
    const inicioGuardar = Date.now();
    await driver.executeScript(`document.getElementById('save_settings_invoice').click();`);
    const guardadoConfirmado = await driver.wait(async () => {
      const noty = await driver.executeScript(`
        const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; };
        const el = Array.from(document.querySelectorAll('.noty_text')).filter(isVisible)[0];
        return el ? el.textContent.trim() : null;
      `);
      return noty;
    }, 10000, 'No se mostró confirmación de guardado').catch(() => null);
    const tiempoGuardar = Date.now() - inicioGuardar;
    tiempos.guardarCambios = tiempoGuardar;
    evaluarAccion(tiempoGuardar, 'Guardar cambios de plantilla');

    if (!guardadoConfirmado || !/guardad/i.test(guardadoConfirmado)) {
      console.log('❌ CP-072 FAILED: No se confirmó el guardado de los cambios de la plantilla (mensaje: ' + guardadoConfirmado + ')');
      await tomarScreenshot(driver, 'cp072-fail-guardado-no-confirmado');
      process.exit(1);
    }
    console.log('✔ Confirmación de guardado recibida: "' + guardadoConfirmado + '"');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    if (cargaDentroDeUmbral) {
      console.log('✅ CP-072 PASSED | tabs verificados: Factura, Proforma, Ticket | opciones de plantilla recorridas: ' + botonesNumerados.length + ' | guardado: confirmado');
    } else {
      console.log('⚠️ CP-072 RESULT: Hallazgo de performance — toda la funcionalidad responde correctamente (tabs Factura/Proforma/Ticket, ' + botonesNumerados.length + ' opciones de plantilla, guardado confirmado), pero la carga de /invoiceSetting/invoiceSetting tardó ' + tiempos.cargaModulo + 'ms, muy por encima del umbral de 8000ms definido como FAILED (reproducido en corridas previas con 12362ms y 17942ms).');
    }
    console.log('⏱ Performance:');
    console.log('   - Carga módulo (invoiceSetting): ' + tiempos.cargaModulo + 'ms' + (cargaDentroDeUmbral ? '' : ' ❌ (sobre umbral, no bloqueante)'));
    console.log('   - Recorrer opciones de plantilla: ' + tiempos.recorrerOpciones + 'ms');
    console.log('   - Guardar cambios: ' + tiempos.guardarCambios + 'ms');
    console.log('   - Total CP: ' + tiempoTotalCP + 'ms');
  } catch (error) {
    console.log('❌ CP-072 FAILED: ' + error.message);
    await tomarScreenshot(driver, 'cp072-fail-excepcion');
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp072_planillas_factura_configuracion();
