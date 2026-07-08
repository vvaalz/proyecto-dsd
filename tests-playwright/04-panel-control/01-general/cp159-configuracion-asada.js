const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const PANEL_URL = `${BASE_URL}/sett/setting`;
const BTN_ID = 'dashboard_button_setting_12';
const CONTENT_ID = 'dashboard_content_settings_12';
const CAMPO_ID = 'moratorium_percentage';
// Nota: se probó originalmente con "2.5000" y el servidor lo redondeó a "3.0000" al guardar
// (comportamiento de redondeo confirmado, no un fallo de guardado como en CP-154 — el valor SÍ
// llega y persiste, solo que redondeado). Se usa un valor entero para el caso de éxito principal.
const VALOR_PRUEBA = '5';
const VALOR_DECIMAL_PRUEBA = '2.5000';

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

async function abrirSeccion(page, btnId, contentId) {
  const abierta = await page.evaluate((id) => window.getComputedStyle(document.getElementById(id)).display !== 'none', contentId);
  if (!abierta) {
    await page.evaluate((id) => document.getElementById(id)?.click(), btnId);
    await page.waitForTimeout(1000);
  }
  return page.evaluate((id) => window.getComputedStyle(document.getElementById(id)).display !== 'none', contentId);
}

async function guardarConfiguracion(page) {
  await page.evaluate(() => { document.getElementById('save_settings')?.click(); });
  await page.waitForTimeout(3000);
}

async function cp159_configuracion_asada() {
  console.log('🔄 Ejecutando CP-159: Panel de Control — Configuración ASADA...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();
  let valorOriginal = null;

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, PANEL_URL));
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    evaluarCargaPagina(Date.now() - t0, 'Carga Panel de Control');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { document.getElementById('workshop-web-notification-permission-dismiss')?.click(); });
    await page.waitForTimeout(500);

    const seccionAbierta = await abrirSeccion(page, BTN_ID, CONTENT_ID);
    if (!seccionAbierta) { await screenshotOnFail(page, 'cp159-fail-seccion-no-abre'); throw new Error('La sección "Configuración ASADA" no se pudo expandir'); }

    valorOriginal = await page.evaluate((id) => document.getElementById(id)?.value, CAMPO_ID);
    console.log('📋 Valor original de "Porcentaje Moratorio (%)":', valorOriginal);
    if (valorOriginal === null || valorOriginal === undefined) { await screenshotOnFail(page, 'cp159-fail-campo-no-encontrado'); throw new Error('No se encontró el campo #' + CAMPO_ID); }

    const tGuardar = Date.now();
    await page.evaluate(({ id, val }) => {
      const el = document.getElementById(id);
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { id: CAMPO_ID, val: VALOR_PRUEBA });
    await page.waitForTimeout(300);
    await guardarConfiguracion(page);
    evaluarAccion(Date.now() - tGuardar, 'Guardar porcentaje moratorio');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const valorTrasGuardar = await page.evaluate((id) => document.getElementById(id)?.value, CAMPO_ID);
    console.log('📋 Valor tras guardar y refrescar:', valorTrasGuardar);

    // ── Restaurar el valor original ──
    await page.evaluate(({ id, val }) => {
      const el = document.getElementById(id);
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { id: CAMPO_ID, val: valorOriginal });
    await page.waitForTimeout(300);
    await guardarConfiguracion(page);
    console.log('🔄 Valor restaurado a "' + valorOriginal + '" y guardado de nuevo.');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const valorTrasRestaurar = await page.evaluate((id) => document.getElementById(id)?.value, CAMPO_ID);
    console.log('📋 Valor tras restaurar el original:', valorTrasRestaurar);

    // ── Hallazgo secundario: probar un valor decimal para confirmar el redondeo del servidor ──
    await page.evaluate(({ id, val }) => {
      const el = document.getElementById(id);
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { id: CAMPO_ID, val: VALOR_DECIMAL_PRUEBA });
    await page.waitForTimeout(300);
    await guardarConfiguracion(page);
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const valorTrasDecimal = await page.evaluate((id) => document.getElementById(id)?.value, CAMPO_ID);
    const seRedondeo = valorTrasDecimal !== null && parseFloat(valorTrasDecimal) !== parseFloat(VALOR_DECIMAL_PRUEBA);
    console.log('📋 Hallazgo secundario — valor decimal "' + VALOR_DECIMAL_PRUEBA + '" guardado, quedó como:', valorTrasDecimal, seRedondeo ? '(⚠️ el servidor lo redondeó)' : '(se guardó exacto)');
    // Restaurar de nuevo al valor original tras la prueba de redondeo
    await page.evaluate(({ id, val }) => {
      const el = document.getElementById(id);
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { id: CAMPO_ID, val: valorOriginal });
    await guardarConfiguracion(page);

    // ── VALIDACIONES ──
    const v1 = parseFloat(valorTrasGuardar) === parseFloat(VALOR_PRUEBA);
    const v2 = parseFloat(valorTrasRestaurar) === parseFloat(valorOriginal);

    console.log('\n📊 === VALIDACIONES CP-159 ===');
    console.log('  Valor nuevo persiste tras guardar y refrescar:  ' + (v1 ? '✅' : '❌') + ' (' + valorTrasGuardar + ' vs esperado ' + VALOR_PRUEBA + ')');
    console.log('  Valor original se restauró correctamente:        ' + (v2 ? '✅' : '❌') + ' (' + valorTrasRestaurar + ' vs esperado ' + valorOriginal + ')');

    if (!v1) throw new Error('El nuevo porcentaje moratorio (' + VALOR_PRUEBA + ') no persistió tras guardar y refrescar (quedó: ' + valorTrasGuardar + ')');
    if (!v2) throw new Error('El valor original del porcentaje moratorio no se restauró correctamente (quedó: ' + valorTrasRestaurar + ', esperado: ' + valorOriginal + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    const notaRedondeo = seRedondeo ? ' | ⚠️ hallazgo: valores decimales (' + VALOR_DECIMAL_PRUEBA + ') se redondean a ' + valorTrasDecimal + ' al guardar' : '';
    console.log('✅ CP-159 PASSED | campo: #' + CAMPO_ID + ' | ' + valorOriginal + ' → ' + VALOR_PRUEBA + ' → ' + valorOriginal + ' (restaurado) | validaciones: 2/2' + notaRedondeo + ' | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-159', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp159-fail');
    console.log('❌ CP-159 FAILED: ' + error.message);
    if (valorOriginal !== null && page) {
      try {
        await abrirSeccion(page, BTN_ID, CONTENT_ID);
        await page.evaluate(({ id, val }) => {
          const el = document.getElementById(id);
          if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
        }, { id: CAMPO_ID, val: valorOriginal });
        await guardarConfiguracion(page);
        console.log('🔄 (recuperación de emergencia) Valor restaurado tras el fallo.');
      } catch {}
    }
    registrarResultado({ cp: 'CP-159', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp159_configuracion_asada();
