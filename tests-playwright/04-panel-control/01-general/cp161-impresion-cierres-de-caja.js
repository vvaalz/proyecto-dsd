const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const PANEL_URL = `${BASE_URL}/sett/setting`;
const BTN_ID = 'dashboard_button_setting_3';
const CONTENT_ID = 'dashboard_content_settings_3';
const CAMPO_ID = 'enable_cash_counting_by_denomination';

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

async function togglearCheckbox(page, id, valor) {
  await page.evaluate(({ id, valor }) => {
    const el = document.getElementById(id);
    el.checked = valor;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('click', { bubbles: true }));
  }, { id, valor });
  await page.waitForTimeout(300);
}

async function cp161_impresion_cierres_de_caja() {
  console.log('🔄 Ejecutando CP-161: Panel de Control — Impresión de cierres de caja...');
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
    if (!seccionAbierta) { await screenshotOnFail(page, 'cp161-fail-seccion-no-abre'); throw new Error('La sección "Impresión de cierres de caja" no se pudo expandir'); }

    valorOriginal = await page.evaluate((id) => document.getElementById(id)?.checked, CAMPO_ID);
    console.log('📋 Valor original de "Activar cuadre por denominación en cierre de caja":', valorOriginal);
    if (valorOriginal === null || valorOriginal === undefined) { await screenshotOnFail(page, 'cp161-fail-campo-no-encontrado'); throw new Error('No se encontró el campo #' + CAMPO_ID); }

    const tGuardar = Date.now();
    await togglearCheckbox(page, CAMPO_ID, !valorOriginal);
    await guardarConfiguracion(page);
    evaluarAccion(Date.now() - tGuardar, 'Guardar checkbox invertido');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const valorTrasGuardar = await page.evaluate((id) => document.getElementById(id)?.checked, CAMPO_ID);
    console.log('📋 Valor tras guardar y refrescar:', valorTrasGuardar);

    await togglearCheckbox(page, CAMPO_ID, valorOriginal);
    await guardarConfiguracion(page);
    console.log('🔄 Valor restaurado a "' + valorOriginal + '" y guardado de nuevo.');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const valorTrasRestaurar = await page.evaluate((id) => document.getElementById(id)?.checked, CAMPO_ID);
    console.log('📋 Valor tras restaurar el original:', valorTrasRestaurar);

    // ── VALIDACIONES ──
    const v1 = valorTrasGuardar === !valorOriginal;
    const v2 = valorTrasRestaurar === valorOriginal;

    console.log('\n📊 === VALIDACIONES CP-161 ===');
    console.log('  Valor invertido persiste tras guardar y refrescar: ' + (v1 ? '✅' : '❌') + ' (' + valorTrasGuardar + ' vs esperado ' + !valorOriginal + ')');
    console.log('  Valor original se restauró correctamente:           ' + (v2 ? '✅' : '❌') + ' (' + valorTrasRestaurar + ' vs esperado ' + valorOriginal + ')');

    if (!v1) throw new Error('El checkbox invertido no persistió tras guardar y refrescar (quedó: ' + valorTrasGuardar + ')');
    if (!v2) throw new Error('El valor original del checkbox no se restauró correctamente (quedó: ' + valorTrasRestaurar + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-161 PASSED | campo: #' + CAMPO_ID + ' | ' + valorOriginal + ' → ' + !valorOriginal + ' → ' + valorOriginal + ' (restaurado) | validaciones: 2/2 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-161', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp161-fail');
    console.log('❌ CP-161 FAILED: ' + error.message);
    if (valorOriginal !== null && page) {
      try {
        await abrirSeccion(page, BTN_ID, CONTENT_ID);
        await togglearCheckbox(page, CAMPO_ID, valorOriginal);
        await guardarConfiguracion(page);
        console.log('🔄 (recuperación de emergencia) Valor restaurado tras el fallo.');
      } catch {}
    }
    registrarResultado({ cp: 'CP-161', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp161_impresion_cierres_de_caja();
