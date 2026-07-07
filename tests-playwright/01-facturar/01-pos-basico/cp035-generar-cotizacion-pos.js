const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp035_generar_cotizacion_pos() {
  console.log('🔄 Ejecutando CP-035: Verificar que se pueda generar una cotización desde el POS...');

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
      if (el) { el.value = 'Cliente Prueba CP035'; el.dispatchEvent(new Event('change', { bubbles: true })); if (typeof setTemporalCustomerName === 'function') setTemporalCustomerName(); }
    });
    await page.waitForTimeout(1500);

    await page.evaluate(() => document.getElementById('demo-menu-top-right').click());
    await page.waitForTimeout(800);
    const proformClicked = await page.evaluate(() => {
      const item = document.querySelector('.btn_proform');
      if (!item) return false;
      item.click();
      return true;
    });
    if (!proformClicked) throw new Error('No se encontró la opción "COTIZACIÓN" en el menú de tres puntos');
    await page.waitForTimeout(2000);

    const modalOpen = await page.evaluate(() => {
      const m = document.getElementById('dialog_proform');
      return m ? window.getComputedStyle(m).display !== 'none' : false;
    });
    if (modalOpen) {
      console.log('✅ CP-035 PASSED: Se abrió el modal de cotización (#dialog_proform) correctamente');
    } else {
      throw new Error('No se abrió el modal de cotización (#dialog_proform)');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp035-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-035 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp035_generar_cotizacion_pos();
