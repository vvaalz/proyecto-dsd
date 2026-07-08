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

async function cp146_carga_modulo_panel_control() {
  console.log('🔄 Ejecutando CP-146: Carga del módulo Panel de Control...');
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

    // Cerrar popup de notificaciones del navegador si aparece
    await page.evaluate(() => { document.getElementById('workshop-web-notification-permission-dismiss')?.click(); });
    await page.waitForTimeout(500);

    const estado = await page.evaluate(() => {
      const titulo = document.title;
      const tabs = Array.from(document.querySelectorAll('.nav-tabs a[data-toggle="tab"]')).map(a => a.textContent.replace(/\s+/g,' ').trim());
      const buscador = document.getElementById('input_search_setting');
      const btnGuardar = document.getElementById('save_settings');
      const cantidadSecciones = document.querySelectorAll('[id^="dashboard_button_setting_"]').length;
      return { titulo, tabs, buscadorPresente: !!buscador, btnGuardarPresente: !!btnGuardar, cantidadSecciones };
    });
    console.log('📋 Estado del módulo:', JSON.stringify(estado, null, 2));

    // ── VALIDACIONES ──
    const v1 = /panel de control/i.test(estado.titulo);
    const v2 = estado.tabs.length === 3 && estado.tabs.some(t => /dashboard/i.test(t)) && estado.tabs.some(t => /tienda/i.test(t)) && estado.tabs.some(t => /twilio/i.test(t));
    const v3 = estado.buscadorPresente;
    const v4 = estado.btnGuardarPresente;
    const v5 = estado.cantidadSecciones >= 15;

    console.log('\n📊 === VALIDACIONES CP-146 ===');
    console.log('  Título de página correcto:              ' + (v1 ? '✅' : '❌') + ' ("' + estado.titulo + '")');
    console.log('  3 pestañas (Dashboard/Tienda/Twilio):     ' + (v2 ? '✅' : '❌') + ' (' + estado.tabs.join(', ') + ')');
    console.log('  Buscador de configuraciones presente:     ' + (v3 ? '✅' : '❌'));
    console.log('  Botón "Guardar" presente:                 ' + (v4 ? '✅' : '❌'));
    console.log('  ≥15 secciones en el acordeón Dashboard:   ' + (v5 ? '✅' : '❌') + ' (' + estado.cantidadSecciones + ')');

    if (!v1) throw new Error('El título de la página no corresponde a "Panel de Control"');
    if (!v2) throw new Error('No se encontraron las 3 pestañas esperadas (Dashboard/Tienda online/Twilio)');
    if (!v3) throw new Error('No se encontró el buscador de configuraciones (#input_search_setting)');
    if (!v4) throw new Error('No se encontró el botón "Guardar" (#save_settings)');
    if (!v5) throw new Error('El acordeón de configuración tiene menos secciones de las esperadas (' + estado.cantidadSecciones + ')');

    console.log('✅ CP-146 PASSED | secciones: ' + estado.cantidadSecciones + ' | pestañas: ' + estado.tabs.join(', ') + ' | validaciones: 5/5');
    registrarResultado({ cp: 'CP-146', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: Date.now() - tiempoInicioCP });

  } catch (error) {
    await screenshotOnFail(page, 'cp146-fail');
    console.log('❌ CP-146 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-146', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp146_carga_modulo_panel_control();
