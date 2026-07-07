const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp033_agregar_producto_carrito() {
  console.log('🔄 Ejecutando CP-033: Verificar que agregar un producto al carrito muestre el precio correcto...');

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
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
      return true;
    });
    if (!added) throw new Error('No se encontró la tarjeta "AAA-Multímetro Automotriz Digital"');
    await page.waitForTimeout(2000);

    const cartRowFull = await page.evaluate(() => {
      const table = document.getElementById('tb_table_buy_list');
      if (!table) return null;
      const text = (table.textContent || '').replace(/\s+/g, ' ').trim();
      return text.includes('AAA-Multímetro Automotriz Digital') ? text : null;
    });
    const hasCorrectPrice = cartRowFull && /100\.00|100,00|₡\s*100\b/.test(cartRowFull);

    const cartTotal = await page.evaluate(() => {
      const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const totalLabel = Array.from(document.querySelectorAll('*')).filter(isVisible).find(el => /^TOTAL:$/i.test((el.textContent || '').trim()));
      const next = totalLabel ? totalLabel.nextElementSibling : null;
      return next ? next.textContent.trim() : null;
    });

    const priceCorrect = hasCorrectPrice && cartTotal === '₡100.00';
    if (priceCorrect) {
      console.log('✅ CP-033 PASSED: El producto aparece en el carrito con el precio correcto (₡100.00). Total: ' + cartTotal);
    } else {
      throw new Error('cartRow=' + JSON.stringify(cartRowFull ? cartRowFull.slice(0,100) : null) + ', cartTotal=' + cartTotal);
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp033-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-033 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp033_agregar_producto_carrito();
