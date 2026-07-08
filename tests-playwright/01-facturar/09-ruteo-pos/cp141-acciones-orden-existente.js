const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const OBSERVACION = 'Orden de ruteo CP-141 ' + Date.now();

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
    console.log('⚠️ Sesión expirada (redirect a /log/login) — regenerando y reintentando...');
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

async function cp141_acciones_orden_existente() {
  console.log('🔄 Ejecutando CP-141: Acciones sobre una orden de ruteo existente (Ver / Marcar como EN CAMINO)...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, POS_URL));
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 180000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector('.product_box', { timeout: 60000 });
    await page.evaluate(() => { window.print = () => {}; });
    evaluarCargaPagina(Date.now() - t0, 'Carga POS');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { window.print = () => {}; });

    // ── Crear una orden de ruteo propia y aislada para esta prueba ──
    const producto = await page.evaluate(() => {
      const box = Array.from(document.querySelectorAll('.product_box')).find(b => /aaa-mult[ií]metro/i.test((b.textContent||'').replace(/\s+/g,' ')));
      if (!box) return false;
      (box.querySelector('.product_box_quantity_content') || box).click();
      return true;
    });
    if (!producto) { await screenshotOnFail(page, 'cp141-fail-producto'); throw new Error('No se pudo agregar un producto al carrito'); }
    await page.waitForTimeout(1000);

    await page.evaluate(() => { try { create_routing_order(); } catch (e) {} });
    await page.waitForSelector('#dialog_add_routing_order', { timeout: 10000 });
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
      const sel = document.getElementById('send_routing_order_route');
      const opcion = sel ? Array.from(sel.options).find(o => o.value && o.value !== '0') : null;
      if (opcion) { sel.value = opcion.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.evaluate(() => {
      const sel = document.getElementById('send_routing_order_agent_assigned');
      const opcion = sel ? Array.from(sel.options).find(o => o.value && o.value !== '0') : null;
      if (opcion) { sel.value = opcion.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    });

    // Asociar cliente — sin esto el envío puede fallar silenciosamente (hallazgo de CP-138/142)
    await page.fill('#search_routing_customer_send_sale', 'valentina');
    await page.waitForTimeout(800);
    await page.evaluate(() => { try { get_customer_by_pos_option(0); } catch (e) {} });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      const sel = document.getElementById('payment_send_routing_order_client');
      const opcion = sel ? Array.from(sel.options).find(o => o.value && o.value !== '' && o.value !== '0') : null;
      if (opcion) { sel.value = opcion.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(500);

    await page.fill('#send_routing_order_observation', OBSERVACION);
    await page.waitForTimeout(500);

    await page.evaluate(() => { document.getElementById('send_routing_order')?.click(); });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
      if (!sa) return;
      const btnEnviar = Array.from(sa.querySelectorAll('button')).filter(isVis).find(b => /^\s*enviar\s*$/i.test((b.textContent||'').trim()));
      if (btnEnviar) btnEnviar.click();
    });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
      if (sa) { const btn = sa.querySelector('button.confirm') || sa.querySelector('button'); if (btn) btn.click(); }
    });
    await page.waitForTimeout(1500);
    console.log('🆕 Orden de ruteo creada:', OBSERVACION);

    // ── Ir al tab Ruteo y localizar la tarjeta por su observación ──
    await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
    await page.waitForTimeout(4000);
    for (let i = 0; i < 15; i++) {
      const hay = await page.evaluate(() => document.querySelectorAll('[id^="brand_"]').length > 0);
      if (hay) break;
      await page.waitForTimeout(1000);
    }

    const busqueda = await page.evaluate((obs) => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const tarjetas = Array.from(document.querySelectorAll('[id^="brand_"]')).filter(isVis);
      const valores = tarjetas.map(t => {
        const ta = t.querySelector('textarea[id^="pos_routing_order_observation_"]');
        return { brandId: t.id, obsValue: ta ? ta.value : null };
      });
      const tarjeta = tarjetas.find(t => (t.textContent || '').includes(obs));
      return { ordenId: tarjeta ? tarjeta.id.replace('brand_', '') : null, valores };
    }, OBSERVACION);
    console.log('🆔 ID de la orden creada:', busqueda.ordenId);
    console.log('🔍 Observaciones de todas las tarjetas visibles:', JSON.stringify(busqueda.valores));
    const ordenId = busqueda.ordenId;
    if (!ordenId) { await screenshotOnFail(page, 'cp141-fail-sin-tarjeta'); throw new Error('No se encontró la tarjeta de la orden recién creada en el tablero'); }

    // ── Acción 1: "Ver órden" (show_routing_order_detail) — no destructiva ──
    const tVer = Date.now();
    const verAbrio = await page.evaluate((id) => {
      try { show_routing_order_detail(id); return true; } catch (e) { return false; }
    }, parseInt(ordenId, 10));
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tVer, 'Ver órden');
    const detalleAbierto = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const modal = Array.from(document.querySelectorAll('[id*="dialog"], [id*="modal"], .modal')).filter(isVis)[0];
      return modal ? modal.id : null;
    });
    console.log('👁️ "Ver órden" ejecutó:', verAbrio, '| modal/detalle detectado:', detalleAbierto);
    // Cerrar cualquier modal de detalle abierto
    await page.keyboard.press('Escape').catch(() => {});
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('[data-dismiss="modal"], .btn_close_payment_modal')).filter(isVis)[0];
      if (btn) btn.click();
    });
    await page.waitForTimeout(1000);

    // ── Acción 2: "Marcar como EN CAMINO" (change_routing_order_status) ──
    const tEstado = Date.now();
    const cambioEjecutado = await page.evaluate((id) => {
      try { change_routing_order_status(id, 2); return true; } catch (e) { return false; }
    }, parseInt(ordenId, 10));
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tEstado, 'Marcar como EN CAMINO');
    // Puede aparecer un sweet-alert de confirmación
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
      if (sa) { const btn = sa.querySelector('button.confirm') || sa.querySelector('button'); if (btn) btn.click(); }
    });
    await page.waitForTimeout(1500);
    console.log('🚚 "Marcar como EN CAMINO" ejecutó:', cambioEjecutado);

    // ── Verificar que la orden se movió de "Pendientes" a "En Camino" ──
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { window.print = () => {}; });
    await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
    await page.waitForTimeout(4000);

    await page.evaluate(() => { document.getElementById('filter_routing_order_btn_pending')?.click(); });
    await page.waitForTimeout(2000);
    const sigueEnPendientes = await page.evaluate((id) => !!document.getElementById('brand_' + id), ordenId);

    await page.evaluate(() => { document.getElementById('filter_routing_order_btn_in_route')?.click(); });
    await page.waitForTimeout(2000);
    const apareceEnCamino = await page.evaluate((id) => !!document.getElementById('brand_' + id), ordenId);

    console.log('🔎 Orden en filtro "Pendientes" tras el cambio:', sigueEnPendientes);
    console.log('🔎 Orden en filtro "En Camino" tras el cambio:', apareceEnCamino);

    // ── VALIDACIONES ──
    const v1 = !!ordenId;
    const v2 = verAbrio;
    const v3 = cambioEjecutado;
    const v4 = apareceEnCamino;
    const v5 = !sigueEnPendientes;

    console.log('\n📊 === VALIDACIONES CP-141 ===');
    console.log('  Orden de prueba creada y localizada:      ' + (v1 ? '✅' : '❌') + ' (id ' + ordenId + ')');
    console.log('  "Ver órden" ejecuta sin error:             ' + (v2 ? '✅' : '❌'));
    console.log('  "Marcar como EN CAMINO" ejecuta sin error: ' + (v3 ? '✅' : '❌'));
    console.log('  Orden aparece en filtro "En Camino":       ' + (v4 ? '✅' : '❌'));
    console.log('  Orden ya NO aparece en "Pendientes":       ' + (v5 ? '✅' : '❌'));

    if (!v1) throw new Error('No se pudo localizar la orden de prueba creada');
    if (!v2) throw new Error('La acción "Ver órden" lanzó un error');
    if (!v3) throw new Error('La acción "Marcar como EN CAMINO" lanzó un error');
    if (!v4) throw new Error('La orden no aparece en el filtro "En Camino" tras cambiar su estado');
    if (!v5) throw new Error('La orden sigue apareciendo en "Pendientes" tras cambiar su estado a EN CAMINO');

    console.log('✅ CP-141 PASSED | orden id: ' + ordenId + ' | estado final: EN CAMINO | validaciones: 5/5');

  } catch (error) {
    await screenshotOnFail(page, 'cp141-fail');
    console.log('❌ CP-141 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp141_acciones_orden_existente();
