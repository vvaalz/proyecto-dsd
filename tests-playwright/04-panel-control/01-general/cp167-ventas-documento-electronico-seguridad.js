const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const PANEL_URL = `${BASE_URL}/sett/setting`;
const BTN_ID = 'dashboard_button_setting_8';
const CONTENT_ID = 'dashboard_content_settings_8';
// Sección "Configuración general de ventas" (91 campos) — CP-167 de 3 (último de la serie,
// ver CP-165 y CP-166 para el resto de sub-temas).
// Sub-tema: documento electrónico por defecto al pagar + seguridad de descuento excedido.
const SELECT_ID = 'default_electronic_document_type';
const CHECKBOX_ID = 'seller_confirmation_an_order_exceeds_max_discount';

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

async function seleccionarOpcion(page, selectId, valor) {
  await page.evaluate(({ id, val }) => {
    const sel = document.getElementById(id);
    sel.value = val;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    if (window.jQuery) { window.jQuery(sel).trigger('chosen:updated'); }
  }, { id: selectId, val: valor });
  await page.waitForTimeout(300);
}

async function leerEstado(page) {
  return page.evaluate(({ s, c }) => ({
    select: document.getElementById(s)?.value,
    checkbox: document.getElementById(c)?.checked
  }), { s: SELECT_ID, c: CHECKBOX_ID });
}

async function cp167_ventas_documento_electronico_seguridad() {
  console.log('🔄 Ejecutando CP-167: Panel de Control — Ventas: documento electrónico y seguridad...');
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
    if (!seccionAbierta) { await screenshotOnFail(page, 'cp167-fail-seccion-no-abre'); throw new Error('La sección "Configuración general de ventas" no se pudo expandir'); }

    // ── Leer opciones disponibles del select y elegir una distinta a la actual ──
    const infoSelect = await page.evaluate((id) => {
      const sel = document.getElementById(id);
      if (!sel) return null;
      return { valorActual: sel.value, opciones: Array.from(sel.options).map(o => ({ value: o.value, texto: o.textContent.trim() })) };
    }, SELECT_ID);
    console.log('📋 Estado del select "Documento Electrónico por defecto":', JSON.stringify(infoSelect));
    if (!infoSelect) { await screenshotOnFail(page, 'cp167-fail-select-no-encontrado'); throw new Error('No se encontró el select #' + SELECT_ID); }
    const opcionDistinta = infoSelect.opciones.find(o => o.value && o.value !== infoSelect.valorActual);
    if (!opcionDistinta) { await screenshotOnFail(page, 'cp167-fail-sin-opcion-alternativa'); throw new Error('No hay una opción alternativa distinta de "' + infoSelect.valorActual + '"'); }

    original = await leerEstado(page);
    console.log('📋 Estado original (select / checkbox seguridad):', JSON.stringify(original));
    if (original.select === undefined || original.checkbox === undefined) { await screenshotOnFail(page, 'cp167-fail-campo-no-encontrado'); throw new Error('No se encontraron los campos #' + SELECT_ID + ' / #' + CHECKBOX_ID); }

    // ── Cambiar el documento electrónico por defecto + invertir el checkbox de seguridad ──
    const tGuardar = Date.now();
    await seleccionarOpcion(page, SELECT_ID, opcionDistinta.value);
    await togglearCheckbox(page, CHECKBOX_ID, !original.checkbox);
    await guardarConfiguracion(page);
    evaluarAccion(Date.now() - tGuardar, 'Guardar documento electrónico + checkbox de seguridad');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const trasGuardar = await leerEstado(page);
    console.log('📋 Estado tras guardar y refrescar:', JSON.stringify(trasGuardar));

    // ── Restaurar el estado original ──
    await seleccionarOpcion(page, SELECT_ID, original.select);
    await togglearCheckbox(page, CHECKBOX_ID, original.checkbox);
    await guardarConfiguracion(page);
    console.log('🔄 Estado restaurado al original y guardado de nuevo.');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const trasRestaurar = await leerEstado(page);
    console.log('📋 Estado tras restaurar el original:', JSON.stringify(trasRestaurar));

    // ── VALIDACIONES ──
    const v1 = trasGuardar.select === opcionDistinta.value;
    const v2 = trasGuardar.checkbox === !original.checkbox;
    const v3 = trasRestaurar.select === original.select && trasRestaurar.checkbox === original.checkbox;

    console.log('\n📊 === VALIDACIONES CP-167 ===');
    console.log('  Documento electrónico distinto persiste:      ' + (v1 ? '✅' : '❌') + ' (' + trasGuardar.select + ' vs esperado ' + opcionDistinta.value + ')');
    console.log('  Checkbox de seguridad invertido persiste:      ' + (v2 ? '✅' : '❌') + ' (' + trasGuardar.checkbox + ')');
    console.log('  Estado original se restauró correctamente:      ' + (v3 ? '✅' : '❌'));

    if (!v1) throw new Error('El documento electrónico distinto no persistió tras guardar y refrescar (quedó: ' + trasGuardar.select + ')');
    if (!v2) throw new Error('El checkbox de seguridad invertido no persistió tras guardar y refrescar (quedó: ' + trasGuardar.checkbox + ')');
    if (!v3) throw new Error('El estado original no se restauró correctamente');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-167 PASSED | select: ' + original.select + '→' + opcionDistinta.value + '→' + original.select + ' | checkbox: ' + original.checkbox + '→' + !original.checkbox + '→' + original.checkbox + ' (restaurados) | validaciones: 3/3 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-167', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp167-fail');
    console.log('❌ CP-167 FAILED: ' + error.message);
    if (original && page) {
      try {
        await abrirSeccion(page, BTN_ID, CONTENT_ID);
        await seleccionarOpcion(page, SELECT_ID, original.select);
        await togglearCheckbox(page, CHECKBOX_ID, original.checkbox);
        await guardarConfiguracion(page);
        console.log('🔄 (recuperación de emergencia) Estado restaurado tras el fallo.');
      } catch {}
    }
    registrarResultado({ cp: 'CP-167', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp167_ventas_documento_electronico_seguridad();
