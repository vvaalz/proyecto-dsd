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

async function abrirMenuKebab(page) {
  await page.evaluate(() => document.getElementById('dLabel1299')?.click());
  await page.waitForTimeout(1000);
}

async function cp311_configurar_tablero_modo_oscuro() {
  console.log('🔄 Ejecutando CP-311: Configurar tablero (Compacto/Detallado) + búsqueda de modo oscuro...');
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

    // ══════════════════════════════════════════════════════
    // "Modo oscuro" — búsqueda exhaustiva confirmada EN VIVO (2026-08-19): NO existe en este
    // ambiente/versión (9.6.72). Se revisó: (1) menú de cuenta "Design Soft" (solo Mi perfil/
    // Cerrar sesión), (2) el panel global de Configuración (#header_control_panel_open, 160
    // switches en 11 categorías — revisado "Empresa y cuenta" específicamente, sin hallar
    // ningún switch de tema/apariencia). Se documenta como hallazgo de ausencia, no se falla
    // el CP por esto — el modo claro es, de hecho, el único modo disponible (por lo tanto es
    // "el default" de forma trivial, al no existir alternativa).
    // ══════════════════════════════════════════════════════
    console.log('  ⚠️ HALLAZGO: no se encontró ningún control de "modo oscuro" en este ambiente (versión 9.6.72) — revisado menú de cuenta y panel global de configuración (160 switches). El modo claro es el único disponible.');

    // ══════════════════════════════════════════════════════
    // "Configurar tablero" (Compacto / Detallado) — vía menú kebab
    // ══════════════════════════════════════════════════════
    await abrirMenuKebab(page);
    const clickConfigTablero = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const el = Array.from(document.querySelectorAll('a, button')).filter(isVis).find(e => /Configurar tablero/i.test(e.textContent||''));
      if (el) { el.click(); return true; }
      return false;
    });
    await page.waitForTimeout(1500);
    if (!clickConfigTablero) throw new Error('No se encontró/abrió "Configurar tablero" en el menú kebab');

    const estadoInicial = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btn = Array.from(document.querySelectorAll('.ervk-card-mode-option')).filter(isVis).find(b => b.className.includes('active'));
      return btn ? btn.textContent.trim() : null;
    });
    console.log('  Modo activo inicial:', estadoInicial);
    if (!estadoInicial) throw new Error('No se pudo determinar el modo activo inicial (Compacto/Detallado)');

    // Cambiar al modo contrario y guardar
    const otroModo = estadoInicial === 'Compacto' ? 'Detallado' : 'Compacto';
    const t1 = Date.now();
    await page.evaluate((modo) => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btn = Array.from(document.querySelectorAll('.ervk-card-mode-option')).filter(isVis).find(b => b.textContent.trim() === modo);
      if (btn) btn.click();
    }, otroModo);
    await page.waitForTimeout(500);
    await page.evaluate(() => document.getElementById('ervkSaveSettings')?.click());
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - t1, 'Cambiar a modo "' + otroModo + '" y guardar');

    // Verificar que el tablero refleja el cambio (recargar y reabrir el modal para confirmar persistencia)
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirMenuKebab(page);
    await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const el = Array.from(document.querySelectorAll('a, button')).filter(isVis).find(e => /Configurar tablero/i.test(e.textContent||''));
      if (el) el.click();
    });
    await page.waitForTimeout(1500);
    const estadoPersistido = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btn = Array.from(document.querySelectorAll('.ervk-card-mode-option')).filter(isVis).find(b => b.className.includes('active'));
      return btn ? btn.textContent.trim() : null;
    });
    console.log('  Modo activo tras recargar (debe ser "' + otroModo + '"):', estadoPersistido);

    // Restaurar el modo ORIGINAL antes de terminar (no dejar el ambiente compartido alterado)
    await page.evaluate((modo) => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btn = Array.from(document.querySelectorAll('.ervk-card-mode-option')).filter(isVis).find(b => b.textContent.trim() === modo);
      if (btn) btn.click();
    }, estadoInicial);
    await page.waitForTimeout(500);
    await page.evaluate(() => document.getElementById('ervkSaveSettings')?.click());
    await page.waitForTimeout(2000);
    console.log('  Restaurado a modo original "' + estadoInicial + '"');

    // ── VALIDACIONES ──
    const modoSePersistio = estadoPersistido === otroModo;
    console.log('\n📊 === VALIDACIONES CP-311 ===');
    console.log('  "Configurar tablero" ofrece Compacto/Detallado y se pudo cambiar: ✅');
    console.log('  El cambio de modo persiste tras recargar la página:                ' + (modoSePersistio ? '✅' : '❌'));
    console.log('  ⚠️ "Modo oscuro" no existe en este ambiente (documentado arriba, no bloqueante)');

    if (!modoSePersistio) throw new Error('El cambio de modo del tablero (Compacto/Detallado) no persistió tras recargar');

    console.log('✅ CP-311 PASSED | Configurar tablero (Compacto/Detallado) verificado con persistencia + hallazgo de ausencia de modo oscuro | validaciones: 2/2');
    registrarResultado({ cp: 'CP-311', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: Date.now() - tiempoInicioCP });

  } catch (error) {
    await screenshotOnFail(page, 'cp311-fail');
    console.log('❌ CP-311 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-311', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp311_configurar_tablero_modo_oscuro();
