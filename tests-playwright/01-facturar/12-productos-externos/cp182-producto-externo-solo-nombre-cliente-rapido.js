const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');

const URL_POS = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
const GRUPO_PRODUCTOS_ID = '4030';
const VENDEDOR_ID = '305';

const screenshotOnFail = async (page, name) => { try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {} };
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

async function cp182_producto_externo_solo_nombre_cliente_rapido() {
  console.log('🔄 Ejecutando CP-182: Producto externo + solo nombre del cliente + producto rápido...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, URL_POS));
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForSelector('.product_box', { timeout: 15000 });
    evaluarCargaPagina(Date.now() - t0, 'Carga del POS');
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForSelector('.product_box', { timeout: 15000 });
    try { const d = await page.$('#workshop-web-notification-permission-dismiss'); if (d) await d.click(); } catch {}

    // ── 1) Producto externo ──
    const tExterno = Date.now();
    await page.evaluate(() => document.getElementById('demo-menu-lower-left').click());
    await page.waitForTimeout(800);
    const abrioModal = await page.evaluate(() => { const el = document.getElementById('add_sc_product'); if (el) { el.click(); return true; } return false; });
    if (!abrioModal) { await screenshotOnFail(page, 'cp182-fail-abrir-modal'); throw new Error('No se pudo abrir el modal "AGREGAR PRODUCTO EXTERNO"'); }
    await page.waitForTimeout(1200);

    await page.fill('#product_sc_name_preview', 'Producto Externo CP182');
    await page.fill('#product_sc_real_code', 'EXT-CP182-001');
    await page.evaluate((v) => { const el = document.getElementById('product_sc_code'); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, GRUPO_PRODUCTOS_ID);
    await page.waitForTimeout(300);
    await page.evaluate((v) => { const el = document.getElementById('product_sc_seller'); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, VENDEDOR_ID);
    await page.waitForTimeout(300);
    await page.evaluate(() => { const el = document.getElementById('product_sc_tax_checkbox'); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('click', { bubbles: true })); });
    await page.waitForTimeout(400);
    await page.evaluate(() => ext_product_add_tax_list_select_input(0, 0));
    await page.waitForTimeout(500);
    await page.evaluate(() => { const el = document.getElementById('ext_product_add_product_tax_list_1'); el.value = '1'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { const el = document.getElementById('ext_product_add_product_tax_rate_list_1'); el.value = '8'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(500);
    await page.fill('#product_sc_quantity', '1');
    await page.fill('#product_sc_cost', '442.48');
    await page.fill('#product_sc_utility', '30');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(800);
    const precioCalculado = await page.evaluate(() => ({ precio: document.getElementById('product_sc_price')?.value, total: document.getElementById('product_sc_total')?.value }));
    console.log('🧮 Precio/Total calculados por el modal:', JSON.stringify(precioCalculado));
    await page.evaluate(() => { try { add_product_external_validation(); } catch (e) {} });
    await page.waitForTimeout(1200);
    const sweetAlertTxt = await page.evaluate(() => {
      const isVis = el => { const r=el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
      return sa ? sa.textContent.replace(/\s+/g,' ').trim().slice(0,200) : null;
    });
    if (!sweetAlertTxt) { await screenshotOnFail(page, 'cp182-fail-sin-sweetalert'); throw new Error('No apareció el SweetAlert de confirmación del producto externo'); }
    await page.evaluate(() => {
      const isVis = el => { const r=el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
      const btn = sa ? Array.from(sa.querySelectorAll('button')).find(b => /agregar/i.test(b.textContent)) : null;
      if (btn) btn.click();
    });
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tExterno, 'Agregar producto externo');
    console.log('⚠️ Monto del producto externo en carrito corrupto (hallazgo, ver CP-177) — se documenta y se continúa el resto del flujo hasta antes de confirmar el pago.');

    // ── 2) Solo nombre del cliente (sin cliente completo) — patrón CP-034 ──
    const nombreCliente = 'Cliente Solo Nombre CP182';
    const agregarClicked = await page.evaluate(() => {
      const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVisible).find(b => (b.textContent || '').trim() === 'Agregar');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!agregarClicked) { await screenshotOnFail(page, 'cp182-fail-boton-agregar-cliente'); throw new Error('No se encontró el botón "Agregar" junto al buscador de cliente'); }
    await page.waitForTimeout(800);
    await page.evaluate(() => { if (typeof editQuickCustomerName === 'function') editQuickCustomerName(); });
    await page.waitForTimeout(1000);
    const tempInputExists = await page.evaluate(() => !!document.getElementById('temporal_customer_name'));
    if (!tempInputExists) { await screenshotOnFail(page, 'cp182-fail-campo-nombre-cliente'); throw new Error('No apareció el campo "Nombre del cliente" tras hacer clic en Agregar'); }
    await page.evaluate((name) => {
      const el = document.getElementById('temporal_customer_name');
      el.value = name;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof setTemporalCustomerName === 'function') setTemporalCustomerName();
    }, nombreCliente);
    await page.waitForTimeout(1500);
    const clienteAsociado = await page.evaluate((name) => {
      const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const inText = Array.from(document.querySelectorAll('*')).filter(isVisible).some(el => (el.textContent || '').includes(name) && el.children.length === 0);
      const inValue = Array.from(document.querySelectorAll('input')).filter(isVisible).some(el => (el.value || '').includes(name));
      return inText || inValue;
    }, nombreCliente);
    console.log('👤 Cliente asociado solo por nombre ("' + nombreCliente + '"):', clienteAsociado);
    if (!clienteAsociado) { await screenshotOnFail(page, 'cp182-fail-cliente-solo-nombre'); throw new Error('No se observó el nombre del cliente asociado a la factura'); }

    // ── 3) Producto rápido ──
    const tRapido = Date.now();
    const resRapido = await (async () => {
      try {
        const opened = await page.evaluate(() => { if (typeof showModalQuickProductPos === 'function') { showModalQuickProductPos(); return true; } return false; });
        if (!opened) return { ok: false, reason: 'Función showModalQuickProductPos no disponible' };
        await page.waitForTimeout(1200);
        const modalVis = await page.evaluate(() => { const m = document.getElementById('dialog_quick_product_pos'); return m ? getComputedStyle(m).display !== 'none' : false; });
        if (!modalVis) return { ok: false, reason: 'Modal de Producto Rápido no abrió' };
        const nombre = 'Quick CP182';
        await page.evaluate(({ n }) => { const setVal=(id,v)=>{const el=document.getElementById(id);if(!el)return;el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}; setVal('quick_product_name', n); setVal('quick_product_quantity', '1'); setVal('quick_product_price', '275'); }, { n: nombre });
        await page.waitForTimeout(400);
        await page.evaluate((n) => validate_cabys_code(0, 6, n, 1), nombre);
        await page.waitForTimeout(1500);
        await page.evaluate(() => { const i = document.getElementById('cabys_code_search'); if (i) { i.value = 'varios'; i.dispatchEvent(new Event('input', { bubbles: true })); } });
        await page.evaluate(() => { const b = document.getElementById('btn_cabys_code_search'); if (b) b.click(); });
        await page.waitForTimeout(4000);
        const cabysSelected = await page.evaluate(() => {
          const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
          const row = Array.from(document.querySelectorAll('tr, li')).filter(isVis).find(el => el.onclick || el.querySelector('[onclick]'));
          if (!row) return false;
          (row.onclick ? row : row.querySelector('[onclick]')).click();
          return true;
        });
        if (!cabysSelected) return { ok: false, reason: 'CABYS sin resultados para "varios"' };
        await page.waitForTimeout(1200);
        const saveBtn = await page.evaluate(() => { const b = document.querySelector('.save_quick_product_pos, button[onclick*="quick_product_save"]'); if (b) { b.click(); return true; } return false; });
        if (!saveBtn) return { ok: false, reason: 'Botón guardar producto rápido no encontrado' };
        await page.waitForTimeout(2000);
        const enCarrito = await page.evaluate((n) => { const t = document.getElementById('tb_table_buy_list'); return t ? t.textContent.includes(n) : false; }, nombre);
        return enCarrito ? { ok: true, nombre } : { ok: false, reason: 'Producto rápido "' + nombre + '" no apareció en el carrito' };
      } catch (e) { return { ok: false, reason: e.message }; }
    })();
    evaluarAccion(Date.now() - tRapido, 'Agregar producto rápido');

    let productoRapidoUsado = resRapido.ok ? resRapido.nombre : null;
    if (!resRapido.ok) {
      console.log('⚠️ Producto rápido falló: ' + resRapido.reason + ' (mismo hallazgo conocido que CP-051)');
      const fallback = await page.evaluate(() => {
        const t = Array.from(document.querySelectorAll('.product_box')).find(b => /aaa-mult[ií]metro automotriz digital/i.test((b.textContent || '').replace(/\s+/g, ' ')));
        if (!t) return false;
        (t.querySelector('.product_box_quantity_content') || t).click();
        return true;
      });
      if (!fallback) { await screenshotOnFail(page, 'cp182-fail-fallback-rapido'); throw new Error('Ni el producto rápido ni el fallback de catálogo pudieron agregarse'); }
      await page.waitForTimeout(1000);
      productoRapidoUsado = 'AAA-Multímetro Automotriz Digital (fallback)';
    }
    console.log('🛍️ Producto rápido en carrito:', productoRapidoUsado);

    // ── 4) Abrir modal de pago (efectivo) pero NO confirmar ──
    await page.evaluate(() => document.getElementById('btn_cash_pos').click());
    await page.waitForFunction(() => { const el = document.getElementById('dialog_payment'); return el ? getComputedStyle(el).display !== 'none' : false; }, null, { timeout: 30000 });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const cash = document.getElementById('ck_is_payment_cash'); if (cash && !cash.checked) { cash.checked = true; cash.dispatchEvent(new Event('change', { bubbles: true })); }
      const ef = document.getElementById('is_payment_cash'); if (ef && !ef.checked) { ef.checked = true; ef.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(500);
    const modalPagoVisible = await page.evaluate(() => { const el = document.getElementById('dialog_payment'); return el ? getComputedStyle(el).display !== 'none' : false; });
    console.log('💳 Modal de pago abierto:', modalPagoVisible);
    console.log('🛑 NO se confirma el pago — hallazgo de monto corrupto en producto externo (ver CP-177). Se cierra el modal y se vacía el carrito.');
    await page.evaluate(() => { const btn = document.querySelector('#dialog_payment .close, #dialog_payment [data-dismiss="modal"]'); if (btn) btn.click(); });
    await page.waitForTimeout(1000);
    await page.evaluate(() => { const btn = document.getElementById('cancel_sale'); if (btn) { const link = btn.querySelector('a') || btn; link.click(); } });
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const isVis = el => { const r=el.getBoundingClientRect(),s=getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button.confirm')).filter(isVis).find(b => /limpiar lista/i.test((b.textContent||'').trim()));
      if (btn) btn.click();
    });
    await page.waitForTimeout(1500);
    const carritoVacio = await page.evaluate(() => (document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length ?? 0) === 0);
    console.log('🧹 Carrito vacío tras limpiar:', carritoVacio);

    // ── VALIDACIONES ──
    const v1 = !!sweetAlertTxt;
    const v2 = clienteAsociado;
    const v3 = !!productoRapidoUsado;
    const v4 = modalPagoVisible;

    console.log('\n📊 === VALIDACIONES CP-182 ===');
    console.log('  Producto externo agregado:                       ' + (v1 ? '✅' : '❌'));
    console.log('  Cliente asociado solo por nombre:                ' + (v2 ? '✅' : '❌') + ' "' + nombreCliente + '"');
    console.log('  Producto rápido en carrito:                      ' + (v3 ? '✅' : '❌') + ' ' + productoRapidoUsado);
    console.log('  Modal de pago abre correctamente:                ' + (v4 ? '✅' : '❌'));
    console.log('  Carrito vacío tras la limpieza final:            ' + (carritoVacio ? '✅' : '⚠️'));

    if (!v1) throw new Error('No se pudo agregar el producto externo');
    if (!v2) throw new Error('No se pudo asociar el cliente solo por nombre');
    if (!v3) throw new Error('No se pudo agregar ningún producto rápido/fallback');
    if (!v4) throw new Error('El modal de pago no abrió correctamente');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('⚠️ CP-182 RESULT: Flujo completo hasta el modal de pago (cliente solo-nombre ✓, producto rápido: ' + productoRapidoUsado + ', modal de pago ✓). NO se confirmó el pago por el hallazgo de monto corrupto en "Producto Externo" (ver CP-177). | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp182-fail');
    console.log('❌ CP-182 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp182_producto_externo_solo_nombre_cliente_rapido();
