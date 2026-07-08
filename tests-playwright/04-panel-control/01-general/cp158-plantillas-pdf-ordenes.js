const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const PANEL_URL = `${BASE_URL}/sett/setting`;
const BTN_ID = 'dashboard_button_setting_10';
const CONTENT_ID = 'dashboard_content_settings_10';
const SELECT_ID = 'order_template_id';

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

async function cp158_plantillas_pdf_ordenes() {
  console.log('🔄 Ejecutando CP-158: Panel de Control — Plantillas pdf de las órdenes...');
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
    if (!seccionAbierta) { await screenshotOnFail(page, 'cp158-fail-seccion-no-abre'); throw new Error('La sección "Plantillas pdf de las órdenes" no se pudo expandir'); }

    // ── Leer valor original y elegir una opción distinta del select "Plantilla general" ──
    const info = await page.evaluate((id) => {
      const sel = document.getElementById(id);
      if (!sel) return null;
      const opciones = Array.from(sel.options).map(o => ({ value: o.value, texto: o.textContent.trim() }));
      return { valorActual: sel.value, opciones };
    }, SELECT_ID);
    console.log('📋 Estado del select "Plantilla general":', JSON.stringify(info));
    if (!info) { await screenshotOnFail(page, 'cp158-fail-campo-no-encontrado'); throw new Error('No se encontró el select #' + SELECT_ID); }

    valorOriginal = info.valorActual;
    const opcionDistinta = info.opciones.find(o => o.value && o.value !== valorOriginal);
    if (!opcionDistinta) { await screenshotOnFail(page, 'cp158-fail-sin-opcion-alternativa'); throw new Error('No hay una opción alternativa distinta de "' + valorOriginal + '" para probar el cambio'); }
    console.log('📋 Cambiando de "' + valorOriginal + '" a "' + opcionDistinta.value + '" (' + opcionDistinta.texto + ')');

    // ── Cambiar la plantilla y guardar ──
    const tGuardar = Date.now();
    await seleccionarOpcion(page, SELECT_ID, opcionDistinta.value);
    await guardarConfiguracion(page);
    evaluarAccion(Date.now() - tGuardar, 'Guardar plantilla distinta');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const valorTrasGuardar = await page.evaluate((id) => document.getElementById(id)?.value, SELECT_ID);
    console.log('📋 Valor tras guardar y refrescar:', valorTrasGuardar);

    // ── Restaurar la plantilla original ──
    await seleccionarOpcion(page, SELECT_ID, valorOriginal);
    await guardarConfiguracion(page);
    console.log('🔄 Plantilla restaurada a "' + valorOriginal + '" y guardada de nuevo.');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const valorTrasRestaurar = await page.evaluate((id) => document.getElementById(id)?.value, SELECT_ID);
    console.log('📋 Valor tras restaurar el original:', valorTrasRestaurar);

    // ── VALIDACIONES ──
    const v1 = valorTrasGuardar === opcionDistinta.value;
    const v2 = valorTrasRestaurar === valorOriginal;

    console.log('\n📊 === VALIDACIONES CP-158 ===');
    console.log('  Plantilla distinta persiste tras guardar y refrescar: ' + (v1 ? '✅' : '❌') + ' (' + valorTrasGuardar + ' vs esperado ' + opcionDistinta.value + ')');
    console.log('  Plantilla original se restauró correctamente:          ' + (v2 ? '✅' : '❌') + ' (' + valorTrasRestaurar + ' vs esperado ' + valorOriginal + ')');

    if (!v1) throw new Error('La plantilla distinta no persistió tras guardar y refrescar (quedó: ' + valorTrasGuardar + ')');
    if (!v2) throw new Error('La plantilla original no se restauró correctamente (quedó: ' + valorTrasRestaurar + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-158 PASSED | select: #' + SELECT_ID + ' | ' + valorOriginal + ' → ' + opcionDistinta.value + ' → ' + valorOriginal + ' (restaurado) | validaciones: 2/2 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-158', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp158-fail');
    console.log('❌ CP-158 FAILED: ' + error.message);
    if (valorOriginal !== null && page) {
      try {
        await abrirSeccion(page, BTN_ID, CONTENT_ID);
        await seleccionarOpcion(page, SELECT_ID, valorOriginal);
        await guardarConfiguracion(page);
        console.log('🔄 (recuperación de emergencia) Plantilla restaurada tras el fallo.');
      } catch {}
    }
    registrarResultado({ cp: 'CP-158', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp158_plantillas_pdf_ordenes();
