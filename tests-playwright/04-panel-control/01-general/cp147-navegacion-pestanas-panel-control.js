const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const PANEL_URL = `${BASE_URL}/sett/setting`;

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

async function cp147_navegacion_pestanas_panel_control() {
  console.log('🔄 Ejecutando CP-147: Navegación entre pestañas del Panel de Control...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();

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

    // ── Dashboard (activa por defecto) ──
    const dashInicial = await page.evaluate(() => {
      const p = document.getElementById('dash');
      return !!(p && p.classList.contains('active'));
    });

    // ── Click en "Tienda online" ──
    const tTienda = Date.now();
    await page.click('a[href="#store"]');
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tTienda, 'Cambiar a Tienda online');
    const tiendaActiva = await page.evaluate(() => {
      const p = document.getElementById('store');
      const dash = document.getElementById('dash');
      return { storeActivo: !!(p && p.classList.contains('active')), dashInactivo: !!(dash && !dash.classList.contains('active')), camposEnStore: p ? p.querySelectorAll('input, select, textarea').length : 0 };
    });
    console.log('📋 Tras click en "Tienda online":', JSON.stringify(tiendaActiva));

    // ── Volver a "Dashboard" ──
    const tDash = Date.now();
    await page.click('a[href="#dash"]');
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tDash, 'Volver a Dashboard');
    const dashActivoDeNuevo = await page.evaluate(() => {
      const p = document.getElementById('dash');
      return !!(p && p.classList.contains('active'));
    });

    // ── Click en "Twilio" (hallazgo esperado: no debería producir cambios) ──
    const urlAntesTwilio = page.url();
    const tTwilio = Date.now();
    await page.click('a[href="#twilio_config"]');
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tTwilio, 'Click en Twilio');
    const estadoTrasTwilio = await page.evaluate(() => {
      const existeTwilioPane = !!document.getElementById('twilio_config');
      const dash = document.getElementById('dash');
      return { existeTwilioPane, dashSigueActivo: !!(dash && dash.classList.contains('active')) };
    });
    const urlDespuesTwilio = page.url();
    console.log('📋 Tras click en "Twilio":', JSON.stringify({ ...estadoTrasTwilio, urlCambio: urlAntesTwilio !== urlDespuesTwilio }));

    // ── VALIDACIONES ──
    const v1 = dashInicial;
    const v2 = tiendaActiva.storeActivo && tiendaActiva.dashInactivo && tiendaActiva.camposEnStore > 0;
    const v3 = dashActivoDeNuevo;
    const v4 = !estadoTrasTwilio.existeTwilioPane && estadoTrasTwilio.dashSigueActivo && urlAntesTwilio === urlDespuesTwilio;

    console.log('\n📊 === VALIDACIONES CP-147 ===');
    console.log('  Dashboard activa por defecto:                ' + (v1 ? '✅' : '❌'));
    console.log('  Click en "Tienda online" cambia de pestaña:  ' + (v2 ? '✅' : '❌'));
    console.log('  Volver a "Dashboard" funciona:                ' + (v3 ? '✅' : '❌'));
    console.log('  Click en "Twilio" no produce cambios (hallazgo esperado): ' + (v4 ? '✅' : '⚠️'));

    if (!v1) throw new Error('El tab "Dashboard" no está activo por defecto al cargar el módulo');
    if (!v2) throw new Error('El click en "Tienda online" no activó correctamente esa pestaña');
    if (!v3) throw new Error('No se pudo volver al tab "Dashboard" tras cambiar de pestaña');

    console.log('✅ CP-147 PASSED | navegación Dashboard↔Tienda online: OK | Twilio confirmado no funcional (hallazgo) | validaciones: 3/3 críticas + 1 hallazgo documentado');
    registrarResultado({ cp: 'CP-147', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: Date.now() - tiempoInicioCP });

  } catch (error) {
    await screenshotOnFail(page, 'cp147-fail');
    console.log('❌ CP-147 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-147', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp147_navegacion_pestanas_panel_control();
