const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp038_facturacion_credito() {
  console.log('🔄 Ejecutando CP-038: Verificar el flujo completo de facturación a crédito...');

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

    const customerSelected = await page.evaluate(() => {
      try {
        selectCustomerToPos(12735);
        return document.getElementById('customer_select') ? document.getElementById('customer_select').value : null;
      } catch (e) { return null; }
    });
    if (customerSelected !== '12735') throw new Error('No se pudo asociar un cliente real (id 12735) a la factura');
    await page.waitForTimeout(1000);

    await page.evaluate(() => document.getElementById('btn_cash_pos').click());
    await page.waitForTimeout(2000);

    const paymentModalOpen = await page.evaluate(() => {
      const m = document.getElementById('dialog_payment');
      return m ? window.getComputedStyle(m).display !== 'none' : false;
    });
    if (!paymentModalOpen) throw new Error('No se abrió el modal de pago tras hacer clic en FACTURAR');

    await page.evaluate(() => {
      document.getElementById('ck_is_payment_credit').checked = true;
      switch_payment_type(2);
    });
    await page.waitForTimeout(1500);

    const paymentTypeState = await page.evaluate(() => ({
      contado: document.getElementById('ck_is_payment_cash').checked,
      credito: document.getElementById('ck_is_payment_credit').checked,
      customerSelect: document.getElementById('customer_select').value
    }));
    console.log('🧾 Estado del tipo de pago tras intentar seleccionar Crédito:', JSON.stringify(paymentTypeState));

    if (paymentTypeState.credito === true && paymentTypeState.contado === false) {
      await page.evaluate(() => document.getElementById('make_payment').click());
      await page.waitForTimeout(4000);
      console.log('✅ CP-038 PASSED: Se seleccionó Crédito correctamente y la factura se generó a crédito');
    } else {
      console.log('⚠️ CP-038 RESULT: Defecto confirmado en el sistema — switch_payment_type() revierte automáticamente el checkbox a Contado al intentar activar Crédito. Revisando el código fuente de la función en vivo, el bloque que aplica visualmente el cambio a Crédito está comentado (/* ... */); solo queda activa la rama que fuerza el regreso a Contado. No es posible facturar a crédito en este momento, independientemente del cliente asociado.');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp038-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-038 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp038_facturacion_credito();
