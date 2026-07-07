const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp032_buscar_producto_pos() {
  console.log('🔄 Ejecutando CP-032: Verificar que buscar un producto en el POS lo muestre en los resultados...');

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
    await page.waitForSelector('#product_search', { timeout: 20000 });
    await page.waitForTimeout(3000);
    console.log('⏱ Carga POS: ' + (Date.now() - inicio) + 'ms');

    const searchInput = page.locator('#product_search');
    await page.evaluate(() => {
      const el = document.getElementById('product_search');
      if (el) { el.scrollIntoView(true); el.focus(); }
    });
    await searchInput.fill('AAA-Multímetro Automotriz Digital');
    await page.waitForTimeout(2500);

    const productVisible = await page.evaluate(() => {
      const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find(b => /aaa-mult[ií]metro automotriz digital/i.test(b.textContent || ''));
      return target ? isVisible(target) : false;
    });

    if (productVisible) {
      console.log('✅ CP-032 PASSED: "AAA-Multímetro Automotriz Digital" aparece visible en los resultados del buscador');
    } else {
      throw new Error('El producto buscado no aparece visible en los resultados');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp032-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-032 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp032_buscar_producto_pos();
