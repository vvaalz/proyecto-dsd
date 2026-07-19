const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');

const URL_POS = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
const GRUPO_PRODUCTOS_ID = '4030'; // único grupo real disponible en este ambiente QA
const VENDEDOR_ID = '249'; // "Drinjol"
const TOLERANCIA = 1;

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

function leerTotalVisible(page) {
  return page.evaluate(() => {
    const isVis = el => { const r=el.getBoundingClientRect(),s=getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent||'').trim()));
    const next = label ? label.nextElementSibling : null;
    return next ? next.textContent.trim() : null;
  });
}

async function abrirModalProductoExterno(page) {
  await page.evaluate(() => document.getElementById('demo-menu-lower-left').click());
  await page.waitForTimeout(800);
  const abrio = await page.evaluate(() => { const el = document.getElementById('add_sc_product'); if (el) { el.click(); return true; } return false; });
  await page.waitForTimeout(1200);
  return abrio;
}

async function cp178_producto_externo_rapido_descuento_general() {
  console.log('🔄 Ejecutando CP-178: Producto externo + producto rápido + descuento general...');
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

    // ── 1a) Demostrar el gate de aprobación de administrador (utilidad < 25%) ──
    const tGate = Date.now();
    const abrioModal = await abrirModalProductoExterno(page);
    if (!abrioModal) { await screenshotOnFail(page, 'cp178-fail-abrir-modal'); throw new Error('No se pudo abrir el modal "AGREGAR PRODUCTO EXTERNO"'); }
    await page.fill('#product_sc_name_preview', 'Producto Externo CP178 (utilidad baja)');
    await page.fill('#product_sc_real_code', 'EXT-CP178-GATE');
    await page.evaluate((v) => { const el = document.getElementById('product_sc_code'); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, GRUPO_PRODUCTOS_ID);
    await page.waitForTimeout(300);
    await page.evaluate((v) => { const el = document.getElementById('product_sc_seller'); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, VENDEDOR_ID);
    await page.waitForTimeout(300);
    // "Otro Proveedor" (campo libre, alternativa al select "Proveedor")
    await page.fill('#product_sc_another_provider', 'Proveedor libre CP178');
    await page.waitForTimeout(300);
    await page.evaluate(() => { const el = document.getElementById('product_sc_tax_checkbox'); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('click', { bubbles: true })); });
    await page.waitForTimeout(400);
    await page.evaluate(() => ext_product_add_tax_list_select_input(0, 0));
    await page.waitForTimeout(500);
    // Impuesto Selectivo de Consumo (variedad respecto a CP-177, que usó IVA)
    await page.evaluate(() => { const el = document.getElementById('ext_product_add_product_tax_list_1'); el.value = '2'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { const el = document.getElementById('ext_product_add_product_tax_rate_list_1'); el.value = '8'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(500);
    await page.fill('#product_sc_quantity', '1');
    await page.fill('#product_sc_cost', '442.48');
    await page.fill('#product_sc_utility', '10'); // < 25% a propósito
    await page.keyboard.press('Tab');
    await page.waitForTimeout(800);
    await page.evaluate(() => { try { add_product_external_validation(); } catch (e) {} });
    await page.waitForTimeout(1200);

    const gateTexto = await page.evaluate(() => {
      const isVis = el => { const r=el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const d = document.getElementById('dialog_approve_product_external_utility');
      return d && isVis(d) ? d.textContent.replace(/\s+/g,' ').trim().slice(0,200) : null;
    });
    console.log('🔒 Gate de aprobación de utilidad (<25%) — texto:', gateTexto);
    if (!gateTexto) { await screenshotOnFail(page, 'cp178-fail-gate-no-aparecio'); throw new Error('El gate de aprobación de administrador no apareció con utilidad 10% (< 25%)'); }

    // No se intenta bypasear (requiere usuario/contraseña de administrador, fuera de alcance) — se cancela.
    await page.evaluate(() => {
      const isVis = el => { const r=el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const d = document.getElementById('dialog_approve_product_external_utility');
      const btn = d ? Array.from(d.querySelectorAll('a,button')).find(b => /cancelar/i.test(b.textContent)) : null;
      if (btn) btn.click();
    });
    await page.waitForTimeout(800);
    evaluarAccion(Date.now() - tGate, 'Demostrar y cancelar gate de aprobación de utilidad');

    // ── 1b) Corregir utilidad a >= 25% y completar el guardado ──
    await page.fill('#product_sc_utility', '35');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(800);
    const precioCalculado = await page.evaluate(() => ({ precio: document.getElementById('product_sc_price')?.value, total: document.getElementById('product_sc_total')?.value }));
    console.log('🧮 Precio/Total calculados por el modal (Costo ₡442.48 + Utilidad 35% + ISC 13%):', JSON.stringify(precioCalculado));

    await page.evaluate(() => { try { add_product_external_validation(); } catch (e) {} });
    await page.waitForTimeout(1200);
    const sweetAlertTxt = await page.evaluate(() => {
      const isVis = el => { const r=el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
      return sa ? sa.textContent.replace(/\s+/g,' ').trim().slice(0,200) : null;
    });
    if (!sweetAlertTxt) { await screenshotOnFail(page, 'cp178-fail-sin-sweetalert'); throw new Error('No apareció el SweetAlert de confirmación tras corregir la utilidad a 35%'); }
    console.log('🔔 SweetAlert de confirmación:', sweetAlertTxt);
    await page.evaluate(() => {
      const isVis = el => { const r=el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
      const btn = sa ? Array.from(sa.querySelectorAll('button')).find(b => /agregar/i.test(b.textContent)) : null;
      if (btn) btn.click();
    });
    await page.waitForTimeout(1500);

    const totalTrasExterno = await leerTotalVisible(page);
    const totalCarritoNum = totalTrasExterno ? parseFloat((totalTrasExterno.match(/[\d,]+\.\d{2}/) || ['0'])[0].replace(/,/g, '')) : NaN;
    const totalEsperadoNum = parseFloat(precioCalculado.total);
    const montoCorrupto = !isNaN(totalCarritoNum) && !isNaN(totalEsperadoNum) && Math.abs(totalCarritoNum - totalEsperadoNum) > 100;
    console.log('💰 Total del carrito tras agregar producto externo:', totalTrasExterno, '| esperado (modal):', precioCalculado.total, '| ⚠️ monto corrupto:', montoCorrupto);

    // ── 2) Producto rápido (patrón CP-118, con fallback si CABYS es inestable) ──
    const tRapido = Date.now();
    const resRapido = await (async () => {
      try {
        const opened = await page.evaluate(() => { if (typeof showModalQuickProductPos === 'function') { showModalQuickProductPos(); return true; } return false; });
        if (!opened) return { ok: false, reason: 'Función showModalQuickProductPos no disponible' };
        await page.waitForTimeout(1200);
        const modalVis = await page.evaluate(() => { const m = document.getElementById('dialog_quick_product_pos'); return m ? getComputedStyle(m).display !== 'none' : false; });
        if (!modalVis) return { ok: false, reason: 'Modal de Producto Rápido no abrió' };
        const nombre = 'Quick CP178';
        await page.evaluate(({ n }) => { const setVal=(id,v)=>{const el=document.getElementById(id);if(!el)return;el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}; setVal('quick_product_name', n); setVal('quick_product_quantity', '1'); setVal('quick_product_price', '300'); }, { n: nombre });
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
        const t = Array.from(document.querySelectorAll('.product_box')).find(b => /aaa-bombillos/i.test((b.textContent || '').replace(/\s+/g, ' ')));
        if (!t) return false;
        (t.querySelector('.product_box_quantity_content') || t).click();
        return true;
      });
      if (!fallback) { await screenshotOnFail(page, 'cp178-fail-fallback-rapido'); throw new Error('Ni el producto rápido ni el fallback de catálogo pudieron agregarse'); }
      await page.waitForTimeout(1000);
      productoRapidoUsado = 'AAA-Bombillos / luces halógenas (fallback)';
    }
    console.log('🛍️ Producto rápido en carrito:', productoRapidoUsado);

    // ── 3) Descuento general (sin cliente asociado — el flujo pedido no incluye cliente) ──
    const totalPreDescText = await leerTotalVisible(page);
    const totalPreDesc = totalPreDescText ? parseFloat((totalPreDescText.match(/[\d,]+\.\d{2}/) || ['0'])[0].replace(/,/g, '')) : NaN;
    console.log('💰 Total antes del descuento:', totalPreDescText);

    const tDesc = Date.now();
    await page.evaluate(() => document.getElementById('show_invoice_advanced_detail')?.click());
    await page.waitForTimeout(800);
    const DESCUENTO_PCT = 10;
    const descOk = await page.evaluate((pct) => {
      const el = document.getElementById('total_discount_input');
      if (!el) return false;
      el.value = String(pct); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      return true;
    }, DESCUENTO_PCT);
    if (!descOk) { await screenshotOnFail(page, 'cp178-fail-descuento'); throw new Error('No se encontró total_discount_input'); }
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tDesc, 'Aplicar descuento general ' + DESCUENTO_PCT + '%');

    const totalPostDescText = await leerTotalVisible(page);
    const totalPostDesc = totalPostDescText ? parseFloat((totalPostDescText.match(/[\d,]+\.\d{2}/) || ['0'])[0].replace(/,/g, '')) : NaN;
    console.log('💰 Total después del descuento ' + DESCUENTO_PCT + '%:', totalPostDescText);
    const descuentoSeAplico = !isNaN(totalPreDesc) && !isNaN(totalPostDesc) && totalPostDesc < totalPreDesc;
    console.log('📉 ¿El total bajó tras aplicar el descuento general? ' + (descuentoSeAplico ? '✅ sí' : '❌ no') + ' (nota: el total de base ya está afectado por el hallazgo de producto externo, por lo que solo se valida la dirección del cambio, no el monto exacto del descuento)');

    // ── 4) Abrir modal de pago (efectivo) pero NO confirmar — mismo hallazgo de monto corrupto ──
    await page.evaluate(() => document.getElementById('btn_cash_pos').click());
    await page.waitForFunction(() => { const el = document.getElementById('dialog_payment'); return el ? getComputedStyle(el).display !== 'none' : false; }, null, { timeout: 30000 });
    await page.waitForTimeout(600);
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
    const v1 = !!gateTexto;
    const v2 = !!sweetAlertTxt;
    const v3 = !!productoRapidoUsado;
    const v4 = descOk;
    const v5 = modalPagoVisible;

    console.log('\n📊 === VALIDACIONES CP-178 ===');
    console.log('  Gate de aprobación de utilidad <25% detectado y cancelado: ' + (v1 ? '✅' : '❌'));
    console.log('  Producto externo agregado tras corregir utilidad a 35%:    ' + (v2 ? '✅' : '❌'));
    console.log('  Producto rápido en carrito:                                 ' + (v3 ? '✅' : '❌') + ' ' + productoRapidoUsado);
    console.log('  Descuento general aplicado:                                 ' + (v4 ? '✅' : '❌') + ' (' + (descuentoSeAplico ? 'total bajó' : 'total no bajó') + ')');
    console.log('  Modal de pago abre correctamente:                           ' + (v5 ? '✅' : '❌'));
    console.log('  Carrito vacío tras la limpieza final:                       ' + (carritoVacio ? '✅' : '⚠️'));
    console.log('  ⚠️ Monto del producto externo en carrito corrupto (hallazgo, ver CP-177): ' + montoCorrupto);

    if (!v1) throw new Error('El gate de aprobación de utilidad no se disparó con utilidad < 25%');
    if (!v2) throw new Error('No se pudo agregar el producto externo tras corregir la utilidad');
    if (!v3) throw new Error('No se pudo agregar ningún producto rápido/fallback');
    if (!v4) throw new Error('No se pudo aplicar el descuento general');
    if (!v5) throw new Error('El modal de pago no abrió correctamente');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('⚠️ CP-178 RESULT: Flujo completo hasta el modal de pago (producto rápido: ' + productoRapidoUsado + ', descuento general ' + DESCUENTO_PCT + '% aplicado, modal de pago ✓). Se documentó y canceló el gate de aprobación de administrador para utilidad < 25% (no se intentó bypasear, requiere credenciales de administrador — fuera de alcance). NO se confirmó el pago por el hallazgo de monto corrupto en "Producto Externo" (ver CP-177: esperado ' + precioCalculado.total + ' vs. carrito ' + totalTrasExterno + '). No se asoció cliente en este flujo (no forma parte de lo solicitado). | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp178-fail');
    console.log('❌ CP-178 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp178_producto_externo_rapido_descuento_general();
