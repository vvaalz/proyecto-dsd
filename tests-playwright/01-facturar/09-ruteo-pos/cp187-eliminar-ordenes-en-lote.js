const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const POS_URL = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
// Tablero de Ruteo — selección múltiple + "Eliminar" en lote (acción destructiva).
//
// ⚠️ Aislamiento por ID exacto, NO por fecha (lección de un incidente real, ver CLAUDE_CONTEXT.md
// sección 15 — un CP anterior que aislaba "sus" órdenes filtrando por fecha de creación = hoy
// eliminó por error 9 órdenes ajenas que también mostraban "hoy" como fecha). Este CP compara la
// lista COMPLETA de IDs visibles en el tablero antes y después de crear las órdenes de prueba, y
// SOLO opera sobre la diferencia exacta — nunca sobre un conjunto más amplio.

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
    console.log('⚠️ Sesión expirada — regenerando y reintentando...');
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

async function idsVisiblesSinFiltro(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('[id^="a_routing_order_items_"]')).map(el => el.id.replace('a_routing_order_items_', '')));
}

async function crearOrdenRuteoPrueba(page, etiqueta) {
  // Los .product_box viven en el pane de "POS Facturación" — si el tab activo es "Ruteo" (u
  // otro) al llamar esta función, el pane está oculto y el click no agrega nada al carrito.
  await page.evaluate(() => { document.getElementById('btn_pos_option')?.click(); });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const box = document.querySelector('.product_box');
    (box?.querySelector('.product_box_quantity_content') || box)?.click();
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { document.getElementById('demo-menu-top-right')?.click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { create_routing_order(); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const sel = document.getElementById('send_routing_order_agent_assigned');
    const opt = sel && Array.from(sel.options).find(o => o.value && o.value !== '0' && o.value !== '');
    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.fill('#send_routing_order_observation', etiqueta).catch(() => {});
  await page.fill('#search_routing_customer_send_sale', 'Design').catch(() => {});
  await page.waitForTimeout(1200);
  await page.evaluate(() => { if (typeof get_customer_by_pos_option === 'function') get_customer_by_pos_option(0); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const sel = document.getElementById('payment_send_routing_order_client');
    if (sel && sel.options.length > 1) { sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => { document.getElementById('send_routing_order')?.click(); });
  await page.waitForTimeout(1000);
  await page.evaluate(() => { document.querySelector('.sweet-alert .confirm, button.confirm')?.click(); });
  await page.waitForTimeout(2500);
}

async function marcarCheckbox(page, id, valor) {
  await page.evaluate(({ id, valor }) => {
    const el = document.getElementById(`select_order_remove_${id}`);
    if (!el) return;
    el.checked = valor;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('click', { bubbles: true }));
  }, { id, valor });
  await page.waitForTimeout(400);
}

async function abrirMenuTablero(page, textoEsperado) {
  for (let intento = 0; intento < 3; intento++) {
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      Array.from(document.querySelectorAll('button[data-toggle="dropdown"]')).find(isVis)?.click();
    });
    await page.waitForTimeout(800);
    const abierto = await page.evaluate((txt) => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      return !!Array.from(document.querySelectorAll('ul.dropdown-menu')).find(m => isVis(m) && m.textContent.includes(txt));
    }, textoEsperado);
    if (abierto) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

async function clickMenuItem(page, texto) {
  await page.evaluate((texto) => { Array.from(document.querySelectorAll('li')).find(li => li.textContent.trim() === texto)?.click(); }, texto);
  await page.waitForTimeout(1500);
}

async function cp187_eliminar_ordenes_en_lote() {
  console.log('🔄 Ejecutando CP-187: Tablero de Ruteo — selección múltiple + "Eliminar" en lote...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, POS_URL));
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    evaluarCargaPagina(Date.now() - t0, 'Carga POS');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { document.getElementById('workshop-web-notification-permission-dismiss')?.click(); });
    await page.waitForTimeout(500);

    await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
    await page.waitForTimeout(5000);
    const idsAntes = await idsVisiblesSinFiltro(page);
    console.log('📋 IDs visibles ANTES de crear las órdenes de prueba:', idsAntes.length);

    const tCrear = Date.now();
    await crearOrdenRuteoPrueba(page, 'QA-CP187-1');
    await crearOrdenRuteoPrueba(page, 'QA-CP187-2');
    evaluarAccion(Date.now() - tCrear, 'Crear 2 órdenes de ruteo de prueba');

    // Refresco completo (no solo re-click en el tab) para asegurar que el tablero recargue
    // desde cero tras crear las órdenes de prueba.
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#btn_routing_option', { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
    await page.waitForTimeout(5000);
    const idsDespues = await idsVisiblesSinFiltro(page);
    const idsPropios = idsDespues.filter(id => !idsAntes.includes(id));
    console.log('📋 IDs propios identificados por diferencia exacta (antes vs. después):', JSON.stringify(idsPropios));
    if (idsPropios.length !== 2) { await screenshotOnFail(page, 'cp187-fail-diff-no-exacta'); throw new Error('La diferencia de IDs no dio exactamente 2 órdenes propias (dio ' + idsPropios.length + ') — se aborta SIN eliminar nada'); }

    await marcarCheckbox(page, idsPropios[0], true);
    await marcarCheckbox(page, idsPropios[1], true);

    const tAccion = Date.now();
    const menuOk = await abrirMenuTablero(page, 'Eliminar');
    if (!menuOk) { await screenshotOnFail(page, 'cp187-fail-menu-no-abre'); throw new Error('El menú del tablero no se pudo abrir'); }
    await clickMenuItem(page, 'Eliminar');
    await page.waitForTimeout(1200);

    const confirmInfo = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const sw = Array.from(document.querySelectorAll('.sweet-alert')).find(isVis);
      return sw ? sw.textContent.replace(/\s+/g,' ').trim().substring(0,200) : null;
    });
    console.log('📋 Confirmación SweetAlert de "Eliminar":', JSON.stringify(confirmInfo));
    if (!confirmInfo) { await screenshotOnFail(page, 'cp187-fail-sin-confirmacion'); throw new Error('No apareció ningún SweetAlert de confirmación al usar "Eliminar" en lote'); }

    await page.evaluate(() => { document.querySelector('.sweet-alert .confirm, .sweet-alert button.confirm')?.click(); });
    evaluarAccion(Date.now() - tAccion, 'Eliminar 2 órdenes propias en lote (con confirmación)');
    await page.waitForTimeout(2500);

    const idsFinales = await idsVisiblesSinFiltro(page);
    const siguenExistiendo = idsPropios.filter(id => idsFinales.includes(id));
    const otrasIntactas = idsAntes.filter(id => !idsFinales.includes(id)); // ninguna orden preexistente debería haber desaparecido
    console.log('📋 IDs propios que aún existen tras eliminar (se espera vacío):', JSON.stringify(siguenExistiendo));
    console.log('📋 IDs preexistentes que desaparecieron inesperadamente (se espera vacío):', JSON.stringify(otrasIntactas));

    // ── VALIDACIONES ──
    const v1 = idsPropios.length === 2;
    const v2 = /eliminar/i.test(confirmInfo);
    const v3 = siguenExistiendo.length === 0;
    const v4 = otrasIntactas.length === 0;

    console.log('\n📊 === VALIDACIONES CP-187 ===');
    console.log('  Se identificaron exactamente 2 órdenes propias (diff de IDs): ' + (v1 ? '✅' : '❌'));
    console.log('  Apareció el SweetAlert de confirmación correcto:        ' + (v2 ? '✅' : '❌'));
    console.log('  Ambas órdenes propias desaparecieron tras confirmar:    ' + (v3 ? '✅' : '❌ (quedaron: ' + JSON.stringify(siguenExistiendo) + ')'));
    console.log('  Ninguna orden preexistente fue afectada:                ' + (v4 ? '✅' : '❌ (desaparecieron: ' + JSON.stringify(otrasIntactas) + ')'));

    if (!v1) throw new Error('No se identificaron exactamente 2 órdenes propias por diferencia de IDs');
    if (!v2) throw new Error('El SweetAlert de confirmación no tuvo el texto esperado sobre eliminar');
    if (!v3) throw new Error('Alguna de las órdenes de prueba seleccionadas NO se eliminó (' + JSON.stringify(siguenExistiendo) + ')');
    if (!v4) throw new Error('Se eliminaron órdenes preexistentes que no debían tocarse (' + JSON.stringify(otrasIntactas) + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-187 PASSED | 2 órdenes propias (' + JSON.stringify(idsPropios) + ') seleccionadas y eliminadas en lote correctamente, sin afectar ninguna otra orden | validaciones: 4/4 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-187', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp187-fail');
    console.log('❌ CP-187 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-187', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp187_eliminar_ordenes_en_lote();
