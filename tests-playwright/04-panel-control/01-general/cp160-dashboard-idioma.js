const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const PANEL_URL = `${BASE_URL}/sett/setting`;
const BTN_ID = 'dashboard_button_setting_1';
const CONTENT_ID = 'dashboard_content_settings_1';
const SELECT_ID = 'language_select';
const VALOR_PRUEBA = '1'; // English

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

async function seleccionarOpcion(page, selectId, valor) {
  await page.evaluate(({ id, val }) => {
    const sel = document.getElementById(id);
    sel.value = val;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    if (window.jQuery) { window.jQuery(sel).trigger('chosen:updated'); }
  }, { id: selectId, val: valor });
  await page.waitForTimeout(300);
}

async function cp160_dashboard_idioma() {
  console.log('🔄 Ejecutando CP-160: Panel de Control — Dashboard (idioma)...');
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
    if (!seccionAbierta) { await screenshotOnFail(page, 'cp160-fail-seccion-no-abre'); throw new Error('La sección "Dashboard" no se pudo expandir'); }

    valorOriginal = await page.evaluate((id) => document.getElementById(id)?.value, SELECT_ID);
    console.log('📋 Valor original de "Lenguaje":', valorOriginal, '(2=Español)');
    if (valorOriginal === null || valorOriginal === undefined) { await screenshotOnFail(page, 'cp160-fail-campo-no-encontrado'); throw new Error('No se encontró el select #' + SELECT_ID); }

    const tGuardar = Date.now();
    await seleccionarOpcion(page, SELECT_ID, VALOR_PRUEBA);
    await guardarConfiguracion(page);
    evaluarAccion(Date.now() - tGuardar, 'Guardar idioma English');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const valorTrasGuardar = await page.evaluate((id) => document.getElementById(id)?.value, SELECT_ID);
    console.log('📋 Valor tras guardar y refrescar:', valorTrasGuardar);

    // ── Restaurar el idioma original ──
    await seleccionarOpcion(page, SELECT_ID, valorOriginal);
    await guardarConfiguracion(page);
    console.log('🔄 Idioma restaurado a "' + valorOriginal + '" y guardado de nuevo.');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const valorTrasRestaurar = await page.evaluate((id) => document.getElementById(id)?.value, SELECT_ID);
    console.log('📋 Valor tras restaurar el original:', valorTrasRestaurar);

    // ── VALIDACIONES ──
    const v1 = valorTrasGuardar === VALOR_PRUEBA;
    const v2 = valorTrasRestaurar === valorOriginal;

    console.log('\n📊 === VALIDACIONES CP-160 ===');
    console.log('  Idioma English persiste tras guardar y refrescar: ' + (v1 ? '✅' : '❌') + ' (' + valorTrasGuardar + ' vs esperado ' + VALOR_PRUEBA + ')');
    console.log('  Idioma original se restauró correctamente:         ' + (v2 ? '✅' : '❌') + ' (' + valorTrasRestaurar + ' vs esperado ' + valorOriginal + ')');

    if (!v1) throw new Error('El idioma English no persistió tras guardar y refrescar (quedó: ' + valorTrasGuardar + ')');
    if (!v2) throw new Error('El idioma original no se restauró correctamente (quedó: ' + valorTrasRestaurar + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-160 PASSED | select: #' + SELECT_ID + ' | ' + valorOriginal + ' → ' + VALOR_PRUEBA + ' → ' + valorOriginal + ' (restaurado) | validaciones: 2/2 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-160', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp160-fail');
    console.log('❌ CP-160 FAILED: ' + error.message);
    if (valorOriginal !== null && page) {
      try {
        await abrirSeccion(page, BTN_ID, CONTENT_ID);
        await seleccionarOpcion(page, SELECT_ID, valorOriginal);
        await guardarConfiguracion(page);
        console.log('🔄 (recuperación de emergencia) Idioma restaurado tras el fallo.');
      } catch {}
    }
    registrarResultado({ cp: 'CP-160', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp160_dashboard_idioma();
