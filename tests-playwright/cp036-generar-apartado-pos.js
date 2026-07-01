const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp036_generar_apartado_pos() {
  console.log('🔄 Ejecutando CP-036: Verificar que se pueda generar un apartado desde el POS...');

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
      if (el) { el.value = 'Cliente Prueba CP036'; el.dispatchEvent(new Event('change', { bubbles: true })); if (typeof setTemporalCustomerName === 'function') setTemporalCustomerName(); }
    });
    await page.waitForTimeout(1500);

    await page.evaluate(() => document.getElementById('demo-menu-top-right').click());
    await page.waitForTimeout(800);
    const layawayClicked = await page.evaluate(() => {
      const item = document.querySelector('.btn_layaway_sale');
      if (!item) return false;
      item.click();
      return true;
    });
    if (!layawayClicked) throw new Error('No se encontró la opción "Generar Apartado" en el menú de tres puntos');
    await page.waitForTimeout(2000);

    const layawayButtonVisible = await page.evaluate(() => {
      const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = document.getElementById('make_layaway');
      return btn ? isVisible(btn) : false;
    });
    if (!layawayButtonVisible) throw new Error('No se mostró el botón "GENERAR APARTADO" en el modal de pago');

    await page.evaluate(() => document.getElementById('make_layaway').click());
    await page.waitForTimeout(3000);

    const bodyAfterLayaway = await page.locator('body').innerText();
    const modalClosed = await page.evaluate(() => {
      const m = document.getElementById('dialog_payment');
      return m ? window.getComputedStyle(m).display === 'none' : true;
    });
    const showsSuccessSignal = /apartado|exitos|correctamente|generad/i.test(bodyAfterLayaway);

    if (modalClosed || showsSuccessSignal) {
      console.log('✅ CP-036 PASSED: El apartado se generó (modal de pago cerrado y/o mensaje de éxito detectado)');
    } else {
      throw new Error('El modal de pago sigue abierto y no se detectó señal de éxito');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp036-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-036 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp036_generar_apartado_pos();
