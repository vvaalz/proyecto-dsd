const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

async function cp042_aplicar_descuento_carrito() {
  console.log('🔄 Ejecutando CP-042: Verificar que aplicar un porcentaje de descuento cambie el total...');
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

    const t0 = Date.now();
    await page.goto(POS, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
    await page.waitForTimeout(3000);
    console.log('⏱ Carga POS: ' + (Date.now() - t0) + 'ms');

    const added = await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll('.product_box')).find(b => /aaa-mult[ií]metro automotriz digital/i.test(b.textContent||''));
      if (!t) return false;
      (t.querySelector('.product_box_quantity_content')||t).click(); return true;
    });
    if (!added) throw new Error('No se pudo agregar el producto de prueba al carrito');
    await page.waitForTimeout(1500);

    const totalBefore = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('*')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}).find(e=>/^TOTAL:$/i.test((e.textContent||'').trim()));
      return el&&el.nextElementSibling ? el.nextElementSibling.textContent.trim() : null;
    });
    console.log('💰 Total antes del descuento:', totalBefore);

    await page.evaluate(() => document.getElementById('show_invoice_advanced_detail').click());
    await page.waitForTimeout(1000);

    const discountExists = await page.evaluate(() => !!document.getElementById('total_discount_input'));
    if (!discountExists) throw new Error('No se encontró el campo de porcentaje de descuento');

    const t1 = Date.now();
    await page.evaluate(() => {
      const el = document.getElementById('total_discount_input');
      el.value = '10';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    });
    await page.waitForTimeout(2000);
    console.log('⏱ Aplicar descuento: ' + (Date.now() - t1) + 'ms');

    const totalAfter = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('*')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}).find(e=>/^TOTAL:$/i.test((e.textContent||'').trim()));
      return el&&el.nextElementSibling ? el.nextElementSibling.textContent.trim() : null;
    });
    console.log('💰 Total después del descuento del 10%:', totalAfter);

    if (totalAfter && totalBefore && totalAfter !== totalBefore) {
      console.log('✅ CP-042 PASSED: El total cambió correctamente al aplicar el descuento (' + totalBefore + ' -> ' + totalAfter + ')');
    } else {
      throw new Error('El total no cambió tras aplicar el descuento');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp042-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-042 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp042_aplicar_descuento_carrito();
