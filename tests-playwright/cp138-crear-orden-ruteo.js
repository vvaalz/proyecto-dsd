const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../auth/usar-sesion');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const OBSERVACION = 'Orden de ruteo de prueba CP-138 ' + Date.now();

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

async function cp138_crear_orden_ruteo() {
  console.log('🔄 Ejecutando CP-138: Crear una Orden de Ruteo completa desde el POS...');
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

    // ── Agregar 3 productos distintos ──
    const productos = [];
    for (const src of ['aaa-mult', 'aaa-bombillos', 'aaa-filtros de combustible']) {
      const added = await page.evaluate((s) => {
        const box = Array.from(document.querySelectorAll('.product_box')).find(b => new RegExp(s,'i').test((b.textContent||'').replace(/\s+/g,' ')));
        if (!box) return false;
        (box.querySelector('.product_box_quantity_content') || box).click();
        return true;
      }, src);
      if (added) { productos.push(src); await page.waitForTimeout(900); }
    }
    console.log('🛍️ Productos agregados:', JSON.stringify(productos));
    if (productos.length < 2) { await screenshotOnFail(page, 'cp138-fail-productos'); throw new Error('No se agregaron suficientes productos'); }

    // ── Abrir "Orden de ruteo" desde el menú de 3 puntos superior derecho ──
    const tAbrir = Date.now();
    await page.evaluate(() => { try { create_routing_order(); } catch (e) {} });
    await page.waitForSelector('#dialog_add_routing_order', { timeout: 10000 });
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tAbrir, 'Abrir modal Orden de ruteo');

    const totalTxt = await page.evaluate(() => document.getElementById('total_routing_order_txt')?.textContent.trim() || null);
    console.log('💰 Total de la orden:', totalTxt);

    // ── Asignar ruta (select oculto tipo Chosen) ──
    const rutaSeleccionada = await page.evaluate(() => {
      const sel = document.getElementById('send_routing_order_route');
      const opcion = sel ? Array.from(sel.options).find(o => o.value && o.value !== '0') : null;
      if (!opcion) return null;
      sel.value = opcion.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.jQuery && jQuery(sel).data('chosen')) jQuery(sel).trigger('chosen:updated');
      return opcion.textContent.trim();
    });
    console.log('📍 Ruta asignada:', rutaSeleccionada);

    // ── Asignar repartidor (select oculto tipo Chosen) ──
    const repartidorSeleccionado = await page.evaluate(() => {
      const sel = document.getElementById('send_routing_order_agent_assigned');
      const opcion = sel ? Array.from(sel.options).find(o => o.value && o.value !== '0') : null;
      if (!opcion) return null;
      sel.value = opcion.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.jQuery && jQuery(sel).data('chosen')) jQuery(sel).trigger('chosen:updated');
      return opcion.textContent.trim();
    });
    console.log('🚚 Repartidor asignado:', repartidorSeleccionado);

    // ── Buscar y asociar cliente ──
    // La búsqueda puebla el <select> oculto con resultados — hay que elegir una opción real
    // después, no alcanza con solo buscar (queda con value="" si no se selecciona ninguna)
    await page.fill('#search_routing_customer_send_sale', 'valentina');
    await page.waitForTimeout(800);
    await page.evaluate(() => { try { get_customer_by_pos_option(0); } catch (e) {} });
    await page.waitForTimeout(2000);
    const clienteAsociado = await page.evaluate(() => {
      const sel = document.getElementById('payment_send_routing_order_client');
      if (!sel) return null;
      const opcion = Array.from(sel.options).find(o => o.value && o.value !== '' && o.value !== '0');
      if (!opcion) return { value: sel.value, opciones: sel.options.length, seleccionado: null };
      sel.value = opcion.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.jQuery && jQuery(sel).data('chosen')) jQuery(sel).trigger('chosen:updated');
      return { value: sel.value, opciones: sel.options.length, seleccionado: opcion.textContent.trim() };
    });
    console.log('👤 Cliente asociado:', JSON.stringify(clienteAsociado));
    await page.waitForTimeout(500);

    // ── Completar observaciones ──
    await page.fill('#send_routing_order_observation', OBSERVACION);
    await page.waitForTimeout(300);

    // ── Enviar la orden ──
    const tEnviar = Date.now();
    await page.evaluate(() => { document.getElementById('send_routing_order')?.click(); });
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tEnviar, 'Enviar Orden de ruteo');

    // Confirmar el SweetAlert "¿Enviar órden a ruteo?" — tiene botones "Cancelar" y "Enviar",
    // hay que clickear "Enviar" específicamente (un selector genérico puede pegarle a "Cancelar"
    // si viene primero en el DOM, mismo hallazgo que en otros modales de confirmación del POS)
    const sweetAlertTxt = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
      if (!sa) return null;
      const texto = sa.textContent.replace(/\s+/g,' ').trim().substring(0,150);
      const btnEnviar = Array.from(sa.querySelectorAll('button')).filter(isVis).find(b => /^\s*enviar\s*$/i.test((b.textContent||'').trim()));
      if (btnEnviar) btnEnviar.click();
      return texto;
    });
    console.log('🔔 SweetAlert tras enviar:', sweetAlertTxt);
    await page.waitForTimeout(2000);

    // Puede aparecer un segundo sweet-alert de éxito/confirmación final
    const sweetAlert2Txt = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
      if (!sa) return null;
      const texto = sa.textContent.replace(/\s+/g,' ').trim().substring(0,150);
      const btn = sa.querySelector('button.confirm') || Array.from(sa.querySelectorAll('button')).filter(isVis)[0];
      if (btn) btn.click();
      return texto;
    });
    console.log('🔔 SweetAlert #2 tras enviar:', sweetAlert2Txt);
    await page.waitForTimeout(1500);

    const modalCerrado = await page.evaluate(() => {
      const m = document.getElementById('dialog_add_routing_order');
      return !m || window.getComputedStyle(m).display === 'none';
    });
    console.log('🪟 Modal cerrado tras enviar:', modalCerrado);

    const carritoVacio = await page.evaluate(() => (document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0) === 0);
    console.log('🛒 Carrito vacío tras enviar:', carritoVacio);

    // ── Verificar que la orden aparece en el tab Ruteo con la observación ──
    await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
    await page.waitForTimeout(4000);
    const ordenEncontrada = await page.evaluate((obs) => document.body.textContent.includes(obs), OBSERVACION);
    console.log('🔎 Orden nueva visible en el tablero (por observación):', ordenEncontrada);

    // ── VALIDACIONES ──
    const v1 = !!rutaSeleccionada;
    const v2 = !!repartidorSeleccionado;
    const v3 = modalCerrado;
    const v4 = ordenEncontrada;

    console.log('\n📊 === VALIDACIONES CP-138 ===');
    console.log('  Ruta asignada en el formulario:        ' + (v1 ? '✅' : '❌') + ' ' + rutaSeleccionada);
    console.log('  Repartidor asignado en el formulario:  ' + (v2 ? '✅' : '❌') + ' ' + repartidorSeleccionado);
    console.log('  Modal se cerró tras enviar:              ' + (v3 ? '✅' : '❌'));
    console.log('  Orden nueva visible en el tablero:       ' + (v4 ? '✅' : '❌'));

    if (!v1) throw new Error('No se pudo asignar una ruta en el formulario');
    if (!v2) throw new Error('No se pudo asignar un repartidor en el formulario');
    if (!v3) throw new Error('El modal de Orden de ruteo no se cerró tras enviar');
    if (!v4) throw new Error('La orden nueva no aparece en el tablero de Ruteo tras crearla');

    console.log('✅ CP-138 PASSED | total: ' + totalTxt + ' | ruta: ' + rutaSeleccionada + ' | repartidor: ' + repartidorSeleccionado + ' | validaciones: 4/4');

  } catch (error) {
    await screenshotOnFail(page, 'cp138-fail');
    console.log('❌ CP-138 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp138_crear_orden_ruteo();
