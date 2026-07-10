const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const PANEL_URL = `${BASE_URL}/sett/setting`;
const BTN_ID = 'dashboard_button_setting_5';
const CONTENT_ID = 'dashboard_content_settings_5';
// Sección "Configuración del sistema POS" (57 campos) — CP-169 de 3 (ver CP-168/CP-170).
// Sub-tema: mesas/plano de salón + órdenes de taller.
const CAMPO_1 = 'show_table_grid'; // Mostrar plano de salón
const CAMPO_2 = 'mechanic_required_at_invoicing'; // Mecánico requerido al facturar

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
  await page.waitForTimeout(4000);
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

async function leerEstado(page) {
  return page.evaluate(({ c1, c2 }) => ({
    campo1: document.getElementById(c1)?.checked,
    campo2: document.getElementById(c2)?.checked
  }), { c1: CAMPO_1, c2: CAMPO_2 });
}

async function cp169_pos_mesas_taller_aprobaciones() {
  console.log('🔄 Ejecutando CP-169: Panel de Control — POS: mesas, taller y aprobaciones...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();
  let original = null;

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
    if (!seccionAbierta) { await screenshotOnFail(page, 'cp169-fail-seccion-no-abre'); throw new Error('La sección "Configuración del sistema POS" no se pudo expandir'); }

    original = await leerEstado(page);
    console.log('📋 Estado original ("Mostrar plano de salón" + "Mecánico requerido al facturar"):', JSON.stringify(original));
    if (original.campo1 === undefined || original.campo2 === undefined) { await screenshotOnFail(page, 'cp169-fail-campo-no-encontrado'); throw new Error('No se encontraron los campos #' + CAMPO_1 + ' / #' + CAMPO_2); }

    const tGuardar = Date.now();
    await togglearCheckbox(page, CAMPO_1, !original.campo1);
    await togglearCheckbox(page, CAMPO_2, !original.campo2);
    await guardarConfiguracion(page);
    evaluarAccion(Date.now() - tGuardar, 'Guardar ambos checkboxes invertidos');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const trasGuardar = await leerEstado(page);
    console.log('📋 Estado tras guardar y refrescar:', JSON.stringify(trasGuardar));

    // ── Restaurar ambos al estado original ──
    await togglearCheckbox(page, CAMPO_1, original.campo1);
    await togglearCheckbox(page, CAMPO_2, original.campo2);
    await guardarConfiguracion(page);
    console.log('🔄 Estado restaurado al original y guardado de nuevo.');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const trasRestaurar = await leerEstado(page);
    console.log('📋 Estado tras restaurar el original:', JSON.stringify(trasRestaurar));

    // ── VALIDACIONES ──
    const v1 = trasGuardar.campo1 === !original.campo1;
    const v2 = trasGuardar.campo2 === !original.campo2;
    const v3 = trasRestaurar.campo1 === original.campo1 && trasRestaurar.campo2 === original.campo2;

    console.log('\n📊 === VALIDACIONES CP-169 ===');
    console.log('  "Mostrar plano de salón" persiste invertido:          ' + (v1 ? '✅' : '❌') + ' (' + trasGuardar.campo1 + ')');
    console.log('  "Mecánico requerido al facturar" persiste invertido:  ' + (v2 ? '✅' : '❌') + ' (' + trasGuardar.campo2 + ')');
    console.log('  Estado original se restauró correctamente:            ' + (v3 ? '✅' : '❌'));

    if (!v1) throw new Error('"' + CAMPO_1 + '" no persistió invertido tras guardar y refrescar');
    if (!v2) throw new Error('"' + CAMPO_2 + '" no persistió invertido tras guardar y refrescar');
    if (!v3) throw new Error('El estado original no se restauró correctamente');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-169 PASSED | campos: #' + CAMPO_1 + ' + #' + CAMPO_2 + ' | invertidos y restaurados correctamente | validaciones: 3/3 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-169', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp169-fail');
    console.log('❌ CP-169 FAILED: ' + error.message);
    if (original && page) {
      try {
        await abrirSeccion(page, BTN_ID, CONTENT_ID);
        await togglearCheckbox(page, CAMPO_1, original.campo1);
        await togglearCheckbox(page, CAMPO_2, original.campo2);
        await guardarConfiguracion(page);
        console.log('🔄 (recuperación de emergencia) Estado restaurado tras el fallo.');
      } catch {}
    }
    registrarResultado({ cp: 'CP-169', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp169_pos_mesas_taller_aprobaciones();
