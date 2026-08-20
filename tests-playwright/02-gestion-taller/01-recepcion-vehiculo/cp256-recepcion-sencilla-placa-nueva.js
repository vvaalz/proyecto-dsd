const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const URL_RECEPCION = `${BASE_URL}/vehicularReception/vehicularQuickReception`;
// Bloque "Creación de Recepción" — flujo 1: crear una recepción sencilla con una placa NUEVA
// (nunca antes registrada en el sistema).

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function abrirModalVehiculo(browser, context) {
  let page = await context.newPage();
  await page.goto(URL_RECEPCION, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(1500);
  if (/\/log\/login/i.test(page.url())) {
    await page.close();
    fs.rmSync(SESION_PATH, { force: true });
    context = await abrirContextoConSesion(browser);
    page = await context.newPage();
    await page.goto(URL_RECEPCION, { waitUntil: 'load', timeout: 180000 });
    await page.waitForTimeout(1500);
  }
  await page.waitForSelector('button.add-reception-btn', { timeout: 60000 });
  await page.evaluate(() => { document.getElementById('workshop-web-notification-permission-dismiss')?.click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('button.add-reception-btn')?.click());
  await page.waitForSelector('#vehicle_plaque', { state: 'visible', timeout: 15000 });
  return { page, context };
}

async function pasoActivo(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const activo = Array.from(document.querySelectorAll('.card-step')).filter(isVis).find(el => /active/.test(el.className||'') && (el.textContent||'').trim());
    return activo ? activo.textContent.trim() : null;
  });
}

async function cp256_recepcion_sencilla_placa_nueva() {
  console.log('🔄 Ejecutando CP-256: Recepción de Vehículo — crear recepción sencilla con placa NUEVA...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();

  try {
    const t0 = Date.now();
    ({ page, context } = await abrirModalVehiculo(browser, context));
    evaluarCargaPagina(Date.now() - t0, 'Abrir modal de placa del vehículo');

    const placaNueva = 'CP256' + String(Date.now()).slice(-8);
    const tAgregar = Date.now();
    await page.fill('#vehicle_plaque', placaNueva);
    await page.evaluate(() => document.getElementById('vr_add_vehicle_btn')?.click());
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tAgregar, 'Agregar vehículo con placa nueva');

    await screenshotOnFail(page, 'cp256-estado-final');

    const paso = await pasoActivo(page);
    console.log('📋 Paso activo tras agregar vehículo con placa nueva:', paso);
    const v1 = /seleccionar cliente/i.test(paso || '');

    console.log('\n📊 === VALIDACIONES CP-256 ===');
    console.log('  El flujo avanza a "Seleccionar Cliente" tras agregar la placa nueva: ' + (v1 ? '✅' : '❌'));

    if (!v1) throw new Error('El flujo no avanzó a "Seleccionar Cliente" tras agregar el vehículo con placa nueva (paso activo: ' + paso + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-256 PASSED | recepción creada con placa nueva "' + placaNueva + '" | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-256', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp256-fail');
    console.log('❌ CP-256 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-256', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp256_recepcion_sencilla_placa_nueva();
