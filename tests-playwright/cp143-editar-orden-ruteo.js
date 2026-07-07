const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../auth/usar-sesion');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const OBS_ORIGINAL = 'Orden de ruteo CP-143 ORIGINAL ' + Date.now();
const OBS_EDITADA = OBS_ORIGINAL + ' EDITADA';

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
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

async function confirmarSweetAlertEnviar(page) {
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
}

async function abrirTabRuteoYEsperar(page) {
  await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
  await page.waitForTimeout(4000);
  for (let i = 0; i < 15; i++) {
    const hay = await page.evaluate(() => document.querySelectorAll('[id^="brand_"]').length > 0);
    if (hay) break;
    await page.waitForTimeout(1000);
  }
}

async function crearOrdenRuteo(page, observacion) {
  await page.evaluate(() => { document.getElementById('btn_pos_option')?.click(); });
  await page.waitForSelector('#product_search', { state: 'attached', timeout: 15000 });
  await page.waitForTimeout(1500);

  const producto = await page.evaluate(() => {
    const box = Array.from(document.querySelectorAll('.product_box')).find(b => /aaa-mult[ií]metro/i.test((b.textContent||'').replace(/\s+/g,' ')));
    if (!box) return false;
    (box.querySelector('.product_box_quantity_content') || box).click();
    return true;
  });
  if (!producto) throw new Error('No se pudo agregar un producto al carrito');
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

  await page.fill('#send_routing_order_observation', observacion);
  await page.waitForTimeout(500);

  await page.evaluate(() => { document.getElementById('send_routing_order')?.click(); });
  await confirmarSweetAlertEnviar(page);

  await abrirTabRuteoYEsperar(page);
  const ordenId = await page.evaluate((obs) => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const tarjeta = Array.from(document.querySelectorAll('[id^="brand_"]')).filter(isVis).find(t => (t.textContent||'').includes(obs));
    return tarjeta ? tarjeta.id.replace('brand_', '') : null;
  }, observacion);
  return ordenId;
}

async function cp143_editar_orden_ruteo() {
  console.log('🔄 Ejecutando CP-143: Editar una orden de ruteo existente (dentro del POS)...');
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

    // ── Crear una orden de ruteo propia para esta prueba ──
    const ordenId = await crearOrdenRuteo(page, OBS_ORIGINAL);
    console.log('🆕 Orden creada, id:', ordenId, '| observación original:', OBS_ORIGINAL);
    if (!ordenId) { await screenshotOnFail(page, 'cp143-fail-sin-orden'); throw new Error('No se pudo crear ni localizar la orden de prueba'); }

    // Repartidor original asignado (para comparar tras editar)
    const repartidorOriginal = await page.evaluate((id) => {
      const tarjeta = document.getElementById('brand_' + id);
      const match = tarjeta ? tarjeta.textContent.match(/Repartidor:\s*([^\n]+)/i) : null;
      return match ? match[1].trim() : null;
    }, ordenId);
    console.log('🚚 Repartidor original:', repartidorOriginal);

    // ── Abrir "Editar órden" desde el menú more_vert de la tarjeta ──
    const tEditar = Date.now();
    const abrioEdicion = await page.evaluate((id) => {
      try { show_create_routing_order_modal(id); return true; } catch (e) { return false; }
    }, parseInt(ordenId, 10));
    await page.waitForSelector('#dialog_add_routing_order', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tEditar, 'Abrir "Editar órden"');
    console.log('🖊️ show_create_routing_order_modal ejecutó:', abrioEdicion);

    const modalAbierto = await page.evaluate(() => {
      const m = document.getElementById('dialog_add_routing_order');
      return m ? window.getComputedStyle(m).display !== 'none' : false;
    });
    console.log('🪟 Modal de edición abierto:', modalAbierto);
    if (!modalAbierto) { await screenshotOnFail(page, 'cp143-fail-modal-no-abrio'); throw new Error('El modal de edición no se abrió con show_create_routing_order_modal()'); }

    // ── Verificar que el formulario viene pre-poblado con los datos de la orden ──
    const estadoPrellenado = await page.evaluate(() => ({
      observacion: document.getElementById('send_routing_order_observation')?.value || null,
      ruta: document.getElementById('send_routing_order_route')?.value || null,
      repartidor: document.getElementById('send_routing_order_agent_assigned')?.value || null
    }));
    console.log('📋 Formulario pre-poblado al editar:', JSON.stringify(estadoPrellenado));

    // ── Modificar la observación ──
    await page.evaluate((texto) => {
      const el = document.getElementById('send_routing_order_observation');
      if (el) { el.value = texto; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, OBS_EDITADA);
    await page.waitForTimeout(500);

    // ── Guardar el cambio (mismo botón "Enviar Orden") ──
    await page.evaluate(() => { document.getElementById('send_routing_order')?.click(); });
    await confirmarSweetAlertEnviar(page);

    // ── Verificar el cambio en el tablero ──
    await abrirTabRuteoYEsperar(page);
    const textoTarjeta = await page.evaluate((id) => {
      const tarjeta = document.getElementById('brand_' + id);
      return tarjeta ? tarjeta.textContent.replace(/\s+/g,' ').trim() : null;
    }, ordenId);
    const tieneObsEditada = textoTarjeta ? textoTarjeta.includes(OBS_EDITADA) : false;
    const tieneObsOriginalSinEditar = textoTarjeta ? (textoTarjeta.includes(OBS_ORIGINAL) && !textoTarjeta.includes(OBS_EDITADA)) : false;
    console.log('🔎 Tarjeta contiene observación editada:', tieneObsEditada);
    console.log('🔎 Tarjeta contiene SOLO la observación original (sin editar):', tieneObsOriginalSinEditar);

    // ── VALIDACIONES ──
    const v1 = !!ordenId;
    const v2 = modalAbierto;
    const v3 = estadoPrellenado.observacion === OBS_ORIGINAL;
    const v4 = tieneObsEditada;

    console.log('\n📊 === VALIDACIONES CP-143 ===');
    console.log('  Orden de prueba creada y localizada:      ' + (v1 ? '✅' : '❌') + ' (id ' + ordenId + ')');
    console.log('  Modal de edición abre correctamente:       ' + (v2 ? '✅' : '❌'));
    console.log('  Formulario viene pre-poblado con datos:    ' + (v3 ? '✅' : '⚠️') + ' (' + estadoPrellenado.observacion + ')');
    console.log('  Cambio de observación se refleja al guardar: ' + (v4 ? '✅' : '❌'));

    if (!v1) throw new Error('No se pudo crear/localizar la orden de prueba');
    if (!v2) throw new Error('El modal de edición no abrió');
    if (!v4) throw new Error('El cambio de observación no se reflejó en la tarjeta tras guardar (esperado: "' + OBS_EDITADA + '")');

    const pasadas = [v1,v2,v3,v4].filter(Boolean).length;
    console.log('✅ CP-143 PASSED | orden id: ' + ordenId + ' | observación editada correctamente | validaciones: ' + pasadas + '/4');

  } catch (error) {
    await screenshotOnFail(page, 'cp143-fail');
    console.log('❌ CP-143 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp143_editar_orden_ruteo();
