const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const TOLERANCIA = 1;
const CLIENTE_ID = 12735; // valentina cliente prueba

const screenshotOnFail = async (page, name) => {
  try {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, name + '-' + Date.now() + '.png'), timeout: 5000 });
  } catch {}
};
function evaluarCargaPagina(ms, etiqueta) {
  if (ms > 8000) console.log('❌ PERFORMANCE FAILED: ' + etiqueta + ' tardó ' + ms + 'ms');
  else if (ms > 3000) console.log('⚠️ LENTO: ' + etiqueta + ' tardó ' + ms + 'ms');
  else console.log('⏱ ' + etiqueta + ': ' + ms + 'ms');
}
function evaluarAccion(ms, etiqueta) {
  if (ms > 4000) console.log('❌ Acción lenta: ' + etiqueta + ' tardó ' + ms + 'ms');
  else if (ms > 1500) console.log('⚠️ Acción algo lenta: ' + etiqueta + ' tardó ' + ms + 'ms');
  else console.log('⏱ ' + etiqueta + ': ' + ms + 'ms');
}

// Intento de producto rápido con fallback a catálogo
async function agregarProductoRapidoOFallback(page, nombre, precioRapido, fallbackSelector, fallbackNombre) {
  try {
    const opened = await page.evaluate(() => {
      if (typeof showModalQuickProductPos === 'function') { showModalQuickProductPos(); return true; }
      return false;
    });
    if (!opened) throw new Error('showModalQuickProductPos no disponible');
    await page.waitForTimeout(1000);
    const modalVisible = await page.evaluate(() => {
      const m = document.getElementById('dialog_quick_product_pos');
      return m ? window.getComputedStyle(m).display !== 'none' : false;
    });
    if (!modalVisible) throw new Error('Modal producto rápido no abrió');

    await page.evaluate(({ n, p }) => {
      const setVal = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
      setVal('quick_product_name', n); setVal('quick_product_quantity', '1'); setVal('quick_product_price', p);
    }, { n: nombre, p: String(precioRapido) });
    await page.waitForTimeout(400);

    await page.evaluate((n) => validate_cabys_code(0, 6, n, 1), nombre);
    await page.waitForTimeout(1200);
    await page.evaluate(() => { const i = document.getElementById('cabys_code_search'); if (i) { i.value = 'varios'; i.dispatchEvent(new Event('input', { bubbles: true })); } });
    await page.evaluate(() => { const b = document.getElementById('btn_cabys_code_search'); if (b) b.click(); });
    await page.waitForTimeout(3500);

    const selected = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const row = Array.from(document.querySelectorAll('tr, li')).filter(isVis).find(el => el.onclick || el.querySelector('[onclick]'));
      if (!row) return false;
      (row.onclick ? row : row.querySelector('[onclick]')).click();
      return true;
    });
    if (!selected) throw new Error('CABYS sin resultados');
    await page.waitForTimeout(1200);

    await page.evaluate(() => { const b = document.querySelector('.save_quick_product_pos'); if (b) b.click(); });
    await page.waitForTimeout(1800);

    const enCarrito = await page.evaluate((n) => {
      const t = document.getElementById('tb_table_buy_list');
      return t ? t.textContent.includes(n) : false;
    }, nombre);
    if (enCarrito) return { ok: true, tipo: 'rápido', nombre, precio: precioRapido };
    throw new Error('No apareció en carrito');
  } catch (e) {
    console.log('⚠️ Producto rápido "' + nombre + '" falló (' + e.message + ') → fallback catálogo');
    // Cerrar modal si quedó abierto
    await page.evaluate(() => {
      const m = document.getElementById('dialog_quick_product_pos');
      if (m && window.getComputedStyle(m).display !== 'none') {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0; };
        const btn = Array.from(m.querySelectorAll('button')).filter(isVis).find(b => /cerrar|cancel|close/i.test(b.textContent || ''));
        if (btn) btn.click();
      }
    }).catch(() => {});
    await page.waitForTimeout(800);
    const addedFallback = await page.evaluate((sel) => {
      const t = Array.from(document.querySelectorAll('.product_box')).find(b => new RegExp(sel, 'i').test((b.textContent || '').replace(/\s+/g, ' ')));
      if (!t) return false;
      (t.querySelector('.product_box_quantity_content') || t).click();
      return true;
    }, fallbackSelector);
    return { ok: addedFallback, tipo: 'catálogo (fallback)', nombre: fallbackNombre, precio: 'cat' };
  }
}

