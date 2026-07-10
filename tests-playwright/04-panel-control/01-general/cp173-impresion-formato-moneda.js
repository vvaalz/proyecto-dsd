const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const PANEL_URL = `${BASE_URL}/sett/setting`;
const BTN_ID = 'dashboard_button_setting_2';
const CONTENT_ID = 'dashboard_content_settings_2';
// Sección "Impresión de factura de ventas" (58 campos) — CP-173 de 3 (ver CP-174/CP-175 para
// el resto de sub-temas: contenido de la factura impresa, y cliente/referencias/FE).
// Sub-tema: formato general de impresión + moneda.
const CAMPO_SELECT_ID = 'font_size_select'; // Tamaño de fuente de impresión
const CAMPO_CHECKBOX_ID = 'print_money_symbol_checkbox'; // Mostrar tipo de moneda en impresiones

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

async function seleccionarOpcion(page, id, valor) {
  await page.evaluate(({ id, valor }) => {
    const el = document.getElementById(id);
    el.value = valor;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { id, valor });
  await page.waitForTimeout(300);
}

async function leerEstado(page) {
  return page.evaluate(({ selectId, checkboxId }) => ({
    select: document.getElementById(selectId)?.value,
    checkbox: document.getElementById(checkboxId)?.checked
  }), { selectId: CAMPO_SELECT_ID, checkboxId: CAMPO_CHECKBOX_ID });
}

async function leerOpcionesSelect(page, id) {
  return page.evaluate((id) => {
    const el = document.getElementById(id);
    return el ? Array.from(el.options).map(o => o.value) : [];
  }, id);
}

async function cp173_impresion_formato_moneda() {
  console.log('🔄 Ejecutando CP-173: Panel de Control — Impresión de factura de ventas: formato y moneda...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();
  let original = null;
  let valorSelectAlternativo = null;

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
    if (!seccionAbierta) { await screenshotOnFail(page, 'cp173-fail-seccion-no-abre'); throw new Error('La sección "Impresión de factura de ventas" no se pudo expandir'); }

    original = await leerEstado(page);
    console.log('📋 Estado original ("Tamaño de fuente" + "Mostrar tipo de moneda"):', JSON.stringify(original));
    if (original.select === undefined || original.checkbox === undefined) { await screenshotOnFail(page, 'cp173-fail-campo-no-encontrado'); throw new Error('No se encontraron los campos #' + CAMPO_SELECT_ID + ' / #' + CAMPO_CHECKBOX_ID); }

    const opciones = await leerOpcionesSelect(page, CAMPO_SELECT_ID);
    valorSelectAlternativo = opciones.find(v => v !== original.select);
    if (!valorSelectAlternativo) { await screenshotOnFail(page, 'cp173-fail-sin-opcion-alternativa'); throw new Error('#' + CAMPO_SELECT_ID + ' no tiene una segunda opción disponible para probar el cambio'); }
    console.log('📋 Opciones disponibles:', JSON.stringify(opciones), '| valor alternativo elegido:', valorSelectAlternativo);

    const tGuardar = Date.now();
    await seleccionarOpcion(page, CAMPO_SELECT_ID, valorSelectAlternativo);
    await togglearCheckbox(page, CAMPO_CHECKBOX_ID, !original.checkbox);
    await guardarConfiguracion(page);
    evaluarAccion(Date.now() - tGuardar, 'Guardar select + checkbox modificados');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const trasGuardar = await leerEstado(page);
    console.log('📋 Estado tras guardar y refrescar:', JSON.stringify(trasGuardar));

    // ── Restaurar ambos al estado original ──
    await seleccionarOpcion(page, CAMPO_SELECT_ID, original.select);
    await togglearCheckbox(page, CAMPO_CHECKBOX_ID, original.checkbox);
    await guardarConfiguracion(page);
    console.log('🔄 Estado restaurado al original y guardado de nuevo.');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const trasRestaurar = await leerEstado(page);
    console.log('📋 Estado tras restaurar el original:', JSON.stringify(trasRestaurar));

    // ── VALIDACIONES ──
    const v1 = trasGuardar.select === valorSelectAlternativo;
    const v2 = trasGuardar.checkbox === !original.checkbox;
    const v3 = trasRestaurar.select === original.select && trasRestaurar.checkbox === original.checkbox;

    console.log('\n📊 === VALIDACIONES CP-173 ===');
    console.log('  "Tamaño de fuente de impresión" persiste el cambio: ' + (v1 ? '✅' : '❌') + ' (' + trasGuardar.select + ')');
    console.log('  "Mostrar tipo de moneda" persiste invertido:        ' + (v2 ? '✅' : '❌') + ' (' + trasGuardar.checkbox + ')');
    console.log('  Estado original se restauró correctamente:          ' + (v3 ? '✅' : '❌'));

    if (!v1) throw new Error('"' + CAMPO_SELECT_ID + '" no persistió el cambio tras guardar y refrescar');
    if (!v2) throw new Error('"' + CAMPO_CHECKBOX_ID + '" no persistió invertido tras guardar y refrescar');
    if (!v3) throw new Error('El estado original no se restauró correctamente');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-173 PASSED | campos: #' + CAMPO_SELECT_ID + ' + #' + CAMPO_CHECKBOX_ID + ' | modificados y restaurados correctamente | validaciones: 3/3 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-173', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp173-fail');
    console.log('❌ CP-173 FAILED: ' + error.message);
    if (original && page) {
      try {
        await abrirSeccion(page, BTN_ID, CONTENT_ID);
        await seleccionarOpcion(page, CAMPO_SELECT_ID, original.select);
        await togglearCheckbox(page, CAMPO_CHECKBOX_ID, original.checkbox);
        await guardarConfiguracion(page);
        console.log('🔄 (recuperación de emergencia) Estado restaurado tras el fallo.');
      } catch {}
    }
    registrarResultado({ cp: 'CP-173', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp173_impresion_formato_moneda();
