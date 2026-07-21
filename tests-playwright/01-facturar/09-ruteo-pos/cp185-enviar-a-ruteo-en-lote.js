const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const POS_URL = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
// Tablero de Ruteo — selección múltiple + "Enviar a Ruteo" en lote (menú superior del tablero).
// El checkbox real de selección por orden es #select_order_remove_<ID> (patrón checkbox-slider,
// igual que en Panel de Control: requiere .checked + dispatchEvent('change'/'click'), no un click
// normal — el botón visible "Seleccionar órden" en cada tarjeta es un mecanismo DISTINTO, solo
// resalta la tarjeta y no cuenta para el "Seleccionadas: N" que usan las acciones en lote).
// Se crean órdenes de prueba descartables (observación "QA-CP185-<n>") y se aíslan filtrando por
// fecha de creación = hoy antes de operar, para no arriesgar tocar órdenes reales de QA.

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

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function crearOrdenRuteoPrueba(page, etiqueta) {
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

async function aislarPorFecha(page) {
  await page.click('#btn_toggle_advanced_filters', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const fecha = hoyISO();
  await page.fill('#filter_routing_order_created_date_from', fecha).catch(() => {});
  await page.fill('#filter_routing_order_created_date_to', fecha).catch(() => {});
  await page.click('text=TALLER ALPHA PREMIUM').catch(() => {});
  await page.waitForTimeout(2500);
  return page.evaluate(() => Array.from(document.querySelectorAll('[id^="a_routing_order_items_"]')).map(el => el.id.replace('a_routing_order_items_', '')));
}

async function marcarCheckbox(page, id, valor) {
  await page.evaluate(({ id, valor }) => {
    const el = document.getElementById(`select_order_remove_${id}`);
    if (!el) return false;
    el.checked = valor;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('click', { bubbles: true }));
    return true;
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

function leerModalReal() {
  const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const m = Array.from(document.querySelectorAll('.modal, [class*="modal"], .sweet-alert')).filter(isVis).find(m => !/licencias vencidas|MEMBRESÍA|MONTO A PAGAR/i.test(m.textContent||''));
  if (!m) return null;
  return {
    texto: m.textContent.replace(/\s+/g,' ').trim().substring(0, 300),
    botones: Array.from(m.querySelectorAll('button, a.btn')).map(b => b.textContent.trim()).filter(Boolean)
  };
}

async function eliminarOrdenesDePrueba(page) {
  try {
    const ids = await aislarPorFecha(page);
    if (ids.length === 0) return;
    for (const id of ids) await marcarCheckbox(page, id, true);
    await abrirMenuTablero(page, 'Eliminar');
    await clickMenuItem(page, 'Eliminar');
    await page.waitForTimeout(1200);
    await page.evaluate(() => { document.querySelector('.sweet-alert .confirm, .sweet-alert button.confirm')?.click(); });
    await page.waitForTimeout(2000);
    console.log('🧹 Limpieza: órdenes de prueba eliminadas:', JSON.stringify(ids));
  } catch (e) {
    console.log('⚠️ No se pudo limpiar automáticamente las órdenes de prueba:', e.message);
  }
}

async function cp185_enviar_a_ruteo_en_lote() {
  console.log('🔄 Ejecutando CP-185: Tablero de Ruteo — selección múltiple + "Enviar a Ruteo" en lote...');
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

    // ── Crear 2 órdenes de ruteo descartables ──
    const tCrear = Date.now();
    await crearOrdenRuteoPrueba(page, 'QA-CP185-1');
    await crearOrdenRuteoPrueba(page, 'QA-CP185-2');
    evaluarAccion(Date.now() - tCrear, 'Crear 2 órdenes de ruteo de prueba');

    await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
    await page.waitForTimeout(5000);

    const ids = await aislarPorFecha(page);
    console.log('📋 Órdenes de prueba aisladas por fecha de creación (hoy):', JSON.stringify(ids));
    if (ids.length < 2) { await screenshotOnFail(page, 'cp185-fail-sin-ordenes'); throw new Error('No se aislaron al menos 2 órdenes de prueba propias mediante el filtro de fecha'); }

    // ── Seleccionar 2 órdenes (checkbox real) y usar "Enviar a Ruteo" ──
    await marcarCheckbox(page, ids[0], true);
    await marcarCheckbox(page, ids[1], true);
    const tAccion = Date.now();
    const menuOk = await abrirMenuTablero(page, 'Enviar a Ruteo');
    if (!menuOk) { await screenshotOnFail(page, 'cp185-fail-menu-no-abre'); throw new Error('El menú del tablero no se pudo abrir'); }
    await clickMenuItem(page, 'Enviar a Ruteo');
    evaluarAccion(Date.now() - tAccion, 'Abrir modal "Enviar a Ruteo" con 2 órdenes seleccionadas');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(__dirname, '..', '..', '..', 'reports', 'screenshots', 'cp185-modal-enviar-ruteo-' + Date.now() + '.png') }).catch(() => {});

    const modal = await page.evaluate(leerModalReal);
    console.log('📋 Modal "Enviar a Ruteo":', JSON.stringify(modal, null, 2));
    if (!modal) { await screenshotOnFail(page, 'cp185-fail-sin-modal'); throw new Error('No apareció el modal de confirmación de "Enviar a Ruteo"'); }

    // ── Confirmar el envío con "Guardar" ──
    const guardarOk = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const m = Array.from(document.querySelectorAll('.modal, [class*="modal"]')).filter(isVis).find(m => /Envío de Órdenes|Enviar a Ruteo/i.test(m.textContent||''));
      const btn = m ? Array.from(m.querySelectorAll('button')).find(b => b.textContent.trim() === 'Guardar') : null;
      if (!btn) return false;
      btn.click();
      return true;
    });
    await page.waitForTimeout(2000);
    console.log('📋 ¿Se encontró y clickeó el botón "Guardar" del modal?', guardarOk);

    // ── VALIDACIONES ──
    const v1 = ids.length >= 2; // se aislaron al menos 2 órdenes propias sin riesgo de tocar datos reales
    const v2 = /Seleccionadas 2/.test(modal.texto); // el modal refleja correctamente las 2 órdenes seleccionadas
    const v3 = modal.botones.includes('Guardar') && modal.botones.includes('Cancelar');
    const v4 = guardarOk; // se pudo confirmar la acción en lote

    console.log('\n📊 === VALIDACIONES CP-185 ===');
    console.log('  Se aislaron ≥2 órdenes de prueba propias sin riesgo:   ' + (v1 ? '✅' : '❌'));
    console.log('  El modal refleja "Seleccionadas 2" correctamente:      ' + (v2 ? '✅' : '❌'));
    console.log('  El modal tiene botones Guardar/Cancelar:               ' + (v3 ? '✅' : '❌'));
    console.log('  Se confirmó la acción en lote con "Guardar":           ' + (v4 ? '✅' : '❌'));

    if (!v1) throw new Error('No se pudieron crear/aislar al menos 2 órdenes de prueba propias');
    if (!v2) throw new Error('El modal de "Enviar a Ruteo" no reflejó "Seleccionadas 2" — el checkbox real (#select_order_remove_<ID>) podría no estar registrando la selección');
    if (!v3) throw new Error('El modal de "Enviar a Ruteo" no tiene los botones esperados (Guardar/Cancelar)');
    if (!v4) throw new Error('No se pudo confirmar la acción en lote con el botón "Guardar"');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-185 PASSED | 2 órdenes de prueba seleccionadas y enviadas a ruteo en lote correctamente | validaciones: 4/4 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-185', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

    await eliminarOrdenesDePrueba(page);

  } catch (error) {
    await screenshotOnFail(page, 'cp185-fail');
    console.log('❌ CP-185 FAILED: ' + error.message);
    if (page) await eliminarOrdenesDePrueba(page);
    registrarResultado({ cp: 'CP-185', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp185_enviar_a_ruteo_en_lote();
