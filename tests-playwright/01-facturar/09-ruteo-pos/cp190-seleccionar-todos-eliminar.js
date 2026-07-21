const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const POS_URL = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
// Tablero de Ruteo — "Seleccionar todos" (toggle_all_order_switches()) + "Eliminar" (destructiva).
//
// ⚠️ ALCANCE DELIBERADAMENTE ACOTADO (decisión explícita del usuario, 2026-07-19 — mismo criterio
// que CP-189): "Seleccionar todos" marca los checkboxes de TODAS las órdenes visibles en el
// tablero, no solo las de prueba propias, y no existe una forma confiable de acotar esa vista en
// este ambiente (ver incidente de aislamiento por fecha documentado en CLAUDE_CONTEXT.md sección
// 15, donde ese enfoque eliminó 9 órdenes ajenas por error). Este CP separa el flujo en dos partes:
//   1) Confirma que "Seleccionar todos" marca TODOS los checkboxes visibles (validación reversible:
//      se marca y se deshace con "Limpiar selección", NUNCA se confirma "Eliminar" sobre ese
//      conjunto amplio que incluye órdenes ajenas).
//   2) Prueba "Eliminar" real (con confirmación del SweetAlert y verificación de que desaparecen)
//      SOLO sobre 2 órdenes propias, seleccionadas manualmente por checkbox exacto — mismo patrón
//      que CP-187.
// NO se prueba la combinación completa "Seleccionar todos" + confirmar "Eliminar" sobre el
// conjunto amplio: eso borraría órdenes ajenas del ambiente QA compartido sin necesidad real de
// probarlo end-to-end para confirmar que la función "Eliminar" en sí es correcta (ya validada en
// CP-187 sobre datos propios).

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

