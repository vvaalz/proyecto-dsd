const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const PANEL_URL = `${BASE_URL}/sett/setting`;
const BTN_ID = 'dashboard_button_setting_16';
const CONTENT_ID = 'dashboard_content_settings_16';
const CHECKBOX_ID = 'personalized_signature_checkbox';
const TEXTAREA_ID = 'personalized_signature_text';
const TEXTO_PRUEBA = 'Términos y condiciones de prueba CP-155 ' + Date.now();

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

async function escribirTextarea(page, id, texto) {
  await page.evaluate(({ id, texto }) => {
    const el = document.getElementById(id);
    el.value = texto;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { id, texto });
  await page.waitForTimeout(300);
}

async function leerEstado(page) {
  return page.evaluate(({ chk, txt }) => ({
    checkbox: document.getElementById(chk)?.checked,
    texto: document.getElementById(txt)?.value
  }), { chk: CHECKBOX_ID, txt: TEXTAREA_ID });
}

async function cp155_personalizar_terminos_condiciones() {
  console.log('🔄 Ejecutando CP-155: Panel de Control — Personalizar términos y condiciones...');
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
    if (!seccionAbierta) { await screenshotOnFail(page, 'cp155-fail-seccion-no-abre'); throw new Error('La sección "Personalizar términos y condiciones" no se pudo expandir'); }

    original = await leerEstado(page);
    console.log('📋 Estado original:', JSON.stringify(original));
    if (original.checkbox === undefined || original.texto === undefined) { await screenshotOnFail(page, 'cp155-fail-campo-no-encontrado'); throw new Error('No se encontraron los campos #' + CHECKBOX_ID + ' / #' + TEXTAREA_ID); }

    // ── Activar el checkbox, escribir texto de prueba y guardar ──
    const tGuardar = Date.now();
    await togglearCheckbox(page, CHECKBOX_ID, true);
    await escribirTextarea(page, TEXTAREA_ID, TEXTO_PRUEBA);
    await guardarConfiguracion(page);
    evaluarAccion(Date.now() - tGuardar, 'Guardar checkbox + texto');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const trasGuardar = await leerEstado(page);
    console.log('📋 Estado tras guardar y refrescar:', JSON.stringify(trasGuardar));

    // ── Restaurar el estado original ──
    await togglearCheckbox(page, CHECKBOX_ID, original.checkbox);
    await escribirTextarea(page, TEXTAREA_ID, original.texto);
    await guardarConfiguracion(page);
    console.log('🔄 Estado restaurado al original y guardado de nuevo.');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const trasRestaurar = await leerEstado(page);
    console.log('📋 Estado tras restaurar el original:', JSON.stringify(trasRestaurar));

    // ── VALIDACIONES ──
    const v1 = trasGuardar.checkbox === true;
    const v2 = trasGuardar.texto === TEXTO_PRUEBA;
    const v3 = trasRestaurar.checkbox === original.checkbox && trasRestaurar.texto === original.texto;

    console.log('\n📊 === VALIDACIONES CP-155 ===');
    console.log('  Checkbox "Personalizar firma" persiste activado:   ' + (v1 ? '✅' : '❌') + ' (' + trasGuardar.checkbox + ')');
    console.log('  Texto de términos y condiciones persiste:           ' + (v2 ? '✅' : '❌'));
    console.log('  Estado original se restauró correctamente:          ' + (v3 ? '✅' : '❌'));

    if (!v1) throw new Error('El checkbox "Personalizar firma" no persistió activado tras guardar y refrescar');
    if (!v2) throw new Error('El texto de términos y condiciones no persistió tras guardar y refrescar (quedó: "' + trasGuardar.texto + '")');
    if (!v3) throw new Error('El estado original no se restauró correctamente');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-155 PASSED | checkbox + textarea persistieron y se restauraron correctamente | validaciones: 3/3 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-155', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp155-fail');
    console.log('❌ CP-155 FAILED: ' + error.message);
    if (original && page) {
      try {
        await abrirSeccion(page, BTN_ID, CONTENT_ID);
        await togglearCheckbox(page, CHECKBOX_ID, original.checkbox);
        await escribirTextarea(page, TEXTAREA_ID, original.texto);
        await guardarConfiguracion(page);
        console.log('🔄 (recuperación de emergencia) Estado restaurado tras el fallo.');
      } catch {}
    }
    registrarResultado({ cp: 'CP-155', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp155_personalizar_terminos_condiciones();
