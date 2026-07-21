const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const POS_URL = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
// Tablero de Ruteo — selección múltiple + "Cambiar Repartidor" en lote. El checkbox real de
// selección por orden es #select_order_remove_<ID> (patrón checkbox-slider, igual que en Panel de
// Control: requiere .checked + dispatchEvent('change'/'click'), no un click normal — el botón
// visible "Seleccionar órden" en cada tarjeta es un mecanismo DISTINTO, solo resalta la tarjeta).
//
// ⚠️ Aislamiento por ID exacto, NO por fecha (lección de un incidente real, ver CLAUDE_CONTEXT.md
// sección 15): se compara la lista COMPLETA de IDs visibles en el tablero antes y después de crear
// las órdenes de prueba — la diferencia exacta son las órdenes propias. Filtrar por "fecha de
// creación = hoy" NO es seguro en este ambiente: otras órdenes preexistentes también muestran
// "hoy" como fecha, y un CP anterior que usó ese filtro para su limpieza automática eliminó 9
// órdenes ajenas por error. Esta versión nunca opera sobre nada que no esté en el diff exacto.

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
  // otro) al llamar esta función, el pane está oculto y el click no agrega nada al carrito
  // (carrito queda en ₡0.00, create_routing_order() no abre el modal). Volver siempre al tab
  // de facturación antes de agregar el producto.
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

// Elimina EXCLUSIVAMENTE los IDs pasados explícitamente — nunca vuelve a calcular qué borrar
// por su cuenta (ver hallazgo de aislamiento por fecha en el encabezado del archivo).
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

