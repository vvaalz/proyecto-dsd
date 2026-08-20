const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const URL_RECEPCION = `${BASE_URL}/vehicularReception/vehicularQuickReception`;
// Bloque "Creación de Recepción" — flujo 2: crear una recepción sencilla SIN placa, usando el
// toggle "No tiene placa / matrícula" del modal de ingreso de vehículo.

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

async function cp257_recepcion_sencilla_sin_placa() {
  console.log('🔄 Ejecutando CP-257: Recepción de Vehículo — crear recepción sencilla SIN placa...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();

  try {
    const t0 = Date.now();
    ({ page, context } = await abrirModalVehiculo(browser, context));
    evaluarCargaPagina(Date.now() - t0, 'Abrir modal de placa del vehículo');

    // Activar el toggle "No tiene placa / matrícula" (checkbox real: #vehicle_has_plaque_check,
    // envuelto en un <label> — clickear la etiqueta de texto para simular la interacción real)
    const tToggle = Date.now();
    await page.click('#vr_no_plaque_label');
    await page.waitForTimeout(800);
    const toggleActivado = await page.evaluate(() => document.getElementById('vehicle_has_plaque_check')?.checked ?? null);
    console.log('📋 Estado del toggle "No tiene placa" tras click:', toggleActivado);
    if (!toggleActivado) throw new Error('El toggle "No tiene placa / matrícula" no quedó activado tras el clic');
    evaluarAccion(Date.now() - tToggle, 'Activar toggle "No tiene placa"');
    await screenshotOnFail(page, 'cp257-toggle-activado');

    const tAgregar = Date.now();
    await page.evaluate(() => document.getElementById('vr_add_vehicle_btn')?.click());
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tAgregar, 'Agregar vehículo sin placa');

    await screenshotOnFail(page, 'cp257-estado-final');

    const paso = await pasoActivo(page);
    console.log('📋 Paso activo tras agregar vehículo sin placa:', paso);
    const v1 = /seleccionar cliente/i.test(paso || '');

    console.log('\n📊 === VALIDACIONES CP-257 ===');
    console.log('  El flujo avanza a "Seleccionar Cliente" tras agregar el vehículo sin placa: ' + (v1 ? '✅' : '❌'));

    if (!v1) throw new Error('El flujo no avanzó a "Seleccionar Cliente" tras agregar el vehículo sin placa (paso activo: ' + paso + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-257 PASSED | recepción creada sin placa | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-257', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp257-fail');
    console.log('❌ CP-257 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-257', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp257_recepcion_sencilla_sin_placa();
