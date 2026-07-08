const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const OBSERVACION = 'Orden de ruteo CP-144 ' + Date.now();

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

async function confirmarSweetAlertSiAparece(page) {
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
    const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
    if (sa) { const btn = sa.querySelector('button.confirm') || sa.querySelector('button'); if (btn) btn.click(); }
  });
  await page.waitForTimeout(1000);
}

async function abrirTabRuteoYEsperar(page) {
  await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
  await page.waitForTimeout(4000);
  for (let i = 0; i < 15; i++) {
    const listo = await page.evaluate(() => document.getElementById('filter_routing_order_btn_all') !== null);
    if (listo) break;
    await page.waitForTimeout(500);
  }
}

async function cp144_marcar_entregado() {
  console.log('🔄 Ejecutando CP-144: Marcar una orden de ruteo como ENTREGADO (dentro del POS)...');
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
    if (!producto) { await screenshotOnFail(page, 'cp144-fail-producto'); throw new Error('No se pudo agregar un producto al carrito'); }
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
    await confirmarSweetAlertSiAparece(page);
    console.log('🆕 Orden de ruteo creada:', OBSERVACION);

    // ── Localizar la tarjeta recién creada en el tablero ──
    await abrirTabRuteoYEsperar(page);
    const ordenId = await page.evaluate((obs) => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const tarjeta = Array.from(document.querySelectorAll('[id^="brand_"]')).filter(isVis).find(t => (t.textContent || '').includes(obs));
      return tarjeta ? tarjeta.id.replace('brand_', '') : null;
    }, OBSERVACION);
    console.log('🆔 ID de la orden creada:', ordenId);
    if (!ordenId) { await screenshotOnFail(page, 'cp144-fail-sin-tarjeta'); throw new Error('No se encontró la tarjeta de la orden recién creada en el tablero'); }

    // ── Paso 1: Marcar como EN CAMINO (requisito previo observado en CP-141) ──
    const tEnCamino = Date.now();
    const enCaminoEjecutado = await page.evaluate((id) => {
      try { change_routing_order_status(id, 2); return true; } catch (e) { return false; }
    }, parseInt(ordenId, 10));
    await confirmarSweetAlertSiAparece(page);
    evaluarAccion(Date.now() - tEnCamino, 'Marcar como EN CAMINO');
    console.log('🚚 "Marcar como EN CAMINO" ejecutó:', enCaminoEjecutado);

    // ── Paso 2: Marcar como ENTREGADO ──
    const tEntregado = Date.now();
    const entregadoEjecutado = await page.evaluate((id) => {
      try { change_routing_order_status(id, 3); return true; } catch (e) { return false; }
    }, parseInt(ordenId, 10));
    await confirmarSweetAlertSiAparece(page);
    evaluarAccion(Date.now() - tEntregado, 'Marcar como ENTREGADO');
    console.log('📦 "Marcar como ENTREGADO" ejecutó:', entregadoEjecutado);

    // ── Verificar el cambio de estado en el tablero (tras refrescar) ──
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { window.print = () => {}; });
    await abrirTabRuteoYEsperar(page);

    await page.evaluate(() => { document.getElementById('filter_routing_order_btn_pending')?.click(); });
    await page.waitForTimeout(2000);
    const enPendientes = await page.evaluate((id) => !!document.getElementById('brand_' + id), ordenId);

    await page.evaluate(() => { document.getElementById('filter_routing_order_btn_in_route')?.click(); });
    await page.waitForTimeout(2000);
    const enCamino = await page.evaluate((id) => !!document.getElementById('brand_' + id), ordenId);

    const filtroEntregadoId = await page.evaluate(() => {
      const candidatos = ['filter_routing_order_btn_delivered', 'filter_routing_order_btn_completed', 'filter_routing_order_btn_finished'];
      return candidatos.find(id => document.getElementById(id) !== null) || null;
    });
    console.log('🔎 ID del botón de filtro "Entregado" detectado:', filtroEntregadoId);
    let enEntregado = false;
    if (filtroEntregadoId) {
      await page.evaluate((id) => { document.getElementById(id)?.click(); }, filtroEntregadoId);
      await page.waitForTimeout(2000);
      enEntregado = await page.evaluate((id) => !!document.getElementById('brand_' + id), ordenId);
    } else {
      // Filtro "Todos" + inspección del estado dentro de la tarjeta como respaldo
      await page.evaluate(() => { document.getElementById('filter_routing_order_btn_all')?.click(); });
      await page.waitForTimeout(2000);
      enEntregado = await page.evaluate((id) => {
        const t = document.getElementById('brand_' + id);
        return t ? /entregad/i.test(t.textContent || '') : false;
      }, ordenId);
    }

    console.log('🔎 Orden en filtro "Pendientes" tras marcar ENTREGADO:', enPendientes);
    console.log('🔎 Orden en filtro "En Camino" tras marcar ENTREGADO:', enCamino);
    console.log('🔎 Orden en filtro/estado "Entregado":', enEntregado);

    // ── VALIDACIONES ──
    const v1 = !!ordenId;
    const v2 = enCaminoEjecutado;
    const v3 = entregadoEjecutado;
    const v4 = enEntregado;
    const v5 = !enPendientes && !enCamino;

    console.log('\n📊 === VALIDACIONES CP-144 ===');
    console.log('  Orden de prueba creada y localizada:        ' + (v1 ? '✅' : '❌') + ' (id ' + ordenId + ')');
    console.log('  "Marcar como EN CAMINO" ejecuta sin error:   ' + (v2 ? '✅' : '❌'));
    console.log('  "Marcar como ENTREGADO" ejecuta sin error:   ' + (v3 ? '✅' : '❌'));
    console.log('  Orden aparece como ENTREGADO en el tablero:  ' + (v4 ? '✅' : '❌'));
    console.log('  Orden ya NO aparece en Pendientes/En Camino: ' + (v5 ? '✅' : '❌'));

    if (!v1) throw new Error('No se pudo localizar la orden de prueba creada');
    if (!v2) throw new Error('La acción "Marcar como EN CAMINO" lanzó un error');
    if (!v3) throw new Error('La acción "Marcar como ENTREGADO" lanzó un error');
    if (!v4) throw new Error('La orden no aparece como ENTREGADO en el tablero tras el cambio de estado');
    if (!v5) throw new Error('La orden sigue apareciendo en Pendientes o En Camino tras marcarla como ENTREGADO');

    console.log('✅ CP-144 PASSED | orden id: ' + ordenId + ' | estado final: ENTREGADO | validaciones: 5/5');

  } catch (error) {
    await screenshotOnFail(page, 'cp144-fail');
    console.log('❌ CP-144 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp144_marcar_entregado();