async function cp190_seleccionar_todos_eliminar() {
  console.log('🔄 Ejecutando CP-190: Tablero de Ruteo — "Seleccionar todos" (validación acotada) + "Eliminar" real sobre órdenes propias...');
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

    const tCrear = Date.now();
    await crearOrdenRuteoPrueba(page, 'QA-CP190-1');
    await crearOrdenRuteoPrueba(page, 'QA-CP190-2');
    evaluarAccion(Date.now() - tCrear, 'Crear 2 órdenes de ruteo de prueba');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#btn_routing_option', { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
    await page.waitForTimeout(5000);
    const idsDespues = await idsVisiblesSinFiltro(page);
    const idsPropios = idsDespues.filter(id => !idsAntes.includes(id));
    console.log('📋 IDs propios identificados por diferencia exacta:', JSON.stringify(idsPropios));
    if (idsPropios.length !== 2) { await screenshotOnFail(page, 'cp190-fail-diff-no-exacta'); throw new Error('La diferencia de IDs no dio exactamente 2 órdenes propias (dio ' + idsPropios.length + ')'); }

    // ── PARTE 1 (reversible, sin eliminar nada): "Seleccionar todos" marca TODO lo visible ──
    const totalVisibles = idsDespues.length;
    const tSeleccionar = Date.now();
    await page.evaluate(() => { if (typeof toggle_all_order_switches === 'function') toggle_all_order_switches(); });
    await page.waitForTimeout(1000);
    evaluarAccion(Date.now() - tSeleccionar, '"Seleccionar todos" sobre el tablero completo (validación de solo lectura)');
    const estadoTodos = await estadoCheckboxes(page, idsDespues);
    const marcadasTodos = estadoTodos.filter(c => c.checked).length;
    console.log('📋 "Seleccionar todos": ' + marcadasTodos + '/' + totalVisibles + ' checkboxes marcados (incluye órdenes ajenas — NUNCA se confirma "Eliminar" sobre este conjunto)');

    const menuLimpiar = await abrirMenuTablero(page, 'Limpiar selección');
    if (menuLimpiar) await clickMenuItem(page, 'Limpiar selección');
    await page.waitForTimeout(800);
    const estadoTrasLimpiar = await estadoCheckboxes(page, idsDespues);
    const marcadasTrasLimpiar = estadoTrasLimpiar.filter(c => c.checked).length;
    console.log('📋 Tras "Limpiar selección": ' + marcadasTrasLimpiar + '/' + totalVisibles + ' siguen marcados (se espera 0)');

    // Confirmar que ninguna orden fue afectada por la validación de solo lectura
    const idsIntactosTrasParte1 = await idsVisiblesSinFiltro(page);
    const todasSiguenExistiendo = idsDespues.every(id => idsIntactosTrasParte1.includes(id));

    // ── PARTE 2 (acción real confirmada): "Eliminar" SOLO sobre las 2 órdenes propias ──
    await marcarCheckbox(page, idsPropios[0], true);
    await marcarCheckbox(page, idsPropios[1], true);
    const tAccion = Date.now();
    const menuOk = await abrirMenuTablero(page, 'Eliminar');
    if (!menuOk) { await screenshotOnFail(page, 'cp190-fail-menu-no-abre'); throw new Error('El menú del tablero no se pudo abrir'); }
    await clickMenuItem(page, 'Eliminar');
    await page.waitForTimeout(1200);

    const confirmInfo = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const sw = Array.from(document.querySelectorAll('.sweet-alert')).find(isVis);
      return sw ? sw.textContent.replace(/\s+/g,' ').trim().substring(0,200) : null;
    });
    console.log('📋 Confirmación SweetAlert de "Eliminar" (solo 2 órdenes propias):', JSON.stringify(confirmInfo));
    if (!confirmInfo) { await screenshotOnFail(page, 'cp190-fail-sin-confirmacion'); throw new Error('No apareció ningún SweetAlert de confirmación al usar "Eliminar"'); }

    await page.evaluate(() => { document.querySelector('.sweet-alert .confirm, .sweet-alert button.confirm')?.click(); });
    evaluarAccion(Date.now() - tAccion, 'Eliminar 2 órdenes propias (no el conjunto de "Seleccionar todos")');
    await page.waitForTimeout(2500);

    const idsFinales = await idsVisiblesSinFiltro(page);
    const siguenExistiendo = idsPropios.filter(id => idsFinales.includes(id));
    const otrasAfectadas = idsAntes.filter(id => !idsFinales.includes(id));
    console.log('📋 IDs propios que aún existen tras eliminar (se espera vacío):', JSON.stringify(siguenExistiendo));
    console.log('📋 IDs preexistentes afectados inesperadamente (se espera vacío):', JSON.stringify(otrasAfectadas));

    // ── VALIDACIONES ──
    const v1 = marcadasTodos === totalVisibles;
    const v2 = marcadasTrasLimpiar === 0 && todasSiguenExistiendo;
    const v3 = /eliminar/i.test(confirmInfo);
    const v4 = siguenExistiendo.length === 0 && otrasAfectadas.length === 0;

    console.log('\n📊 === VALIDACIONES CP-190 ===');
    console.log('  "Seleccionar todos" marcó TODOS los checkboxes visibles (' + marcadasTodos + '/' + totalVisibles + '): ' + (v1 ? '✅' : '❌'));
    console.log('  "Limpiar selección" deshizo la selección sin eliminar ni afectar nada: ' + (v2 ? '✅' : '❌'));
    console.log('  Apareció el SweetAlert de confirmación correcto para "Eliminar":     ' + (v3 ? '✅' : '❌'));
    console.log('  Solo las 2 órdenes propias se eliminaron, ninguna otra fue afectada: ' + (v4 ? '✅' : '❌'));
    console.log('  ⚠️ NO probado deliberadamente: confirmar "Eliminar" sobre el conjunto completo de "Seleccionar todos" (borraría órdenes ajenas del ambiente QA compartido) — ver nota en el encabezado del archivo.');

    if (!v1) throw new Error('"Seleccionar todos" no marcó todos los checkboxes visibles (' + marcadasTodos + '/' + totalVisibles + ')');
    if (!v2) throw new Error('"Limpiar selección" no deshizo correctamente la selección amplia, o alguna orden fue afectada durante la validación de solo lectura');
    if (!v3) throw new Error('El SweetAlert de confirmación no tuvo el texto esperado sobre eliminar');
    if (!v4) throw new Error('El resultado final no coincide con lo esperado (propias restantes: ' + JSON.stringify(siguenExistiendo) + ', ajenas afectadas: ' + JSON.stringify(otrasAfectadas) + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-190 PASSED | "Seleccionar todos" marca correctamente todo lo visible (validado y deshecho de forma segura) + "Eliminar" confirmado solo sobre las 2 órdenes propias, sin afectar ninguna otra | validaciones: 4/4 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-190', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp190-fail');
    console.log('❌ CP-190 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-190', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp190_seleccionar_todos_eliminar();
