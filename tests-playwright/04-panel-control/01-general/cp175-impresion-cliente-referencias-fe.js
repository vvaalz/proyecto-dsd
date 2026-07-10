const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const PANEL_URL = `${BASE_URL}/sett/setting`;
const BTN_ID = 'dashboard_button_setting_2';
const CONTENT_ID = 'dashboard_content_settings_2';
// Sección "Impresión de factura de ventas" (58 campos) — CP-175 de 3 (ver CP-173/CP-174 para
// el resto de sub-temas: formato general/moneda, y contenido de la factura impresa).
// Sub-tema: cliente/referencias + tipo de consecutivo impreso (facturación electrónica).
const CAMPO_CHECKBOX_ID = 'print_qr_code'; // Imprimir código QR en factura
const CAMPO_SELECT_ID = 'print_electronic_billing_data_on_invoice'; // Imprimir consecutivo (Interno/FE/Ambos)

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
  return page.evaluate(({ checkboxId, selectId }) => ({
    checkbox: document.getElementById(checkboxId)?.checked,
    select: document.getElementById(selectId)?.value
  }), { checkboxId: CAMPO_CHECKBOX_ID, selectId: CAMPO_SELECT_ID });
}

async function leerOpcionesSelect(page, id) {
  return page.evaluate((id) => {
    const el = document.getElementById(id);
    return el ? Array.from(el.options).map(o => o.value) : [];
  }, id);
}

async function cp175_impresion_cliente_referencias_fe() {
  console.log('🔄 Ejecutando CP-175: Panel de Control — Impresión de factura de ventas: cliente, referencias y FE...');
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
    if (!seccionAbierta) { await screenshotOnFail(page, 'cp175-fail-seccion-no-abre'); throw new Error('La sección "Impresión de factura de ventas" no se pudo expandir'); }

    original = await leerEstado(page);
    console.log('📋 Estado original ("Imprimir código QR" + "Imprimir consecutivo"):', JSON.stringify(original));
    if (original.checkbox === undefined || original.select === undefined) { await screenshotOnFail(page, 'cp175-fail-campo-no-encontrado'); throw new Error('No se encontraron los campos #' + CAMPO_CHECKBOX_ID + ' / #' + CAMPO_SELECT_ID); }

    const opciones = await leerOpcionesSelect(page, CAMPO_SELECT_ID);
    valorSelectAlternativo = opciones.find(v => v !== original.select);
    if (!valorSelectAlternativo) { await screenshotOnFail(page, 'cp175-fail-sin-opcion-alternativa'); throw new Error('#' + CAMPO_SELECT_ID + ' no tiene una segunda opción disponible para probar el cambio'); }
    console.log('📋 Opciones disponibles:', JSON.stringify(opciones), '| valor alternativo elegido:', valorSelectAlternativo);

    const tGuardar = Date.now();
    await togglearCheckbox(page, CAMPO_CHECKBOX_ID, !original.checkbox);
    await seleccionarOpcion(page, CAMPO_SELECT_ID, valorSelectAlternativo);
    await guardarConfiguracion(page);
    evaluarAccion(Date.now() - tGuardar, 'Guardar checkbox + select modificados');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const trasGuardar = await leerEstado(page);
    console.log('📋 Estado tras guardar y refrescar:', JSON.stringify(trasGuardar));

    // ── Restaurar ambos al estado original ──
    await togglearCheckbox(page, CAMPO_CHECKBOX_ID, original.checkbox);
    await seleccionarOpcion(page, CAMPO_SELECT_ID, original.select);
    await guardarConfiguracion(page);
    console.log('🔄 Estado restaurado al original y guardado de nuevo.');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const trasRestaurar = await leerEstado(page);
    console.log('📋 Estado tras restaurar el original:', JSON.stringify(trasRestaurar));

    // ── VALIDACIONES ──
    const v1 = trasGuardar.checkbox === !original.checkbox;
    const v2 = trasGuardar.select === valorSelectAlternativo;
    const v3 = trasRestaurar.checkbox === original.checkbox && trasRestaurar.select === original.select;

    console.log('\n📊 === VALIDACIONES CP-175 ===');
    console.log('  "Imprimir código QR" persiste invertido:            ' + (v1 ? '✅' : '❌') + ' (' + trasGuardar.checkbox + ')');
    console.log('  "Imprimir consecutivo" persiste el cambio:          ' + (v2 ? '✅' : '❌') + ' (' + trasGuardar.select + ')');
    console.log('  Estado original se restauró correctamente:          ' + (v3 ? '✅' : '❌'));

    if (!v1) throw new Error('"' + CAMPO_CHECKBOX_ID + '" no persistió invertido tras guardar y refrescar');
    if (!v2) throw new Error('"' + CAMPO_SELECT_ID + '" no persistió el cambio tras guardar y refrescar');
    if (!v3) throw new Error('El estado original no se restauró correctamente');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-175 PASSED | campos: #' + CAMPO_CHECKBOX_ID + ' + #' + CAMPO_SELECT_ID + ' | modificados y restaurados correctamente | validaciones: 3/3 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-175', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp175-fail');
    console.log('❌ CP-175 FAILED: ' + error.message);
    if (original && page) {
      try {
        await abrirSeccion(page, BTN_ID, CONTENT_ID);
        await togglearCheckbox(page, CAMPO_CHECKBOX_ID, original.checkbox);
        await seleccionarOpcion(page, CAMPO_SELECT_ID, original.select);
        await guardarConfiguracion(page);
        console.log('🔄 (recuperación de emergencia) Estado restaurado tras el fallo.');
      } catch {}
    }
    registrarResultado({ cp: 'CP-175', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp175_impresion_cliente_referencias_fe();
