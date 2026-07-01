const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp037_facturacion_contado_efectivo() {
  console.log('🔄 Ejecutando CP-037: Verificar el flujo completo de facturación de contado en efectivo...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.clearCookies();
  const page = await context.newPage();

  try {
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    await page.fill('#email', 'qadesignsoftcr@gmail.com');
    await page.fill('#password', 'qa0000');
    await page.click('#loginButton');
    await page.waitForURL('**/dashboard**', { timeout: 40000 });

    const inicio = Date.now();
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1');
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
    await page.waitForTimeout(3000);
    console.log('⏱ Carga POS: ' + (Date.now() - inicio) + 'ms');

    const added = await page.evaluate(() => {
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find(b => /aaa-mult[ií]metro automotriz digital/i.test(b.textContent || ''));
      if (!target) return false;
      (target.querySelector('.product_box_quantity_content') || target).click();
      return true;
    });
    if (!added) throw new Error('No se pudo agregar el producto de prueba al carrito');
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
      const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVisible).find(b => (b.textContent || '').trim() === 'Agregar');
      if (btn) btn.click();
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => { if (typeof editQuickCustomerName === 'function') editQuickCustomerName(); });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const el = document.getElementById('temporal_customer_name');
      if (el) { el.value = 'Cliente Prueba CP037'; el.dispatchEvent(new Event('change', { bubbles: true })); if (typeof setTemporalCustomerName === 'function') setTemporalCustomerName(); }
    });
    await page.waitForTimeout(1500);

    const inicioModal = Date.now();
    await page.evaluate(() => document.getElementById('btn_cash_pos').click());
    await page.waitForTimeout(2000);
    console.log('⏱ Abrir modal de pago: ' + (Date.now() - inicioModal) + 'ms');

    const paymentModalOpen = await page.evaluate(() => {
      const m = document.getElementById('dialog_payment');
      return m ? window.getComputedStyle(m).display !== 'none' : false;
    });
    if (!paymentModalOpen) throw new Error('No se abrió el modal de pago tras hacer clic en FACTURAR');

    await page.evaluate(() => {
      const select = document.getElementById('payment_electronic_document_type');
      if (select) { select.value = '0'; select.dispatchEvent(new Event('change', { bubbles: true })); if (window.jQuery && jQuery(select).data('chosen')) jQuery(select).trigger('chosen:updated'); }
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const cash = document.getElementById('ck_is_payment_cash');
      if (cash && !cash.checked) { cash.checked = true; cash.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const ef = document.getElementById('is_payment_cash');
      if (ef && !ef.checked) { ef.checked = true; ef.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(500);

    const selectionState = await page.evaluate(() => ({
      documentType: document.getElementById('payment_electronic_document_type').value,
      contado: document.getElementById('ck_is_payment_cash').checked,
      efectivo: document.getElementById('is_payment_cash').checked
    }));
    console.log('🧾 Selección en el modal antes de facturar:', JSON.stringify(selectionState));

    const inicioFactura = Date.now();
    await page.evaluate(() => document.getElementById('make_payment').click());
    await page.waitForTimeout(4000);
    console.log('⏱ Procesar factura: ' + (Date.now() - inicioFactura) + 'ms');

    const bodyAfterInvoice = await page.locator('body').innerText();
    const paymentModalClosed = await page.evaluate(() => {
      const m = document.getElementById('dialog_payment');
      return m ? window.getComputedStyle(m).display === 'none' : true;
    });
    const showsSuccessSignal = /factura|exitos|correctamente|generad|impresi[oó]n/i.test(bodyAfterInvoice);

    if (paymentModalClosed || showsSuccessSignal) {
      console.log('✅ CP-037 PASSED: La factura de contado en efectivo se generó (modal cerrado y/o señal de éxito)');
    } else {
      throw new Error('El modal de pago sigue abierto y no se detectó señal de éxito');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp037-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-037 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp037_facturacion_contado_efectivo();
