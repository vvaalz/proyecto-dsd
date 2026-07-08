const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const OBSERVACION = 'Orden de ruteo CP-145 DESCARTABLE ' + Date.now();

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

async function cp145_eliminar_orden_ruteo() {
  console.log('🔄 Ejecutando CP-145: Eliminar una orden de ruteo existente (dentro del POS)...');
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

    // ── Crear una orden de ruteo dedicada y descartable, exclusiva para este CP ──
    const producto = await page.evaluate(() => {
      const box = Array.from(document.querySelectorAll('.product_box')).find(b => /aaa-mult[ií]metro/i.test((b.textContent||'').replace(/\s+/g,' ')));
      if (!box) return false;
      (box.querySelector('.product_box_quantity_content') || box).click();
      return true;
    });
    if (!producto) { await screenshotOnFail(page, 'cp145-fail-producto'); throw new Error('No se pudo agregar un producto al carrito'); }
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
    console.log('🆕 Orden de ruteo descartable creada:', OBSERVACION);

    // ── Localizar la tarjeta recién creada en el tablero ──
    await abrirTabRuteoYEsperar(page);
    const ordenId = await page.evaluate((obs) => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const tarjeta = Array.from(document.querySelectorAll('[id^="brand_"]')).filter(isVis).find(t => (t.textContent || '').includes(obs));
      return tarjeta ? tarjeta.id.replace('brand_', '') : null;
    }, OBSERVACION);
    console.log('🆔 ID de la orden creada:', ordenId);
    if (!ordenId) { await screenshotOnFail(page, 'cp145-fail-sin-tarjeta'); throw new Error('No se encontró la tarjeta de la orden recién creada en el tablero'); }

    // ── Confirmar presencia ANTES de eliminar ──
    await page.evaluate(() => { document.getElementById('filter_routing_order_btn_all')?.click(); });
    await page.waitForTimeout(1500);
    const presenteAntes = await page.evaluate((id) => !!document.getElementById('brand_' + id), ordenId);
    console.log('🔎 Orden presente en el tablero ANTES de eliminar:', presenteAntes);

    // ── Acción: "Eliminar órden" (show_confirm_delete_routing_order) ──
    const tEliminar = Date.now();
    const eliminarEjecutado = await page.evaluate((id) => {
      try { show_confirm_delete_routing_order(id); return true; } catch (e) { return false; }
    }, parseInt(ordenId, 10));
    await page.waitForTimeout(1500);
    console.log('🗑️ show_confirm_delete_routing_order ejecutó:', eliminarEjecutado);

    const dialogoTexto = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
      return sa ? sa.textContent.replace(/\s+/g,' ').trim().substring(0,200) : null;
    });
    console.log('🔔 Diálogo de confirmación:', dialogoTexto);

    let responsePromise = page.waitForResponse(r => /route\/(deleteRoutingOrder|routing.*delete|delete.*routing)/i.test(r.url()), { timeout: 8000 }).catch(() => null);

    // Confirmar por texto exacto (Eliminar/Confirmar/Sí, siguiendo el patrón de otros deletes del sistema — nunca un selector genérico que pueda pegarle a Cancelar)
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
      if (!sa) return;
      const btn = Array.from(sa.querySelectorAll('button')).filter(isVis).find(b => /^\s*(eliminar|confirmar|s[ií]|aceptar)\s*$/i.test((b.textContent||'').trim()))
        || sa.querySelector('button.confirm');
      if (btn) btn.click();
    });
    const respuestaDelete = await responsePromise;
    if (respuestaDelete) console.log('🌐 Respuesta de red al eliminar:', respuestaDelete.status(), respuestaDelete.url());
    await confirmarSweetAlertSiAparece(page);
    evaluarAccion(Date.now() - tEliminar, 'Eliminar orden de ruteo');

    // ── Verificar que la orden ya no aparece (tras refrescar) ──
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { window.print = () => {}; });
    await abrirTabRuteoYEsperar(page);
    await page.evaluate(() => { document.getElementById('filter_routing_order_btn_all')?.click(); });
    await page.waitForTimeout(2000);

    const presenteDespues = await page.evaluate((id) => !!document.getElementById('brand_' + id), ordenId);
    const observacionSigueEnTablero = await page.evaluate((obs) => document.body.textContent.includes(obs), OBSERVACION);
    console.log('🔎 Orden presente en el tablero DESPUÉS de eliminar:', presenteDespues);
    console.log('🔎 Observación de la orden sigue visible en el tablero:', observacionSigueEnTablero);

    // ── VALIDACIONES ──
    const v1 = !!ordenId;
    const v2 = presenteAntes;
    const v3 = eliminarEjecutado;
    const v4 = !presenteDespues;
    const v5 = !observacionSigueEnTablero;

    console.log('\n📊 === VALIDACIONES CP-145 ===');
    console.log('  Orden descartable creada y localizada:      ' + (v1 ? '✅' : '❌') + ' (id ' + ordenId + ')');
    console.log('  Orden presente en el tablero antes de borrar: ' + (v2 ? '✅' : '❌'));
    console.log('  "Eliminar órden" ejecuta sin error:          ' + (v3 ? '✅' : '❌'));
    console.log('  Tarjeta ya NO aparece tras eliminar:         ' + (v4 ? '✅' : '❌'));
    console.log('  Observación ya NO aparece en el tablero:     ' + (v5 ? '✅' : '❌'));

    if (!v1) throw new Error('No se pudo crear/localizar la orden de prueba descartable');
    if (!v2) throw new Error('La orden no aparecía en el tablero antes de intentar eliminarla');
    if (!v3) throw new Error('La acción "Eliminar órden" lanzó un error');
    if (!v4) throw new Error('La tarjeta de la orden sigue apareciendo en el tablero tras eliminarla');
    if (!v5) throw new Error('La observación de la orden eliminada sigue visible en el tablero');

    console.log('✅ CP-145 PASSED | orden id: ' + ordenId + ' | eliminada correctamente | validaciones: 5/5');

  } catch (error) {
    await screenshotOnFail(page, 'cp145-fail');
    console.log('❌ CP-145 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp145_eliminar_orden_ruteo();
