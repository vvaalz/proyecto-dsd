const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const URL_RECEPCION = `${BASE_URL}/vehicularReception/vehicularQuickReception`;
// Bloque "Creación de Recepción" — flujo 3: crear una recepción sencilla con una placa YA
// EXISTENTE. Para aislar datos (no depender de una placa compartida), este CP primero registra
// su propia placa nueva (igual que CP-256) y luego intenta una SEGUNDA recepción reutilizando
// esa misma placa, ya "existente" para el sistema en este punto.

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function irAOrdenes(browser, context) {
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
  return { page, context };
}

async function abrirModalVehiculo(page) {
  await page.evaluate(() => document.querySelector('button.add-reception-btn')?.click());
  await page.waitForSelector('#vehicle_plaque', { state: 'visible', timeout: 15000 });
}

async function pasoActivo(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const activo = Array.from(document.querySelectorAll('.card-step')).filter(isVis).find(el => /active/.test(el.className||'') && (el.textContent||'').trim());
    return activo ? activo.textContent.trim() : null;
  });
}

async function cp258_recepcion_sencilla_placa_existente() {
  console.log('🔄 Ejecutando CP-258: Recepción de Vehículo — crear recepción sencilla con placa EXISTENTE...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();

  try {
    const t0 = Date.now();
    ({ page, context } = await irAOrdenes(browser, context));
    evaluarCargaPagina(Date.now() - t0, 'Llegar al panel de recepción');

    const placaTest = 'CP258' + String(Date.now()).slice(-8);

    // ── 1) Registrar la placa por primera vez (queda "existente" para el resto del CP) ──
    const tPrimera = Date.now();
    await abrirModalVehiculo(page);
    await page.fill('#vehicle_plaque', placaTest);
    await page.evaluate(() => document.getElementById('vr_add_vehicle_btn')?.click());
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tPrimera, 'Registrar la placa por primera vez');
    const pasoTrasPrimera = await pasoActivo(page);
    console.log('📋 Paso activo tras registrar la placa por primera vez:', pasoTrasPrimera);
    if (!/seleccionar cliente/i.test(pasoTrasPrimera || '')) throw new Error('No se pudo crear la primera recepción con la placa de prueba (paso: ' + pasoTrasPrimera + ')');

    // Abandonar esta orden y volver al panel para intentar de nuevo con la misma placa
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /regresar a [oó]rdenes/i.test(b.textContent||''))?.click();
    });
    await page.waitForTimeout(1500);
    await screenshotOnFail(page, 'cp258-tras-regresar');

    // ── 2) Intentar una segunda recepción con la MISMA placa (ya existente) ──
    const tSegunda = Date.now();
    await abrirModalVehiculo(page);
    await page.fill('#vehicle_plaque', placaTest);
    await page.evaluate(() => document.getElementById('vr_add_vehicle_btn')?.click());
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tSegunda, 'Reutilizar la placa ya existente en una segunda recepción');
    await screenshotOnFail(page, 'cp258-tras-placa-existente');

    // Diagnostico: dumpear que aparecio (modal de seleccion de vehiculo? paso directo? mensaje?)
    const diag = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const modal = Array.from(document.querySelectorAll('.modal')).filter(isVis)[0];
      return { hayModal: !!modal, textoModal: modal ? modal.innerText.substring(0, 400) : null };
    });
    console.log('📋 DIAG tras reutilizar placa existente:', JSON.stringify(diag));

    let pasoTrasSegunda = await pasoActivo(page);
    console.log('📋 Paso activo tras reutilizar la placa existente (antes de manejar posible dialogo):', pasoTrasSegunda);

    // Si aparecio un modal de seleccion/confirmacion del vehiculo existente, intentar continuar
    if (diag.hayModal) {
      await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const modal = Array.from(document.querySelectorAll('.modal')).filter(isVis)[0];
        const btn = Array.from(modal.querySelectorAll('button,a')).filter(isVis).find(b => /continuar|seleccionar|usar|agregar|s[ií]/i.test(b.textContent||''));
        btn?.click();
      });
      await page.waitForTimeout(2000);
      pasoTrasSegunda = await pasoActivo(page);
      console.log('📋 Paso activo tras manejar el diálogo del vehículo existente:', pasoTrasSegunda);
    }

    await screenshotOnFail(page, 'cp258-estado-final');

    const v1 = /seleccionar cliente/i.test(pasoTrasSegunda || '');
    console.log('\n📊 === VALIDACIONES CP-258 ===');
    console.log('  El sistema permite continuar la recepción reutilizando una placa existente: ' + (v1 ? '✅' : '❌'));

    if (!v1) throw new Error('El flujo no permitió continuar la recepción al reutilizar una placa ya existente (paso: ' + pasoTrasSegunda + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-258 PASSED | placa "' + placaTest + '" reutilizada exitosamente en una segunda recepción | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-258', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp258-fail');
    console.log('❌ CP-258 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-258', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp258_recepcion_sencilla_placa_existente();
