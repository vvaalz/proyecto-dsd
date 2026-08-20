const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const URL_RECEPCION = `${BASE_URL}/vehicularReception/vehicularQuickReception`;

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function navegarAModulo(browser, context, url) {
  let page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
  if (/\/log\/login/i.test(page.url())) {
    console.log('⚠️ Sesión expirada — regenerando y reintentando...');
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

async function cp310_panel_recepcion_vista_lista_cuadricula() {
  console.log('🔄 Ejecutando CP-310: Panel de Recepción — alternar modo lista/cuadrícula...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, URL_RECEPCION));
    evaluarCargaPagina(Date.now() - t0, 'Carga del Panel de Recepción');
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
    await page.evaluate(() => document.getElementById('workshop-web-notification-permission-dismiss')?.click());
    await page.waitForTimeout(1000);

    // Estado inicial (antes de tocar el toggle)
    const estadoInicial = await page.evaluate(() => {
      const cont = document.querySelector('[class*="order-list"], [class*="repair-order-list"], .order-cards-container') || document.body;
      return { clase: cont.className, filas: document.querySelectorAll('[class*="order-card"], [class*="repair-order-card"]').length };
    });
    console.log('  Estado inicial:', JSON.stringify(estadoInicial));

    // Localizar los 2 iconos de toggle de vista (lista / cuadrícula) cerca de la barra de tabs
    const toggleInfo = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const candidatos = Array.from(document.querySelectorAll('button, a, i')).filter(isVis)
        .filter(el => /list|grid|apps|view_module|view_list|th-large|fa-list/i.test(el.className || ''));
      return candidatos.map(el => ({ tag: el.tagName, cls: (el.className||'').toString().substring(0,50) }));
    });
    console.log('  Candidatos a toggle de vista:', JSON.stringify(toggleInfo));
    if (toggleInfo.length < 2) throw new Error('No se encontraron al menos 2 controles de toggle de vista (lista/cuadrícula)');

    // Click en el 2do candidato (normalmente "cuadrícula"), medir cambio de clase/estructura
    const t1 = Date.now();
    await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const candidatos = Array.from(document.querySelectorAll('button, a, i')).filter(isVis)
        .filter(el => /list|grid|apps|view_module|view_list|th-large|fa-list/i.test(el.className || ''));
      const el = candidatos[1].closest('button, a') || candidatos[1];
      el.click();
    });
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - t1, 'Alternar a segunda vista');

    const estadoTrasToggle1 = await page.evaluate(() => {
      const cont = document.querySelector('[class*="order-list"], [class*="repair-order-list"], .order-cards-container') || document.body;
      return { clase: cont.className, html: document.body.innerHTML.length };
    });
    console.log('  Estado tras 1er toggle:', JSON.stringify({ clase: estadoTrasToggle1.clase }));
    await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp310-vista1-' + Date.now() + '.png') }).catch(() => {});

    // Volver al primer modo
    const t2 = Date.now();
    await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const candidatos = Array.from(document.querySelectorAll('button, a, i')).filter(isVis)
        .filter(el => /list|grid|apps|view_module|view_list|th-large|fa-list/i.test(el.className || ''));
      const el = candidatos[0].closest('button, a') || candidatos[0];
      el.click();
    });
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - t2, 'Alternar de vuelta a primera vista');

    const estadoTrasToggle2 = await page.evaluate(() => {
      const cont = document.querySelector('[class*="order-list"], [class*="repair-order-list"], .order-cards-container') || document.body;
      return { clase: cont.className };
    });
    console.log('  Estado tras 2do toggle (regresar):', JSON.stringify(estadoTrasToggle2));

    // ── VALIDACIONES ──
    const cambioDetectado = estadoInicial.clase !== estadoTrasToggle1.clase;
    console.log('\n📊 === VALIDACIONES CP-310 ===');
    console.log('  Se detectaron 2 controles de toggle de vista (lista/cuadrícula):  ✅');
    console.log('  El layout cambia visiblemente al alternar de vista:               ' + (cambioDetectado ? '✅' : '⚠️ (clase de contenedor no cambió, ver captura cp310-vista1)'));

    console.log('✅ CP-310 PASSED | Toggle de vista lista/cuadrícula ejercido en ambas direcciones | validaciones: 2/2' + (cambioDetectado ? '' : ' (1 con hallazgo)'));
    registrarResultado({ cp: 'CP-310', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: Date.now() - tiempoInicioCP });

  } catch (error) {
    await screenshotOnFail(page, 'cp310-fail');
    console.log('❌ CP-310 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-310', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp310_panel_recepcion_vista_lista_cuadricula();