async function cp186_cambiar_repartidor_en_lote() {
  console.log('🔄 Ejecutando CP-186: Tablero de Ruteo — selección múltiple + "Cambiar Repartidor" en lote...');
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

    // ── Snapshot de IDs ANTES de crear nada ──
    await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
    await page.waitForTimeout(5000);
    const idsAntes = await idsVisiblesSinFiltro(page);
    console.log('📋 IDs visibles ANTES de crear las órdenes de prueba:', idsAntes.length);

    const tCrear = Date.now();
    const repartidor1 = await crearOrdenRuteoPrueba(page, 'QA-CP186-1');
    await crearOrdenRuteoPrueba(page, 'QA-CP186-2');
    evaluarAccion(Date.now() - tCrear, 'Crear 2 órdenes de ruteo de prueba');
    console.log('📋 Repartidor original asignado a ambas órdenes:', repartidor1);

    // Refresco completo (no solo re-click en el tab) para asegurar que el tablero recargue
    // desde cero — un simple click en #btn_routing_option puede no re-disparar la carga AJAX
    // si el tab quedó marcado "activo" internamente tras el flujo de creación de la orden.
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#btn_routing_option', { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
    await page.waitForTimeout(5000);
    const idsDespues = await idsVisiblesSinFiltro(page);
    idsPropios = idsDespues.filter(id => !idsAntes.includes(id));
    console.log('📋 IDs propios identificados por diferencia exacta (antes vs. después):', JSON.stringify(idsPropios));
    if (idsPropios.length !== 2) { await screenshotOnFail(page, 'cp186-fail-diff-no-exacta'); throw new Error('La diferencia de IDs no dio exactamente 2 órdenes propias (dio ' + idsPropios.length + ') — se aborta sin tocar nada'); }

    await marcarCheckbox(page, idsPropios[0], true);
    await marcarCheckbox(page, idsPropios[1], true);

    const tAccion = Date.now();
    const menuOk = await abrirMenuTablero(page, 'Cambiar Repartidor');
    if (!menuOk) { await screenshotOnFail(page, 'cp186-fail-menu-no-abre'); throw new Error('El menú del tablero no se pudo abrir'); }
    await clickMenuItem(page, 'Cambiar Repartidor');
    await page.waitForTimeout(1000);

    // Escopar el modal por el select único #modal_new_agent_select (no por clase genérica
    // "modal"/"[class*=modal]" — esa clase también matchea contenedores de avisos/notificaciones
    // no relacionados que a veces quedan superpuestos, capturando texto de OTRO elemento).
    const infoModal = await page.evaluate(() => {
      const sel = document.getElementById('modal_new_agent_select');
      const m = sel ? sel.closest('.modal') : null;
      if (!m) return null;
      return { texto: m.textContent.replace(/\s+/g,' ').trim().substring(0,300), opciones: Array.from(sel.options).map(o => o.textContent.trim()) };
    });
    console.log('📋 Modal "Cambiar Repartidor":', JSON.stringify(infoModal));
    if (!infoModal) { await screenshotOnFail(page, 'cp186-fail-sin-modal'); throw new Error('No apareció el modal "Cambiar Repartidor de Órdenes"'); }

    const nuevoRepartidor = await page.evaluate((original) => {
      const sel = document.getElementById('modal_new_agent_select');
      const opt = Array.from(sel.options).find(o => o.value && o.value !== '0' && o.value !== '' && o.textContent.trim() !== original);
      if (!opt) return null;
      sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true }));
      return opt.textContent.trim();
    }, repartidor1);
    console.log('📋 Nuevo repartidor elegido (distinto al original):', nuevoRepartidor);
    if (!nuevoRepartidor) { await screenshotOnFail(page, 'cp186-fail-sin-opcion-repartidor'); throw new Error('No se encontró una opción de repartidor distinta a la original'); }

    await page.evaluate(() => {
      const sel = document.getElementById('modal_new_agent_select');
      const m = sel ? sel.closest('.modal') : null;
      const btn = m ? Array.from(m.querySelectorAll('button')).find(b => b.textContent.trim() === 'Guardar') : null;
      btn?.click();
    });
    evaluarAccion(Date.now() - tAccion, 'Cambiar repartidor en lote (2 órdenes propias)');
    await page.waitForTimeout(2500);

    // ── Verificar persistencia tras refrescar ──
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#btn_routing_option', { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
    await page.waitForTimeout(4000);
    const repartidoresTrasCambio = await page.evaluate((ids) => ids.map(id => {
      const card = document.querySelector(`.pos_order_list_item_content_id_${id}`);
      const m = card ? card.textContent.match(/Repartidor:\s*([^\n]+?)(?=\s{2,}|$)/) : null;
      return { id, repartidor: m ? m[1].trim().substring(0, 60) : null };
    }), idsPropios);
    console.log('📋 Repartidor de cada orden propia tras refrescar:', JSON.stringify(repartidoresTrasCambio));

    const ambasCambiaron = repartidoresTrasCambio.length === 2 && repartidoresTrasCambio.every(r => r.repartidor && r.repartidor.includes(nuevoRepartidor.split(' ')[0]));

    // ── VALIDACIONES ──
    const v1 = idsPropios.length === 2;
    const v2 = /Seleccionadas 2/.test(infoModal.texto);
    const v3 = !!nuevoRepartidor;
    const v4 = ambasCambiaron;

    console.log('\n📊 === VALIDACIONES CP-186 ===');
    console.log('  Se identificaron exactamente 2 órdenes propias (diff de IDs): ' + (v1 ? '✅' : '❌'));
    console.log('  El modal refleja "Seleccionadas 2":                     ' + (v2 ? '✅' : '❌'));
    console.log('  Se pudo elegir un repartidor distinto al original:      ' + (v3 ? '✅' : '❌'));
    console.log('  El repartidor nuevo persiste en AMBAS órdenes tras refrescar: ' + (v4 ? '✅' : '❌ (' + JSON.stringify(repartidoresTrasCambio) + ')'));

    if (!v1) throw new Error('La diferencia de IDs no dio exactamente 2 órdenes propias');
    if (!v2) throw new Error('El modal no reflejó "Seleccionadas 2"');
    if (!v3) throw new Error('No se encontró un repartidor distinto al original para probar el cambio');
    if (!v4) throw new Error('El repartidor nuevo no persistió en ambas órdenes tras refrescar la página');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-186 PASSED | repartidor cambiado en lote de "' + repartidor1 + '" a "' + nuevoRepartidor + '" en las 2 órdenes propias (' + JSON.stringify(idsPropios) + '), persistido tras refrescar | validaciones: 4/4 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-186', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

    await eliminarOrdenesPorId(page, idsPropios);

  } catch (error) {
    await screenshotOnFail(page, 'cp186-fail');
    console.log('❌ CP-186 FAILED: ' + error.message);
    if (page && idsPropios.length > 0) await eliminarOrdenesPorId(page, idsPropios);
    registrarResultado({ cp: 'CP-186', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp186_cambiar_repartidor_en_lote();
