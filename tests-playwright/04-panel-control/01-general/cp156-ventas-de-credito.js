const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const PANEL_URL = `${BASE_URL}/sett/setting`;
const BTN_ID = 'dashboard_button_setting_9';
const CONTENT_ID = 'dashboard_content_settings_9';
const CHECKBOX_ID = 'apply_interest_on_credit_sales_checkbox';
const NUMERO_ID = 'interest_percentage_on_credit_sales';
const VALOR_PRUEBA = '3.5000';

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

async function escribirNumero(page, id, valor) {
  await page.evaluate(({ id, valor }) => {
    const el = document.getElementById(id);
    el.value = valor;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { id, valor });
  await page.waitForTimeout(300);
}

async function leerEstado(page) {
  return page.evaluate(({ chk, num }) => ({
    checkbox: document.getElementById(chk)?.checked,
    numero: document.getElementById(num)?.value
  }), { chk: CHECKBOX_ID, num: NUMERO_ID });
}

async function cp156_ventas_de_credito() {
  console.log('🔄 Ejecutando CP-156: Panel de Control — Ventas de Crédito...');
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
    if (!seccionAbierta) { await screenshotOnFail(page, 'cp156-fail-seccion-no-abre'); throw new Error('La sección "Ventas de Crédito" no se pudo expandir'); }

    original = await leerEstado(page);
    console.log('📋 Estado original ("¿Aplicar intereses?" + porcentaje):', JSON.stringify(original));
    if (original.checkbox === undefined || original.numero === undefined) { await screenshotOnFail(page, 'cp156-fail-campo-no-encontrado'); throw new Error('No se encontraron los campos #' + CHECKBOX_ID + ' / #' + NUMERO_ID); }

    // ── Activar "¿Aplicar intereses?", fijar el porcentaje y guardar ──
    const tGuardar = Date.now();
    await togglearCheckbox(page, CHECKBOX_ID, true);
    await escribirNumero(page, NUMERO_ID, VALOR_PRUEBA);
    await guardarConfiguracion(page);
    evaluarAccion(Date.now() - tGuardar, 'Guardar checkbox + porcentaje de interés');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const trasGuardar = await leerEstado(page);
    console.log('📋 Estado tras guardar y refrescar:', JSON.stringify(trasGuardar));

    // ── Restaurar el estado original ──
    await togglearCheckbox(page, CHECKBOX_ID, original.checkbox);
    await escribirNumero(page, NUMERO_ID, original.numero);
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
    const v2 = parseFloat(trasGuardar.numero) === parseFloat(VALOR_PRUEBA);
    const v3 = trasRestaurar.checkbox === original.checkbox && parseFloat(trasRestaurar.numero) === parseFloat(original.numero);

    console.log('\n📊 === VALIDACIONES CP-156 ===');
    console.log('  Checkbox "¿Aplicar intereses?" persiste activado:  ' + (v1 ? '✅' : '❌') + ' (' + trasGuardar.checkbox + ')');
    console.log('  Porcentaje de interés persiste:                     ' + (v2 ? '✅' : '❌') + ' (' + trasGuardar.numero + ' vs esperado ' + VALOR_PRUEBA + ')');
    console.log('  Estado original se restauró correctamente:          ' + (v3 ? '✅' : '❌'));

    if (!v1) throw new Error('El checkbox "¿Aplicar intereses?" no persistió activado tras guardar y refrescar');
    if (!v2) throw new Error('El porcentaje de interés no persistió tras guardar y refrescar (quedó: ' + trasGuardar.numero + ')');
    if (!v3) throw new Error('El estado original no se restauró correctamente');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-156 PASSED | checkbox + porcentaje de interés persistieron y se restauraron correctamente | validaciones: 3/3 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-156', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp156-fail');
    console.log('❌ CP-156 FAILED: ' + error.message);
    if (original && page) {
      try {
        await abrirSeccion(page, BTN_ID, CONTENT_ID);
        await togglearCheckbox(page, CHECKBOX_ID, original.checkbox);
        await escribirNumero(page, NUMERO_ID, original.numero);
        await guardarConfiguracion(page);
        console.log('🔄 (recuperación de emergencia) Estado restaurado tras el fallo.');
      } catch {}
    }
    registrarResultado({ cp: 'CP-156', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp156_ventas_de_credito();
