const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const PANEL_URL = `${BASE_URL}/sett/setting`;
const BTN_ID = 'dashboard_button_setting_20';
const CONTENT_ID = 'dashboard_content_settings_20';
const CAMPO_ID = 'commission_for_sale';
const VALOR_PRUEBA = '7.5000';

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

async function cp150_configuracion_general_comisiones() {
  console.log('🔄 Ejecutando CP-150: Panel de Control — Configuración general de comisiones...');
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

    // ── Abrir la sección "Configuración general de comisiones" ──
    const seccionAbierta = await abrirSeccion(page, BTN_ID, CONTENT_ID);
    if (!seccionAbierta) { await screenshotOnFail(page, 'cp150-fail-seccion-no-abre'); throw new Error('La sección "Configuración general de comisiones" no se pudo expandir'); }

    // ── Leer valor original de "Comisión por Venta" ──
    valorOriginal = await page.evaluate((id) => document.getElementById(id)?.value, CAMPO_ID);
    console.log('📋 Valor original de "Comisión por Venta":', valorOriginal);
    if (valorOriginal === null || valorOriginal === undefined) { await screenshotOnFail(page, 'cp150-fail-campo-no-encontrado'); throw new Error('No se encontró el campo #' + CAMPO_ID); }

    // ── Cambiar el valor y guardar ──
    const tGuardar = Date.now();
    await page.evaluate(({ id, val }) => {
      const el = document.getElementById(id);
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { id: CAMPO_ID, val: VALOR_PRUEBA });
    await page.waitForTimeout(300);
    await guardarConfiguracion(page);
    evaluarAccion(Date.now() - tGuardar, 'Guardar comisión modificada');

    // ── Refrescar y verificar persistencia ──
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const valorTrasGuardar = await page.evaluate((id) => document.getElementById(id)?.value, CAMPO_ID);
    console.log('📋 Valor de "Comisión por Venta" tras guardar y refrescar:', valorTrasGuardar);

    // ── Restaurar el valor original (para no dejar el sistema alterado) ──
    await page.evaluate(({ id, val }) => {
      const el = document.getElementById(id);
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { id: CAMPO_ID, val: valorOriginal });
    await page.waitForTimeout(300);
    await guardarConfiguracion(page);
    console.log('🔄 Valor restaurado a "' + valorOriginal + '" y guardado de nuevo.');

    // Verificar que la restauración también persistió
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const valorTrasRestaurar = await page.evaluate((id) => document.getElementById(id)?.value, CAMPO_ID);
    console.log('📋 Valor tras restaurar el original:', valorTrasRestaurar);

    // ── VALIDACIONES ──
    const v1 = parseFloat(valorTrasGuardar) === parseFloat(VALOR_PRUEBA);
    const v2 = parseFloat(valorTrasRestaurar) === parseFloat(valorOriginal);

    console.log('\n📊 === VALIDACIONES CP-150 ===');
    console.log('  Valor nuevo persiste tras guardar y refrescar:  ' + (v1 ? '✅' : '❌') + ' (' + valorTrasGuardar + ' vs esperado ' + VALOR_PRUEBA + ')');
    console.log('  Valor original se restauró correctamente:        ' + (v2 ? '✅' : '❌') + ' (' + valorTrasRestaurar + ' vs esperado ' + valorOriginal + ')');

    if (!v1) throw new Error('El nuevo valor de comisión (' + VALOR_PRUEBA + ') no persistió tras guardar y refrescar (quedó: ' + valorTrasGuardar + ')');
    if (!v2) throw new Error('El valor original de comisión no se restauró correctamente (quedó: ' + valorTrasRestaurar + ', esperado: ' + valorOriginal + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-150 PASSED | campo: #' + CAMPO_ID + ' | ' + valorOriginal + ' → ' + VALOR_PRUEBA + ' → ' + valorOriginal + ' (restaurado) | validaciones: 2/2 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-150', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp150-fail');
    console.log('❌ CP-150 FAILED: ' + error.message);
    // Intentar restaurar el valor original igual, para no dejar el sistema en un estado modificado
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
    registrarResultado({ cp: 'CP-150', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp150_configuracion_general_comisiones();
