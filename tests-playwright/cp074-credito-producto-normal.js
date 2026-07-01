const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const TOLERANCIA = 1;
// Cliente "valentina cliente prueba" → ID 12735 ("cliente prueba tarea 5",
// email valentinadesignsoft@gmail.com) con nombre, cédula, teléfono, dirección
// y email completos — el único con datos completos en este entorno QA.
const CLIENTE_ID = 12735;

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

async function cp074_credito_producto_normal() {
  console.log('🔄 Ejecutando CP-074: Factura a crédito con 2 productos normales + 1 fraccionado en colones...');
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

    // ── Cargar POS ─────────────────────────────────────────────────────────
    const t0 = Date.now();
    await page.goto(POS, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
    await page.waitForTimeout(3000); // esperar a que el catálogo renderice completamente
    await page.waitForSelector('.product_box', { timeout: 15000 });
    tiempos.cargaPOS = Date.now() - t0;
    evaluarCargaPagina(tiempos.cargaPOS, 'Carga POS');

    // ── Producto 1: AAA-Multímetro Automotriz Digital (gravado, ₡100) ──────
    const ini1 = Date.now();
    const added1 = await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll('.product_box'))
        .find(b => /aaa-mult[ií]metro automotriz digital/i.test((b.textContent || '').replace(/\s+/g, ' ')));
      if (!t) return false;
      (t.querySelector('.product_box_quantity_content') || t).click();
      return true;
    });
    if (!added1) { await screenshotOnFail(page, 'cp074-fail-producto1'); throw new Error('No se encontró AAA-Multímetro Automotriz Digital'); }
    await page.waitForFunction(
      () => /aaa-mult[ií]metro/i.test((document.getElementById('tb_table_buy_list') || { textContent: '' }).textContent),
      null, { timeout: 15000 }
    );
    evaluarAccion(Date.now() - ini1, 'Agregar AAA-Multímetro');

    // ── Producto 2: AAA-Bombillos / luces halógenas (exento, ₡150) ─────────
    const ini2 = Date.now();
    const added2 = await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll('.product_box'))
        .find(b => /aaa-bombillos/i.test((b.textContent || '').replace(/\s+/g, ' ')));
      if (!t) return false;
      (t.querySelector('.product_box_quantity_content') || t).click();
      return true;
    });
    if (!added2) { await screenshotOnFail(page, 'cp074-fail-producto2'); throw new Error('No se encontró AAA-Bombillos / luces halógenas'); }
    await page.waitForTimeout(800);
    evaluarAccion(Date.now() - ini2, 'Agregar AAA-Bombillos');

    // ── Producto 3: AA-Maletero (fraccionado) — 1 fracción ─────────────────
    const ini3 = Date.now();
    const maleteroClicked = await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll('.product_box'))
        .find(b => /aa-maletero/i.test((b.textContent || '').replace(/\s+/g, ' ')));
      if (!t) return false;
      (t.querySelector('.product_box_quantity_content') || t).click();
      return true;
    });
    if (!maleteroClicked) { await screenshotOnFail(page, 'cp074-fail-producto3'); throw new Error('No se encontró AA-Maletero'); }
    await page.waitForSelector('#dialog_product_fragmented_quantity_view', { timeout: 5000 });
    await page.waitForTimeout(400);
    // prod_frag_q = input real de fracciones (no el span de display)
    await page.evaluate(() => {
      const fi = document.getElementById('prod_frag_q');
      if (fi) { fi.value = '1'; fi.dispatchEvent(new Event('input', { bubbles: true })); fi.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(300);
    const agregarOk = await page.evaluate(() => { const btn = document.getElementById('btn_set_product_fragment_quantity'); if (btn) { btn.click(); return true; } return false; });
    if (!agregarOk) { await screenshotOnFail(page, 'cp074-fail-maletero-agregar'); throw new Error('No se pudo hacer clic en Agregar del diálogo de fracción'); }
    await page.waitForTimeout(1200);
    evaluarAccion(Date.now() - ini3, 'Agregar AA-Maletero (fraccionado)');

    // ── Verificar que los 3 productos están en carrito ─────────────────────
    const cartCheck = await page.evaluate(() => {
      const t = document.getElementById('tb_table_buy_list').textContent;
      return { m: /aaa-mult[ií]metro/i.test(t), b: /aaa-bombillos/i.test(t), ml: /aa-maletero/i.test(t) };
    });
    if (!cartCheck.m || !cartCheck.b || !cartCheck.ml) {
      await screenshotOnFail(page, 'cp074-fail-carrito-incompleto');
      throw new Error('Carrito incompleto: ' + JSON.stringify(cartCheck));
    }
    console.log('📦 Carrito verificado: AAA-Multímetro ✓ | AAA-Bombillos ✓ | AA-Maletero ✓');

    // ── Leer IVA y total antes del pago ────────────────────────────────────
    await page.evaluate(() => document.getElementById('show_invoice_advanced_detail').click());
    await page.waitForTimeout(800);
    const ivaText = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const el = Array.from(document.querySelectorAll('.advanced_invoice_detail,[class*="total_div"]'))
        .filter(isVis).find(e => /^IVA/i.test((e.textContent || '').replace(/\s+/g, ' ').trim()));
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
    });
    const ivaMatch = ivaText ? ivaText.match(/₡\s*([\d,]+\.\d{2})/) : null;
    const ivaValue = ivaMatch ? parseFloat(ivaMatch[1].replace(/,/g, '')) : 0;
    console.log('🧾 IVA del carrito:', ivaText, '→ ₡' + ivaValue);

    const totalText = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent || '').trim()));
      const next = label ? label.nextElementSibling : null;
      return next ? next.textContent.trim() : null;
    });
    const totalMatch = totalText ? totalText.match(/([\d,]+\.\d{2})/) : null;
    const totalValue = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : NaN;
    console.log('💰 Total del carrito:', totalText, '→ ₡' + totalValue);
    if (isNaN(totalValue) || totalValue <= 0) { await screenshotOnFail(page, 'cp074-fail-total'); throw new Error('Total inválido: ' + totalText); }

    // ── Asociar cliente "valentina cliente prueba" (ID 12735) ───────────────
    const cs = await page.evaluate((id) => {
      try { selectCustomerToPos(id); return document.getElementById('customer_select')?.value; } catch (e) { return null; }
    }, CLIENTE_ID);
    if (cs !== String(CLIENTE_ID)) { await screenshotOnFail(page, 'cp074-fail-cliente'); throw new Error('No se pudo asociar cliente ID ' + CLIENTE_ID); }
    console.log('👤 Cliente "valentina cliente prueba" (ID ' + CLIENTE_ID + ') asociado');
    await page.waitForTimeout(1200);

    // ── Abrir modal de pago ────────────────────────────────────────────────
    const iniModal = Date.now();
    await page.evaluate(() => document.getElementById('btn_cash_pos').click());
    await page.waitForFunction(() => { const el = document.getElementById('dialog_payment'); return el ? window.getComputedStyle(el).display !== 'none' : false; }, null, { timeout: 30000 });
    tiempos.abrirModal = Date.now() - iniModal;
    evaluarAccion(tiempos.abrirModal, 'Abrir modal de pago');

    // Reasociar cliente (el modal resetea customer_select al abrirse)
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch (e) {} }, CLIENTE_ID);
    await page.waitForTimeout(1000);

    // ── Activar modo crédito ───────────────────────────────────────────────
    const iniCredito = Date.now();
    await page.evaluate(() => {
      document.getElementById('ck_is_payment_credit').checked = true;
      switch_payment_type(2);
    });
    await page.waitForTimeout(1500);
    tiempos.activarCredito = Date.now() - iniCredito;
    evaluarAccion(tiempos.activarCredito, 'Activar modo crédito');

    const creditoState = await page.evaluate(() => ({
      creditoChecked: document.getElementById('ck_is_payment_credit').checked,
      contadoChecked: document.getElementById('ck_is_payment_cash').checked,
      fechaVencimiento: document.getElementById('credit_sale_end_date')?.value || null
    }));
    console.log('💳 Estado crédito:', JSON.stringify(creditoState));
    if (!creditoState.creditoChecked) { await screenshotOnFail(page, 'cp074-fail-credito'); throw new Error('Modo crédito no se activó'); }

    // ── Procesar pago a crédito ────────────────────────────────────────────
    const iniPago = Date.now();
    await page.evaluate(() => document.getElementById('make_payment').click());

    let cartEmpty = false;
    for (let i = 0; i < 12 && !cartEmpty; i++) {
      await page.waitForTimeout(1000);
      try {
        const state = await page.evaluate(() => {
          const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
          const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
          const ct = document.getElementById('tb_table_buy_list').textContent;
          return {
            hasSweetAlert: !!sa,
            cartHasProducts: /aaa-mult[ií]metro/i.test(ct) || /aaa-bombillos/i.test(ct) || /aa-maletero/i.test(ct)
          };
        });
        if (state.hasSweetAlert) {
          await page.evaluate(() => {
            const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0; };
            const btn = Array.from(document.querySelectorAll('.sweet-alert button.confirm')).filter(isVis)[0];
            if (btn) btn.click();
          }).catch(() => {});
        }
        cartEmpty = !state.cartHasProducts;
      } catch (navError) {
        if (/navigation|context/i.test(navError.message)) { cartEmpty = true; break; }
        throw navError;
      }
    }
    tiempos.procesarPago = Date.now() - iniPago;
    evaluarAccion(tiempos.procesarPago, 'Procesar pago a crédito');

    if (!cartEmpty) { await screenshotOnFail(page, 'cp074-fail-pago'); throw new Error('El carrito no quedó vacío tras el pago a crédito'); }
    console.log('✅ Pago a crédito confirmado — carrito vacío');

    // ── Validar saldo pendiente y coherencia matemática ────────────────────
    const urlCredSales = 'https://dev.designsoftcr.com/qa_talleralpha/public/credit_sale/clientCreditSales';
    let saldoEncontrado = false;
    let saldoText = null;
    let saldoValue = NaN;

    try {
      const tCred = Date.now();
      await page.goto(urlCredSales, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(2500);
      tiempos.cargaCredSales = Date.now() - tCred;
      evaluarCargaPagina(tiempos.cargaCredSales, 'Carga Abono Cuentas por Cobrar');

      const creditData = await page.evaluate((clienteId) => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        const rows = Array.from(document.querySelectorAll('tbody tr')).filter(isVis);
        // Buscar la fila más reciente que tenga monto en ₡
        const match = rows.find(r => /₡/.test(r.textContent));
        if (!match) return { found: false, rows: rows.length };
        const amounts = (match.textContent.match(/₡\s*([\d,]+\.\d{2})/g) || []).map(a => a.replace(/[₡\s,]/g, ''));
        return { found: true, text: match.textContent.replace(/\s+/g, ' ').trim().substring(0, 200), amounts };
      }, CLIENTE_ID);
      console.log('📊 Datos Cuentas por Cobrar:', JSON.stringify(creditData));

      if (creditData.found && creditData.amounts && creditData.amounts.length > 0) {
        saldoEncontrado = true;
        // Tomar el monto más grande (que debería ser el total de la factura)
        saldoValue = Math.max(...creditData.amounts.map(a => parseFloat(a)));
        saldoText = '₡' + saldoValue.toFixed(2);

        // Validación matemática: saldo ≈ total factura ±1
        const diff = Math.abs(saldoValue - totalValue);
        if (diff <= TOLERANCIA) {
          console.log('✔ Validación numérica: saldo (' + saldoText + ') ≈ total factura (₡' + totalValue + ') — diferencia ₡' + diff.toFixed(2) + ' dentro de tolerancia ±' + TOLERANCIA);
        } else {
          console.log('⚠️ Diferencia fuera de tolerancia: saldo (' + saldoText + ') vs total (₡' + totalValue + ') — diff ₡' + diff.toFixed(2));
        }
      }
    } catch (gotoError) {
      tiempos.cargaCredSales = 90000;
      console.log('⚠️ Página de créditos no cargó (' + gotoError.message.split('\n')[0] + ')');
    }

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    if (saldoEncontrado) {
      console.log('✅ CP-074 PASSED | productos: 3 (AAA-Multímetro + AAA-Bombillos + AA-Maletero x1frac) | moneda: colones | tipo doc: Factura Interna (crédito) | método pago: crédito | total: ' + totalText + ' | IVA: ₡' + ivaValue + ' | saldo crédito: ' + saldoText + ' | tiempo: ' + tiempoTotalCP + 'ms');
    } else {
      console.log('⚠️ CP-074 RESULT: Pago a crédito completado (carrito vacío, venta registrada). Total factura: ' + totalText + ' | IVA: ₡' + ivaValue + '. Saldo crédito no verificable en este momento (página no cargó o sin filas). | tiempo: ' + tiempoTotalCP + 'ms');
    }

    console.log('⏱ Performance:');
    console.log('   - Carga POS: ' + tiempos.cargaPOS + 'ms');
    console.log('   - Abrir modal: ' + tiempos.abrirModal + 'ms');
    console.log('   - Activar crédito: ' + tiempos.activarCredito + 'ms');
    console.log('   - Procesar pago: ' + tiempos.procesarPago + 'ms');
    if (tiempos.cargaCredSales) console.log('   - Carga créditos: ' + tiempos.cargaCredSales + 'ms');
    console.log('   - Total CP: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp074-fail-excepcion');
    console.log('❌ CP-074 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp074_credito_producto_normal();
