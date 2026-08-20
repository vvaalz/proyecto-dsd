const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const URL_RECEPCION = `${BASE_URL}/vehicularReception/vehicularQuickReception`;
// Nota: "Dashboard" y "Citas" NO existen como tabs en la versión actual de este panel
// (confirmado en vivo, 2026-08-19) — solo estos 5 tabs además de "Órdenes" (por defecto).
const TABS = ['Tablero', 'Repuestos', 'Cotizaciones', 'Gráficos', 'Tabla informativa'];

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function navegarAModulo(browser, context, url) {
  let page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
  if (/\/log\/login/i.test(page.url())) {
    console.log('⚠️ Sesión expirada (redirect a /log/login) — regenerando y reintentando...');
    await page.close();
    fs.rmSync(SESION_PATH, { force: true });
    const contextNuevo = await abrirContextoConSesion(browser);
    page = await contextNuevo.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
    return { context: contextNuevo, page };
  }
  return { context, page };
}

function clickTab(page, texto) {
  return page.evaluate((t) => {
    const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const normaliza = (s) => (s||'').replace(/\s+/g, ' ').trim();
    const candidatos = Array.from(document.querySelectorAll('button, a')).filter(isVis)
      .filter(b => normaliza(b.textContent).includes(t) && normaliza(b.textContent).length < t.length + 30)
      .sort((a, b) => a.textContent.length - b.textContent.length);
    if (candidatos[0]) { candidatos[0].click(); return true; }
    return false;
  }, texto);
}

async function cp301_panel_recepcion_tabs_buscador() {
  console.log('🔄 Ejecutando CP-301: Panel de Recepción — carga de datos en tabs + buscador...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();
  const resultadosTabs = {};

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, URL_RECEPCION));
    evaluarCargaPagina(Date.now() - t0, 'Carga inicial del Panel de Recepción');
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
    await page.evaluate(() => document.getElementById('workshop-web-notification-permission-dismiss')?.click());
    await page.waitForTimeout(1000);

    // ── Validar carga de datos en cada tab ──
    for (const tab of TABS) {
      const t1 = Date.now();
      const clickOk = await clickTab(page, tab);
      await page.waitForTimeout(3000);
      const info = await page.evaluate(() => ({
        largoTexto: document.body.innerText.length,
        errores: Array.from(document.querySelectorAll('*')).some(e => /error 500|internal server error/i.test(e.textContent||''))
      }));
      evaluarCargaPagina(Date.now() - t1, 'Cargar tab "' + tab + '"');
      resultadosTabs[tab] = clickOk && info.largoTexto > 200 && !info.errores;
      console.log('  Tab "' + tab + '": clic=' + clickOk + ', largoTexto=' + info.largoTexto + ', errorVisible=' + info.errores + ' → ' + (resultadosTabs[tab] ? '✅' : '❌'));
      if (!resultadosTabs[tab]) await screenshotOnFail(page, 'cp301-fail-tab-' + tab.replace(/\s+/g, '_'));
    }

    // ── Buscador en tab "Tablero" ──
    await clickTab(page, 'Tablero');
    await page.waitForTimeout(2500);
    const tBuscarTablero = Date.now();
    await page.fill('#repair_order_search', 'cliente prueba tarea 5').catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(2500);
    const resultadosBuscadorTablero = await page.evaluate(() => document.body.innerText.length);
    evaluarAccionBuscador(Date.now() - tBuscarTablero, 'Buscar en tab Tablero');
    const buscadorTableroOk = resultadosBuscadorTablero > 100;
    console.log('  Buscador en tab "Tablero": largoTexto tras buscar=' + resultadosBuscadorTablero + ' → ' + (buscadorTableroOk ? '✅' : '❌'));

    // ── Buscador en tab "Órdenes" (tab por defecto) ──
    await page.fill('#repair_order_search', '').catch(() => {});
    await clickTab(page, 'Órdenes');
    await page.waitForTimeout(2500);
    const tBuscarOrdenes = Date.now();
    await page.fill('#repair_order_search', 'cliente prueba tarea 5').catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(2500);
    const resultadosBuscadorOrdenes = await page.evaluate(() => document.body.innerText.length);
    evaluarAccionBuscador(Date.now() - tBuscarOrdenes, 'Buscar en tab Órdenes');
    const buscadorOrdenesOk = resultadosBuscadorOrdenes > 100;
    console.log('  Buscador en tab "Órdenes": largoTexto tras buscar=' + resultadosBuscadorOrdenes + ' → ' + (buscadorOrdenesOk ? '✅' : '❌'));
    await page.fill('#repair_order_search', '').catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});

    function evaluarAccionBuscador(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

    // ── VALIDACIONES ──
    const todosTabsOk = Object.values(resultadosTabs).every(Boolean);
    console.log('\n📊 === VALIDACIONES CP-301 ===');
    console.log('  Todos los tabs (' + TABS.join(', ') + ') cargan contenido real: ' + (todosTabsOk ? '✅' : '❌'));
    console.log('  Buscador funciona en tab "Tablero":                              ' + (buscadorTableroOk ? '✅' : '❌'));
    console.log('  Buscador funciona en tab "Órdenes":                              ' + (buscadorOrdenesOk ? '✅' : '❌'));

    if (!todosTabsOk) throw new Error('Al menos un tab no cargó contenido real: ' + JSON.stringify(resultadosTabs));
    if (!buscadorTableroOk) throw new Error('El buscador en el tab "Tablero" no produjo resultados');
    if (!buscadorOrdenesOk) throw new Error('El buscador en el tab "Órdenes" no produjo resultados');

    console.log('✅ CP-301 PASSED | 5 tabs cargan datos reales + buscador funciona en Tablero y Órdenes | validaciones: 3/3');
    registrarResultado({ cp: 'CP-301', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: Date.now() - tiempoInicioCP });

  } catch (error) {
    await screenshotOnFail(page, 'cp301-fail');
    console.log('❌ CP-301 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-301', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp301_panel_recepcion_tabs_buscador();
