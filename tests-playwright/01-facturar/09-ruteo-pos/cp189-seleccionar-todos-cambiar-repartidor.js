const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const POS_URL = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
// Tablero de Ruteo — "Seleccionar todos" (toggle_all_order_switches()) + "Cambiar Repartidor".
//
// ⚠️ ALCANCE DELIBERADAMENTE ACOTADO (decisión explícita del usuario, 2026-07-19): "Seleccionar
// todos" marca los checkboxes de TODAS las órdenes actualmente visibles en el tablero (no solo las
// de prueba propias) — no existe una forma confiable de acotar esa vista solo a las órdenes
// propias en este ambiente (se probó aislar por fecha de creación y falló con datos ajenos, ver
// incidente documentado en CLAUDE_CONTEXT.md sección 15; aislar por ruta tampoco funcionó porque
// la asignación de ruta vía Chosen no persiste de forma confiable en la creación programática).
// Por esta razón, este CP separa el flujo en dos partes seguras:
//   1) Confirma que "Seleccionar todos" efectivamente marca TODOS los checkboxes visibles
//      (validación reversible: se marca y se limpia con "Limpiar selección" de inmediato, nunca
//      se confirma ninguna acción sobre ese conjunto amplio que incluye órdenes ajenas).
//   2) Prueba el "Cambiar Repartidor" real (con Guardar y verificación de persistencia) SOLO sobre
//      2 órdenes propias, seleccionadas manualmente por su checkbox exacto (mismo patrón que
//      CP-186) — nunca sobre el conjunto de "Seleccionar todos".
// NO se prueba la combinación completa "Seleccionar todos" + confirmar "Cambiar Repartidor" sobre
// el conjunto amplio, porque eso reasignaría el repartidor de órdenes ajenas en el ambiente QA
// compartido sin necesidad real de probarlo end-to-end para confirmar que la función es correcta.

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
  const repartidorAsignado = await page.evaluate(() => {
    const sel = document.getElementById('send_routing_order_agent_assigned');
    const opt = sel && Array.from(sel.options).find(o => o.value && o.value !== '0' && o.value !== '');
    if (!opt) return null;
    sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
    return opt.textContent.trim();
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
  return repartidorAsignado;
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

async function cp189_seleccionar_todos_cambiar_repartidor() {
  console.log('🔄 Ejecutando CP-189: Tablero de Ruteo — "Seleccionar todos" (validación acotada) + "Cambiar Repartidor" real sobre órdenes propias...');
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
    const repartidor1 = await crearOrdenRuteoPrueba(page, 'QA-CP189-1');
    await crearOrdenRuteoPrueba(page, 'QA-CP189-2');
    evaluarAccion(Date.now() - tCrear, 'Crear 2 órdenes de ruteo de prueba');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#btn_routing_option', { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
    await page.waitForTimeout(5000);
    const idsDespues = await idsVisiblesSinFiltro(page);
    idsPropios = idsDespues.filter(id => !idsAntes.includes(id));
    console.log('📋 IDs propios identificados por diferencia exacta:', JSON.stringify(idsPropios));
    if (idsPropios.length !== 2) { await screenshotOnFail(page, 'cp189-fail-diff-no-exacta'); throw new Error('La diferencia de IDs no dio exactamente 2 órdenes propias (dio ' + idsPropios.length + ')'); }

    // ── PARTE 1 (reversible, sin confirmar nada): "Seleccionar todos" marca TODO lo visible ──
    const totalVisibles = idsDespues.length;
    const tSeleccionar = Date.now();
    await page.evaluate(() => { if (typeof toggle_all_order_switches === 'function') toggle_all_order_switches(); });
    await page.waitForTimeout(1000);
    evaluarAccion(Date.now() - tSeleccionar, '"Seleccionar todos" sobre el tablero completo (validación de solo lectura)');
    const estadoTodos = await estadoCheckboxes(page, idsDespues);
    const marcadasTodos = estadoTodos.filter(c => c.checked).length;
    console.log('📋 "Seleccionar todos": ' + marcadasTodos + '/' + totalVisibles + ' checkboxes marcados (incluye órdenes ajenas — NO se confirma ninguna acción sobre este conjunto)');

    // Deshacer de inmediato con "Limpiar selección" — nunca se llega a abrir un modal de acción
    // en lote sobre este conjunto amplio.
    const menuLimpiar = await abrirMenuTablero(page, 'Limpiar selección');
    if (menuLimpiar) await clickMenuItem(page, 'Limpiar selección');
    await page.waitForTimeout(800);
    const estadoTrasLimpiar = await estadoCheckboxes(page, idsDespues);
    const marcadasTrasLimpiar = estadoTrasLimpiar.filter(c => c.checked).length;
    console.log('📋 Tras "Limpiar selección": ' + marcadasTrasLimpiar + '/' + totalVisibles + ' siguen marcados (se espera 0)');

    // ── PARTE 2 (acción real confirmada): "Cambiar Repartidor" SOLO sobre las 2 órdenes propias ──
    await marcarCheckbox(page, idsPropios[0], true);
    await marcarCheckbox(page, idsPropios[1], true);
    const tAccion = Date.now();
    const menuOk = await abrirMenuTablero(page, 'Cambiar Repartidor');
    if (!menuOk) { await screenshotOnFail(page, 'cp189-fail-menu-no-abre'); throw new Error('El menú del tablero no se pudo abrir'); }
    await clickMenuItem(page, 'Cambiar Repartidor');
    await page.waitForTimeout(1000);

    const infoModal = await page.evaluate(() => {
      const sel = document.getElementById('modal_new_agent_select');
      const m = sel ? sel.closest('.modal') : null;
      return m ? m.textContent.replace(/\s+/g,' ').trim().substring(0,250) : null;
    });
    console.log('📋 Modal "Cambiar Repartidor" (solo 2 órdenes propias seleccionadas):', JSON.stringify(infoModal));
    if (!infoModal) { await screenshotOnFail(page, 'cp189-fail-sin-modal'); throw new Error('No apareció el modal "Cambiar Repartidor de Órdenes"'); }

    const nuevoRepartidor = await page.evaluate((original) => {
      const sel = document.getElementById('modal_new_agent_select');
      const opt = Array.from(sel.options).find(o => o.value && o.value !== '0' && o.value !== '' && o.textContent.trim() !== original);
      if (!opt) return null;
      sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
      return opt.textContent.trim();
    }, repartidor1);

    await page.evaluate(() => {
      const sel = document.getElementById('modal_new_agent_select');
      const m = sel ? sel.closest('.modal') : null;
      const btn = m ? Array.from(m.querySelectorAll('button')).find(b => b.textContent.trim() === 'Guardar') : null;
      btn?.click();
    });
    evaluarAccion(Date.now() - tAccion, 'Cambiar repartidor en lote (2 órdenes propias, no el conjunto de "Seleccionar todos")');
    await page.waitForTimeout(2500);

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#btn_routing_option', { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
    await page.waitForTimeout(4000);
    const repartidoresTrasCambio = await page.evaluate((ids) => ids.map(id => {
      const card = document.querySelector(`.pos_order_list_item_content_id_${id}`);
      const m = card ? card.textContent.match(/Repartidor:\s*([^\n]+?)(?=\s{2,}|$)/) : null;
      return { id, repartidor: m ? m[1].trim().substring(0, 60) : null };
    }), idsPropios);
    console.log('📋 Repartidor de las 2 órdenes propias tras refrescar:', JSON.stringify(repartidoresTrasCambio));

    const ambasCambiaron = repartidoresTrasCambio.length === 2 && repartidoresTrasCambio.every(r => r.repartidor && nuevoRepartidor && r.repartidor.includes(nuevoRepartidor.split(' ')[0]));

    // ── VALIDACIONES ──
    const v1 = marcadasTodos === totalVisibles; // "Seleccionar todos" marcó absolutamente todo lo visible
    const v2 = marcadasTrasLimpiar === 0; // "Limpiar selección" deshizo la selección amplia sin dejar nada marcado
    const v3 = /Seleccionadas 2/.test(infoModal);
    const v4 = ambasCambiaron;

    console.log('\n📊 === VALIDACIONES CP-189 ===');
    console.log('  "Seleccionar todos" marcó TODOS los checkboxes visibles (' + marcadasTodos + '/' + totalVisibles + '): ' + (v1 ? '✅' : '❌'));
    console.log('  "Limpiar selección" deshizo esa selección amplia sin dejar nada marcado: ' + (v2 ? '✅' : '❌'));
    console.log('  El modal de "Cambiar Repartidor" (2 propias) reflejó "Seleccionadas 2": ' + (v3 ? '✅' : '❌'));
    console.log('  El repartidor nuevo persiste en las 2 órdenes propias tras refrescar: ' + (v4 ? '✅' : '❌ (' + JSON.stringify(repartidoresTrasCambio) + ')'));
    console.log('  ⚠️ NO probado deliberadamente: confirmar "Cambiar Repartidor" sobre el conjunto completo de "Seleccionar todos" (afectaría órdenes ajenas del ambiente QA compartido) — ver nota en el encabezado del archivo.');

    if (!v1) throw new Error('"Seleccionar todos" no marcó todos los checkboxes visibles (' + marcadasTodos + '/' + totalVisibles + ')');
    if (!v2) throw new Error('"Limpiar selección" no deshizo correctamente la selección amplia (' + marcadasTrasLimpiar + ' seguían marcados)');
    if (!v3) throw new Error('El modal de "Cambiar Repartidor" no reflejó "Seleccionadas 2" para las órdenes propias');
    if (!v4) throw new Error('El repartidor nuevo no persistió en las 2 órdenes propias tras refrescar');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-189 PASSED | "Seleccionar todos" marca correctamente todo lo visible (validado y deshecho de forma segura) + "Cambiar Repartidor" confirmado sobre las 2 órdenes propias | validaciones: 4/4 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-189', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

    await eliminarOrdenesPorId(page, idsPropios);

  } catch (error) {
    await screenshotOnFail(page, 'cp189-fail');
    console.log('❌ CP-189 FAILED: ' + error.message);
    if (page && idsPropios.length > 0) await eliminarOrdenesPorId(page, idsPropios);
    registrarResultado({ cp: 'CP-189', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp189_seleccionar_todos_cambiar_repartidor();
