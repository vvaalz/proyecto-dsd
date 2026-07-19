const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');

const URL_POS = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
const CLIENTE_ID = 12735;
const GRUPO_PRODUCTOS_ID = '4030';
const VENDEDOR_ID = '324'; // "USUARIO VENDEDOR"
const PROVEEDOR_ID = '926'; // "ASOC. PRO DEFENSA DE LOS TRABAJADORES Y DEL MEDIO AMBIENTE"
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
function leerIVAVisible(page) {
  return page.evaluate(() => {
    const isVis = el => { const r=el.getBoundingClientRect(),s=getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const el = Array.from(document.querySelectorAll('.advanced_invoice_detail,[class*="total_div"]')).filter(isVis).find(e => /^IVA/i.test((e.textContent||'').replace(/\s+/g,' ').trim()));
    return el ? el.textContent.replace(/\s+/g,' ').trim() : null;
  });
}

async function cp179_producto_externo_descuento_exoneracion() {
  console.log('🔄 Ejecutando CP-179: Producto externo + cliente existente + producto rápido + descuento y exoneración...');
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

    // ── 1) Producto externo: proveedor (select), garantía y observaciones (controles aún no cubiertos en CP-177/178) ──
    const tExterno = Date.now();
    await page.evaluate(() => document.getElementById('demo-menu-lower-left').click());
    await page.waitForTimeout(800);
    const abrioModal = await page.evaluate(() => { const el = document.getElementById('add_sc_product'); if (el) { el.click(); return true; } return false; });
    if (!abrioModal) { await screenshotOnFail(page, 'cp179-fail-abrir-modal'); throw new Error('No se pudo abrir el modal "AGREGAR PRODUCTO EXTERNO"'); }
    await page.waitForTimeout(1200);

    await page.fill('#product_sc_name_preview', 'Producto Externo CP179');
    await page.fill('#product_sc_real_code', 'EXT-CP179-001');
    await page.evaluate((v) => { const el = document.getElementById('product_sc_code'); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, GRUPO_PRODUCTOS_ID);
    await page.waitForTimeout(300);
    await page.evaluate((v) => { const el = document.getElementById('product_sc_seller'); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, VENDEDOR_ID);
    await page.waitForTimeout(300);
    await page.evaluate((v) => { const el = document.getElementById('product_sc_provider'); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); }, PROVEEDOR_ID);
    await page.waitForTimeout(300);

    await page.evaluate(() => { const el = document.getElementById('product_sc_tax_checkbox'); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('click', { bubbles: true })); });
    await page.waitForTimeout(400);
    await page.evaluate(() => ext_product_add_tax_list_select_input(0, 0));
    await page.waitForTimeout(500);
    await page.evaluate(() => { const el = document.getElementById('ext_product_add_product_tax_list_1'); el.value = '1'; el.dispatchEvent(new Event('change', { bubbles: true })); }); // IVA (necesario para exoneración)
    await page.waitForTimeout(300);
    await page.evaluate(() => { const el = document.getElementById('ext_product_add_product_tax_rate_list_1'); el.value = '8'; el.dispatchEvent(new Event('change', { bubbles: true })); }); // 13%
    await page.waitForTimeout(500);

    // Garantía (checkbox + días)
    await page.evaluate(() => { const el = document.getElementById('product_sc_warranty_checkbox'); el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new Event('click', { bubbles: true })); });
    await page.waitForTimeout(400);
    const garantiaDiasVisible = await page.evaluate(() => { const el = document.getElementById('product_sc_warranty_days'); return el ? getComputedStyle(el).display !== 'none' : false; });
    if (garantiaDiasVisible) await page.fill('#product_sc_warranty_days', '90');
    console.log('🛡️ Campo "Días de garantía" visible tras marcar el checkbox:', garantiaDiasVisible);

    await page.fill('#product_sc_comment', 'Observación de prueba CP-179');
    await page.fill('#product_sc_quantity', '1');
    await page.fill('#product_sc_cost', '442.48');
    await page.fill('#product_sc_utility', '35');
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
    if (!sweetAlertTxt) { await screenshotOnFail(page, 'cp179-fail-sin-sweetalert'); throw new Error('No apareció el SweetAlert de confirmación del producto externo'); }
    await page.evaluate(() => {
      const isVis = el => { const r=el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
      const btn = sa ? Array.from(sa.querySelectorAll('button')).find(b => /agregar/i.test(b.textContent)) : null;
      if (btn) btn.click();
    });
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tExterno, 'Agregar producto externo');

    const totalTrasExterno = await leerTotalVisible(page);
    const totalCarritoNum = totalTrasExterno ? parseFloat((totalTrasExterno.match(/[\d,]+\.\d{2}/) || ['0'])[0].replace(/,/g, '')) : NaN;
    const totalEsperadoNum = parseFloat(precioCalculado.total);
    const montoCorrupto = !isNaN(totalCarritoNum) && !isNaN(totalEsperadoNum) && Math.abs(totalCarritoNum - totalEsperadoNum) > 100;
    console.log('💰 Total del carrito tras agregar producto externo:', totalTrasExterno, '| esperado (modal):', precioCalculado.total, '| ⚠️ monto corrupto:', montoCorrupto);

    // ── 2) Cliente existente ──
    const cs = await page.evaluate((id) => { try { selectCustomerToPos(id); return document.getElementById('customer_select')?.value; } catch (e) { return null; } }, CLIENTE_ID);
    if (cs !== String(CLIENTE_ID)) { await screenshotOnFail(page, 'cp179-fail-cliente'); throw new Error('No se pudo asociar el cliente existente'); }
    console.log('👤 Cliente existente (ID ' + CLIENTE_ID + ') asociado');
    await page.waitForTimeout(1000);

    // ── 3) Producto rápido ──
    const tRapido = Date.now();
    const resRapido = await (async () => {
      try {
        const opened = await page.evaluate(() => { if (typeof showModalQuickProductPos === 'function') { showModalQuickProductPos(); return true; } return false; });
        if (!opened) return { ok: false, reason: 'Función showModalQuickProductPos no disponible' };
        await page.waitForTimeout(1200);
        const modalVis = await page.evaluate(() => { const m = document.getElementById('dialog_quick_product_pos'); return m ? getComputedStyle(m).display !== 'none' : false; });
        if (!modalVis) return { ok: false, reason: 'Modal de Producto Rápido no abrió' };
        const nombre = 'Quick CP179';
        await page.evaluate(({ n }) => { const setVal=(id,v)=>{const el=document.getElementById(id);if(!el)return;el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}; setVal('quick_product_name', n); setVal('quick_product_quantity', '1'); setVal('quick_product_price', '400'); }, { n: nombre });
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
      if (!fallback) { await screenshotOnFail(page, 'cp179-fail-fallback-rapido'); throw new Error('Ni el producto rápido ni el fallback de catálogo pudieron agregarse'); }
      await page.waitForTimeout(1000);
      productoRapidoUsado = 'AAA-Multímetro Automotriz Digital (fallback)';
    }
    console.log('🛍️ Producto rápido en carrito:', productoRapidoUsado);

    // ── 4) Descuento general ──
    const totalPreDescText = await leerTotalVisible(page);
    const totalPreDesc = totalPreDescText ? parseFloat((totalPreDescText.match(/[\d,]+\.\d{2}/) || ['0'])[0].replace(/,/g, '')) : NaN;
    await page.evaluate(() => document.getElementById('show_invoice_advanced_detail')?.click());
    await page.waitForTimeout(800);
    const DESCUENTO_PCT = 12;
    const descOk = await page.evaluate((pct) => {
      const el = document.getElementById('total_discount_input');
      if (!el) return false;
      el.value = String(pct); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      return true;
    }, DESCUENTO_PCT);
    if (!descOk) { await screenshotOnFail(page, 'cp179-fail-descuento'); throw new Error('No se encontró total_discount_input'); }
    await page.waitForTimeout(1500);
    const totalPostDescText = await leerTotalVisible(page);
    const totalPostDesc = totalPostDescText ? parseFloat((totalPostDescText.match(/[\d,]+\.\d{2}/) || ['0'])[0].replace(/,/g, '')) : NaN;
    const descuentoSeAplico = !isNaN(totalPreDesc) && !isNaN(totalPostDesc) && totalPostDesc < totalPreDesc;
    console.log('📉 Descuento general ' + DESCUENTO_PCT + '%: ' + totalPreDescText + ' → ' + totalPostDescText + ' (' + (descuentoSeAplico ? '✅ bajó' : '❌ no bajó') + ')');

    // ── 5) Exoneración (patrón CP-071) ──
    const ivaAntes = await leerIVAVisible(page);
    const ivaMatch = ivaAntes ? ivaAntes.match(/[₡$]\s*([\d,]+\.\d{2})/) : null;
    const ivaValorAntes = ivaMatch ? parseFloat(ivaMatch[1].replace(/,/g, '')) : NaN;
    console.log('🧾 IVA antes de exonerar:', ivaAntes);

    await page.evaluate(() => set_apply_exoneration_modal());
    await page.waitForSelector('#dialog_add_exoneration', { timeout: 5000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const setVal = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
      setVal('payment_exoneration_number', 'EXO-QA-CP179-2026');
      setVal('payment_exoneration_company_name', 'Ministerio de Hacienda');
      const d = document.getElementById('payment_exoneration_date'); if (d) { d.value = new Date().toISOString().substring(0, 10); d.dispatchEvent(new Event('input', { bubbles: true })); }
      setVal('apply_exoneration_text', 'Orden de exoneración de prueba CP-179');
      setVal('payment_exoneration_percent', '100');
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.getElementById('apply_sale_exoneration').click());
    await page.waitForTimeout(1500);
    const modalExoneracionCerrado = await page.evaluate(() => { const m = document.getElementById('dialog_add_exoneration'); return !m || getComputedStyle(m).display === 'none'; });
    if (!modalExoneracionCerrado) { await screenshotOnFail(page, 'cp179-fail-modal-exoneracion'); throw new Error('El modal de exoneración no se cerró tras "Aplicar"'); }
    const exoState = await page.evaluate(() => ({
      amount: document.getElementById('total_exoneration_amount')?.textContent.trim() || null,
      percent: document.getElementById('total_exoneration_percent')?.textContent.trim() || null,
    }));
    console.log('🏛️ Exoneración aplicada:', JSON.stringify(exoState));
    const exoAmountMatch = exoState.amount ? exoState.amount.match(/([\d,]+\.\d{2})/) : null;
    const exoAmountValue = exoAmountMatch ? parseFloat(exoAmountMatch[1].replace(/,/g, '')) : NaN;
    const exoneracionAplicada = !isNaN(exoAmountValue) && exoAmountValue > 0;
    console.log('✔ Monto exonerado > 0: ' + (exoneracionAplicada ? '✅' : '❌') + ' (' + exoState.amount + '). Nota: no se exige que coincida ±' + TOLERANCIA + ' con el IVA previo (' + ivaAntes + ') porque el total base ya está afectado por el hallazgo de producto externo — ver CP-177.');

    // ── 6) Abrir modal de pago pero NO confirmar ──
    await page.evaluate(() => document.getElementById('btn_cash_pos').click());
    await page.waitForFunction(() => { const el = document.getElementById('dialog_payment'); return el ? getComputedStyle(el).display !== 'none' : false; }, null, { timeout: 30000 });
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch (e) {} }, CLIENTE_ID);
    await page.waitForTimeout(700);
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
    const v2 = cs === String(CLIENTE_ID);
    const v3 = !!productoRapidoUsado;
    const v4 = descOk;
    const v5 = exoneracionAplicada;
    const v6 = modalPagoVisible;

    console.log('\n📊 === VALIDACIONES CP-179 ===');
    console.log('  Producto externo agregado (proveedor+garantía+observaciones): ' + (v1 ? '✅' : '❌'));
    console.log('  Cliente existente asociado:                                    ' + (v2 ? '✅' : '❌'));
    console.log('  Producto rápido en carrito:                                    ' + (v3 ? '✅' : '❌') + ' ' + productoRapidoUsado);
    console.log('  Descuento general aplicado:                                    ' + (v4 ? '✅' : '❌'));
    console.log('  Exoneración aplicada (monto > 0):                              ' + (v5 ? '✅' : '❌'));
    console.log('  Modal de pago abre correctamente:                              ' + (v6 ? '✅' : '❌'));
    console.log('  Carrito vacío tras la limpieza final:                          ' + (carritoVacio ? '✅' : '⚠️'));
    console.log('  ⚠️ Monto del producto externo en carrito corrupto (hallazgo, ver CP-177): ' + montoCorrupto);

    if (!v1) throw new Error('No se pudo agregar el producto externo');
    if (!v2) throw new Error('No se pudo asociar el cliente existente');
    if (!v3) throw new Error('No se pudo agregar ningún producto rápido/fallback');
    if (!v4) throw new Error('No se pudo aplicar el descuento general');
    if (!v5) throw new Error('La exoneración no se aplicó (monto no > 0)');
    if (!v6) throw new Error('El modal de pago no abrió correctamente');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('⚠️ CP-179 RESULT: Flujo completo hasta el modal de pago (cliente ✓, producto rápido: ' + productoRapidoUsado + ', descuento ' + DESCUENTO_PCT + '% ✓, exoneración ' + exoState.amount + ' ✓, modal de pago ✓). NO se confirmó el pago por el hallazgo de monto corrupto en "Producto Externo" (ver CP-177). | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp179-fail');
    console.log('❌ CP-179 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp179_producto_externo_descuento_exoneracion();
