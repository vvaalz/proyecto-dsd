const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const POS_URL = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
// Tablero de Ruteo — selección múltiple + "Limpiar selección" (clear_selected_orders_quick()).
//
// ⚠️ Aislamiento por ID exacto, NO por fecha (ver hallazgo en CLAUDE_CONTEXT.md sección 15 e
// incidente documentado ahí: filtrar por fecha de creación no aísla de forma confiable las
// órdenes propias en este ambiente). La limpieza final de este CP también opera exclusivamente
// sobre los IDs identificados por diferencia exacta, nunca sobre un conjunto más amplio.

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

async function estadoCheckboxes(page, ids) {
  return page.evaluate((ids) => ids.map(id => ({ id, checked: document.getElementById(`select_order_remove_${id}`)?.checked })), ids);
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

async function eliminarOrdenesPorId(page, ids) {
  if (!ids || ids.length === 0) return;
  try {
    for (const id of ids) await marcarCheckbox(page, id, true);
    await abrirMenuTablero(page, 'Eliminar');
    await clickMenuItem(page, 'Eliminar');
    await page.waitForTimeout(1200);
    await page.evaluate(() => { document.querySelector('.sweet-alert .confirm, .sweet-alert button.confirm')?.click(); });
    await page.waitForTimeout(2000);
    console.log('🧹 Limpieza: órdenes de prueba eliminadas (por id exacto):', JSON.stringify(ids));
  } catch (e) {
    console.log('⚠️ No se pudo limpiar automáticamente las órdenes de prueba:', e.message);
  }
}

async function cp188_limpiar_seleccion_tablero() {
  console.log('🔄 Ejecutando CP-188: Tablero de Ruteo — "Limpiar selección"...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();
  let idsPropios = [];

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

    const tCrear = Date.now();
    await crearOrdenRuteoPrueba(page, 'QA-CP188-1');
    await crearOrdenRuteoPrueba(page, 'QA-CP188-2');
    evaluarAccion(Date.now() - tCrear, 'Crear 2 órdenes de ruteo de prueba');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#btn_routing_option', { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
    await page.waitForTimeout(5000);
    const idsDespues = await idsVisiblesSinFiltro(page);
    idsPropios = idsDespues.filter(id => !idsAntes.includes(id));
    console.log('📋 IDs propios identificados por diferencia exacta:', JSON.stringify(idsPropios));
    if (idsPropios.length !== 2) { await screenshotOnFail(page, 'cp188-fail-diff-no-exacta'); throw new Error('La diferencia de IDs no dio exactamente 2 órdenes propias (dio ' + idsPropios.length + ')'); }

    // ── Marcar ambas y confirmar visualmente que quedan marcadas ──
    await marcarCheckbox(page, idsPropios[0], true);
    await marcarCheckbox(page, idsPropios[1], true);
    const antes = await estadoCheckboxes(page, idsPropios);
    console.log('📋 Estado de los checkboxes tras marcarlos:', JSON.stringify(antes));

    const peticionesRelevantes = [];
    page.on('request', (req) => { if (req.method() === 'POST' && /routing/i.test(req.url())) peticionesRelevantes.push(req.url()); });

    // ── Limpiar selección ──
    const tAccion = Date.now();
    const menuOk = await abrirMenuTablero(page, 'Limpiar selección');
    if (!menuOk) { await screenshotOnFail(page, 'cp188-fail-menu-no-abre'); throw new Error('El menú del tablero no se pudo abrir'); }
    await clickMenuItem(page, 'Limpiar selección');
    evaluarAccion(Date.now() - tAccion, 'Limpiar selección');
    await page.waitForTimeout(1000);

    const despues = await estadoCheckboxes(page, idsPropios);
    console.log('📋 Estado de los checkboxes tras "Limpiar selección":', JSON.stringify(despues));
    console.log('📋 Peticiones POST relacionadas con ruteo tras "Limpiar selección" (se espera ninguna):', JSON.stringify(peticionesRelevantes));

    // ── VALIDACIONES ──
    const v1 = idsPropios.length === 2;
    const v2 = antes.every(c => c.checked === true);
    const v3 = despues.every(c => c.checked === false);
    const v4 = peticionesRelevantes.length === 0;

    console.log('\n📊 === VALIDACIONES CP-188 ===');
    console.log('  Se identificaron exactamente 2 órdenes propias (diff de IDs): ' + (v1 ? '✅' : '❌'));
    console.log('  Ambos checkboxes quedaron marcados antes de limpiar:    ' + (v2 ? '✅' : '❌'));
    console.log('  Ambos checkboxes quedaron desmarcados tras limpiar:     ' + (v3 ? '✅' : '❌'));
    console.log('  "Limpiar selección" no disparó ninguna petición al servidor (solo UI): ' + (v4 ? '✅' : '❌'));

    if (!v1) throw new Error('No se identificaron exactamente 2 órdenes propias por diferencia de IDs');
    if (!v2) throw new Error('Los checkboxes no quedaron marcados correctamente antes de limpiar la selección');
    if (!v3) throw new Error('"Limpiar selección" no desmarcó los checkboxes correctamente');
    if (!v4) throw new Error('"Limpiar selección" disparó peticiones al servidor inesperadamente (' + JSON.stringify(peticionesRelevantes) + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-188 PASSED | "Limpiar selección" desmarca correctamente los checkboxes sin llamadas al servidor | validaciones: 4/4 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-188', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

    await eliminarOrdenesPorId(page, idsPropios);

  } catch (error) {
    await screenshotOnFail(page, 'cp188-fail');
    console.log('❌ CP-188 FAILED: ' + error.message);
    if (page && idsPropios.length > 0) await eliminarOrdenesPorId(page, idsPropios);
    registrarResultado({ cp: 'CP-188', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp188_limpiar_seleccion_tablero();
