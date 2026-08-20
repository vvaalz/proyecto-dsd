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

function clickTexto(page, texto) {
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

async function cp313_ver_orden_info_asignar_mecanico() {
  console.log('🔄 Ejecutando CP-313: Click en info cliente/vehículo → Ver orden + Asignar mecánico (Responsables)...');
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
    // PARTE 1 — Click en el área de info cliente/vehículo de una tarjeta (tab Órdenes)
    // Hallazgo esperado (sección 30, CP-249): agrega la clase "viewing-repair-order" al body.
    // ══════════════════════════════════════════════════════
    const antesClase = await page.evaluate(() => document.body.className.includes('viewing-repair-order'));
    console.log('  ¿Body ya tenía "viewing-repair-order" antes de clickear? (debe ser false):', antesClase);

    const t1 = Date.now();
    const clickInfoOk = await page.evaluate(() => {
      // Confirmado en vivo: el área de placa/marca/modelo de la tarjeta es
      // .reception-order-vehicle-line, con onclick="getOrderDetailById(id)" real
      // (mismo mecanismo que "Ver orden" del menú de 3 puntos, sección 30).
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const linea = Array.from(document.querySelectorAll('.reception-order-vehicle-line')).filter(isVis)[0];
      if (!linea) return false;
      linea.click();
      return true;
    });
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - t1, 'Click en info cliente/vehículo de una tarjeta');

    const despuesClase = await page.evaluate(() => document.body.className.includes('viewing-repair-order'));
    console.log('  ¿Body tiene "viewing-repair-order" tras el click? (debe ser true):', despuesClase);
    const buscadorColapsado = await page.evaluate(() => {
      const el = document.getElementById('repair_order_search');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width === 0 && r.height === 0;
    });
    console.log('  ¿El buscador de órdenes colapsó a 0×0 (mismo efecto que "Ver orden")?:', buscadorColapsado);
    const verOrdenOk = clickInfoOk && despuesClase && buscadorColapsado;

    // Recargar para revertir el efecto persistente antes de continuar
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);

    // ══════════════════════════════════════════════════════
    // PARTE 2 — Asignar mecánico ("Responsables") desde tab Órdenes
    // (confirmado en vivo: la vista compacta del tab "Tablero" NO expone el botón
    // "Responsables" por tarjeta — hallazgo documentado, no bloqueante para este CP)
    // ══════════════════════════════════════════════════════
    await clickTexto(page, 'Órdenes');
    await page.waitForTimeout(2500);
    const t2 = Date.now();
    const abrioResponsables = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btn = Array.from(document.querySelectorAll('a, button')).filter(isVis).find(b => /^Responsables$/i.test((b.textContent||'').trim()));
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - t2, 'Abrir "Responsables" en tab Órdenes');
    const modalVisible = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      return Array.from(document.querySelectorAll('.modal, [class*="modal"]')).filter(isVis).some(m => /responsable|mec[aá]nico/i.test(m.textContent||''));
    });
    const mecanicoOk = abrioResponsables && modalVisible;
    console.log('  "Responsables" en tab "Órdenes": clic=' + abrioResponsables + ', modal visible=' + modalVisible + ' → ' + (mecanicoOk ? '✅' : '❌'));
    console.log('  ⚠️ HALLAZGO: la vista compacta del tab "Tablero" no expone un botón "Responsables" por tarjeta (revisado en vivo) — solo disponible desde "Órdenes".');
    await page.keyboard.press('Escape').catch(() => {});
    await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /cerrar|cancelar/i.test((b.textContent||'').trim()));
      if (btn) btn.click();
    });
    await page.waitForTimeout(1000);

    // ── VALIDACIONES ──
    console.log('\n📊 === VALIDACIONES CP-313 ===');
    console.log('  Click en info cliente/vehículo replica el efecto de "Ver orden":  ' + (verOrdenOk ? '✅' : '❌'));
    console.log('  "Responsables" (asignar mecánico) abre desde tab Órdenes:         ' + (mecanicoOk ? '✅' : '❌'));

    if (!verOrdenOk) throw new Error('El click en el área de info cliente/vehículo no replicó el efecto esperado de "Ver orden"');
    if (!mecanicoOk) throw new Error('"Responsables" no abrió correctamente desde el tab Órdenes');

    console.log('✅ CP-313 PASSED | Click info cliente/vehículo confirmado como equivalente a "Ver orden" + Responsables verificado | validaciones: 2/2');
    registrarResultado({ cp: 'CP-313', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: Date.now() - tiempoInicioCP });

  } catch (error) {
    await screenshotOnFail(page, 'cp313-fail');
    console.log('❌ CP-313 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-313', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp313_ver_orden_info_asignar_mecanico();