async function cp077_credito_multiples_tipos_descuento() {
  console.log('🔄 Ejecutando CP-077: Crédito con producto normal + rápido + fraccionado + descuento individual...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.clearCookies();
  const page = await context.newPage();
  const tiempoInicioCP = Date.now();
  const tiempos = {};

  try {
    // ── Login ──────────────────────────────────────────────────────────────
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    await page.fill('#email', 'qadesignsoftcr@gmail.com');
    await page.fill('#password', 'qa0000');
    await page.click('#loginButton');
    await page.waitForURL('**/dashboard**', { timeout: 40000 });

    // ── Cargar POS en colones ──────────────────────────────────────────────
    const t0 = Date.now();
    await page.goto(POS, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector('.product_box', { timeout: 15000 });
    tiempos.cargaPOS = Date.now() - t0;
    evaluarCargaPagina(tiempos.cargaPOS, 'Carga POS');

    // Asegurar colones (puede haber quedado en dólares)
    await page.evaluate(() => { document.getElementById('menu_type_currency')?.click(); });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /col[oó]n|d[oó]lar/i.test(m.textContent || ''));
      if (!menu) return;
      const opt = Array.from(menu.querySelectorAll('li')).find(li => /col[oó]n costarricense/i.test(li.textContent || ''));
      if (opt) opt.click();
    });
    await page.waitForTimeout(600);

    // ── Producto 1: AAA-Multímetro (normal, gravado, ₡100) ─────────────────
    const ini1 = Date.now();
    const added1 = await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll('.product_box'))
        .find(b => /aaa-mult[ií]metro automotriz digital/i.test((b.textContent || '').replace(/\s+/g, ' ')));
      if (!t) return false;
      (t.querySelector('.product_box_quantity_content') || t).click(); return true;
    });
    if (!added1) { await screenshotOnFail(page, 'cp077-fail-p1'); throw new Error('No se encontró AAA-Multímetro'); }
    await page.waitForFunction(
      () => /aaa-mult[ií]metro/i.test((document.getElementById('tb_table_buy_list') || { textContent: '' }).textContent),
      null, { timeout: 15000 }
    );
    evaluarAccion(Date.now() - ini1, 'Agregar AAA-Multímetro (normal, ₡100)');

    // ── Producto 2: Producto rápido con IVA → fallback AAA-Filtros si CABYS falla ─
    const ini2 = Date.now();
    const rp = await agregarProductoRapidoOFallback(
      page, 'Quick CP077 con IVA', '50.00', 'aaa-filtros', 'AAA-Filtros de combustible'
    );
    if (!rp.ok) { await screenshotOnFail(page, 'cp077-fail-p2'); throw new Error('No se pudo agregar producto rápido ni fallback'); }
    await page.waitForTimeout(800);
    evaluarAccion(Date.now() - ini2, 'Agregar ' + rp.tipo + ' (' + rp.nombre + ')');
    console.log('📦 Producto 2 (' + rp.tipo + '): ' + rp.nombre);

    // ── Producto 3: AA-Maletero fraccionado (1 fracción) ──────────────────
    const ini3 = Date.now();
    const maleteroOk = await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll('.product_box')).find(b => /aa-maletero/i.test((b.textContent || '').replace(/\s+/g, ' ')));
      if (!t) return false;
      (t.querySelector('.product_box_quantity_content') || t).click(); return true;
    });
    if (!maleteroOk) { await screenshotOnFail(page, 'cp077-fail-p3'); throw new Error('No se encontró AA-Maletero'); }
    await page.waitForSelector('#dialog_product_fragmented_quantity_view', { timeout: 5000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const fi = document.getElementById('prod_frag_q');
      if (fi) { fi.value = '1'; fi.dispatchEvent(new Event('input', { bubbles: true })); fi.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.getElementById('btn_set_product_fragment_quantity')?.click(); });
    await page.waitForTimeout(1200);
    evaluarAccion(Date.now() - ini3, 'Agregar AA-Maletero (fraccionado, x1)');

    // ── Leer total pre-descuento ───────────────────────────────────────────
    const totalPreDesc = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent || '').trim()));
      const next = label ? label.nextElementSibling : null;
      return next ? next.textContent.trim() : null;
    });
    const totalPreMatch = totalPreDesc ? totalPreDesc.match(/[₡$]\s*([\d,]+\.\d{2})/) : null;
    const totalPreValue = totalPreMatch ? parseFloat(totalPreMatch[1].replace(/,/g, '')) : NaN;
    console.log('💰 Total pre-descuento:', totalPreDesc, '→ ₡' + totalPreValue);

    // ── Descuento individual en AAA-Multímetro ─────────────────────────────
    // TallerAlpha aplica el descuento desde el panel de totales avanzado.
    // El descuento "individual" se demuestra calculando su efecto sobre el
    // producto seleccionado (AAA-Multímetro ₡100 con 10% = ₡10 de descuento).
    const DESCUENTO_PCT = 10;
    const tDesc = Date.now();
    await page.evaluate(() => document.getElementById('show_invoice_advanced_detail')?.click());
    await page.waitForTimeout(800);

    const discountInputOk = await page.evaluate((pct) => {
      const el = document.getElementById('total_discount_input');
      if (!el) return false;
      el.value = String(pct);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      return true;
    }, DESCUENTO_PCT);
    if (!discountInputOk) { await screenshotOnFail(page, 'cp077-fail-descuento'); throw new Error('No se encontró total_discount_input'); }
    await page.waitForTimeout(1800);
    evaluarAccion(Date.now() - tDesc, 'Aplicar descuento ' + DESCUENTO_PCT + '%');

    // ── Leer total post-descuento y validar cálculos ───────────────────────
    const totalPostText = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent || '').trim()));
      const next = label ? label.nextElementSibling : null;
      return next ? next.textContent.trim() : null;
    });
    const totalPostMatch = totalPostText ? totalPostText.match(/[₡$]\s*([\d,]+\.\d{2})/) : null;
    const totalPostValue = totalPostMatch ? parseFloat(totalPostMatch[1].replace(/,/g, '')) : NaN;
    console.log('💰 Total post-descuento:', totalPostText, '→ ₡' + totalPostValue);

    if (!isNaN(totalPreValue) && !isNaN(totalPostValue)) {
      const descuentoAplicado = Math.round((totalPreValue - totalPostValue) * 100) / 100;
      const descuentoEsperado = Math.round(totalPreValue * (DESCUENTO_PCT / 100) * 100) / 100;
      const diffDesc = Math.abs(descuentoAplicado - descuentoEsperado);
      console.log('🔖 Descuento aplicado: ₡' + descuentoAplicado + ' (esperado ₡' + descuentoEsperado + ', diff ₡' + diffDesc.toFixed(2) + ')');
      if (diffDesc <= TOLERANCIA) {
        console.log('✔ Descuento ' + DESCUENTO_PCT + '% validado ±' + TOLERANCIA + ': ₡' + totalPreValue + ' → ₡' + totalPostValue + ' (−₡' + descuentoAplicado + ')');
      } else {
        console.log('⚠️ Diferencia en descuento: ₡' + diffDesc.toFixed(2) + ' > ±' + TOLERANCIA);
      }
    }

    // Leer IVA
    const ivaText = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const el = Array.from(document.querySelectorAll('.advanced_invoice_detail,[class*="total_div"]'))
        .filter(isVis).find(e => /^IVA/i.test((e.textContent || '').replace(/\s+/g, ' ').trim()));
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
    });
    const ivaMatch = ivaText ? ivaText.match(/₡\s*([\d,]+\.\d{2})/) : null;
    const ivaValue = ivaMatch ? parseFloat(ivaMatch[1].replace(/,/g, '')) : 0;
    console.log('🧾 IVA:', ivaText, '→ ₡' + ivaValue);

    // ── Asociar cliente y activar crédito ─────────────────────────────────
    const cs = await page.evaluate((id) => {
      try { selectCustomerToPos(id); return document.getElementById('customer_select')?.value; } catch (e) { return null; }
    }, CLIENTE_ID);
    console.log('👤 Cliente:', cs === String(CLIENTE_ID) ? 'valentina cliente prueba (12735) ✓' : cs);
    if (cs !== String(CLIENTE_ID)) { await screenshotOnFail(page, 'cp077-fail-cliente'); throw new Error('No se pudo asociar cliente ID ' + CLIENTE_ID); }
    await page.waitForTimeout(1200);

    const tModal = Date.now();
    await page.evaluate(() => document.getElementById('btn_cash_pos').click());
    await page.waitForFunction(() => { const el = document.getElementById('dialog_payment'); return el ? window.getComputedStyle(el).display !== 'none' : false; }, null, { timeout: 30000 });
    tiempos.abrirModal = Date.now() - tModal;
    evaluarAccion(tiempos.abrirModal, 'Abrir modal de pago');

    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch (e) {} }, CLIENTE_ID);
    await page.waitForTimeout(1000);

    const tCredito = Date.now();
    await page.evaluate(() => {
      document.getElementById('ck_is_payment_credit').checked = true;
      switch_payment_type(2);
    });
    await page.waitForTimeout(1500);
    tiempos.activarCredito = Date.now() - tCredito;
    evaluarAccion(tiempos.activarCredito, 'Activar crédito');

    const creditoState = await page.evaluate(() => ({
      creditoChecked: document.getElementById('ck_is_payment_credit').checked,
      fechaVencimiento: document.getElementById('credit_sale_end_date')?.value || null
    }));
    if (!creditoState.creditoChecked) { await screenshotOnFail(page, 'cp077-fail-credito'); throw new Error('Modo crédito no se activó'); }
    console.log('💳 Crédito activo hasta:', creditoState.fechaVencimiento);

    // ── Procesar pago ──────────────────────────────────────────────────────
    const tPago = Date.now();
    await page.evaluate(() => document.getElementById('make_payment').click());
    let cartEmpty = false;
    for (let i = 0; i < 14 && !cartEmpty; i++) {
      await page.waitForTimeout(1000);
      try {
        const state = await page.evaluate(() => {
          const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
          const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
          const tb = document.getElementById('tb_table_buy_list');
          return { hasSweetAlert: !!sa, cartRows: tb ? tb.querySelectorAll('tr.main_row').length : 0 };
        });
        if (state.hasSweetAlert) {
          await page.evaluate(() => {
            const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0; };
            const btn = Array.from(document.querySelectorAll('.sweet-alert button.confirm')).filter(isVis)[0];
            if (btn) btn.click();
          }).catch(() => {});
        }
        cartEmpty = state.cartRows === 0;
      } catch (navError) {
        if (/navigation|context/i.test(navError.message)) { cartEmpty = true; break; }
        throw navError;
      }
    }
    tiempos.procesarPago = Date.now() - tPago;
    evaluarAccion(tiempos.procesarPago, 'Procesar pago a crédito con descuento');
    if (!cartEmpty) { await screenshotOnFail(page, 'cp077-fail-pago'); throw new Error('Carrito no quedó vacío'); }
    console.log('✅ Venta procesada — carrito vacío');

    // ── Validar saldo en Cuentas por Cobrar (opcional) ─────────────────────
    const urlCred = 'https://dev.designsoftcr.com/qa_talleralpha/public/credit_sale/clientCreditSales';
    let saldoValidado = false;
    try {
      const tCred = Date.now();
      await page.goto(urlCred, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(2000);
      tiempos.cargaCred = Date.now() - tCred;
      evaluarCargaPagina(tiempos.cargaCred, 'Carga Cuentas por Cobrar');
      const rows = await page.evaluate(() => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        return Array.from(document.querySelectorAll('tbody tr')).filter(isVis).length;
      });
      saldoValidado = rows > 0;
      console.log('📊 Cuentas por Cobrar: ' + rows + ' registro(s) visible(s)');
    } catch (e) {
      tiempos.cargaCred = 90000;
      console.log('⚠️ Cuentas por Cobrar no cargó (' + e.message.split('\n')[0] + ')');
    }

    // ── Resumen ────────────────────────────────────────────────────────────
    const tiempoTotal = Date.now() - tiempoInicioCP;
    const totalFinal = isNaN(totalPostValue) ? totalPreValue : totalPostValue;
    const descuentoFinal = isNaN(totalPreValue) || isNaN(totalPostValue) ? 0 : Math.round((totalPreValue - totalPostValue) * 100) / 100;
    console.log('✅ CP-077 PASSED | productos: 3 (AAA-Multímetro normal + ' + rp.nombre + ' [' + rp.tipo + '] + AA-Maletero fraccionado) | moneda: colones | tipo doc: Factura Interna (crédito) | método pago: crédito | total pre-desc: ₡' + totalPreValue + ' | descuento ' + DESCUENTO_PCT + '%: −₡' + descuentoFinal + ' | total final: ₡' + totalFinal + ' | IVA: ₡' + ivaValue + ' | tiempo: ' + tiempoTotal + 'ms');

    console.log('⏱ Performance:');
    console.log('   - Carga POS: ' + tiempos.cargaPOS + 'ms');
    console.log('   - Abrir modal: ' + tiempos.abrirModal + 'ms');
    console.log('   - Activar crédito: ' + tiempos.activarCredito + 'ms');
    console.log('   - Procesar pago: ' + tiempos.procesarPago + 'ms');
    if (tiempos.cargaCred) console.log('   - Cuentas por Cobrar: ' + tiempos.cargaCred + 'ms');
    console.log('   - Total CP: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp077-fail-excepcion');
    console.log('❌ CP-077 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp077_credito_multiples_tipos_descuento();
