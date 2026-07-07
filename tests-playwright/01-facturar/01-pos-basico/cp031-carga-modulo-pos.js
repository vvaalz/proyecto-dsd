const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

async function cp031_carga_modulo_pos() {
  console.log('🔄 Ejecutando CP-031: Verificar que el módulo POS (Facturar) cargue correctamente...');

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
    await page.goto(POS_URL);
    await page.waitForSelector('#product_search', { timeout: 20000 });
    await page.waitForTimeout(4000);
    console.log('⏱ Carga POS: ' + (Date.now() - inicio) + 'ms');

    // Si aparece modal de selección de compañía, seleccionar "TALLER ALPHA PREMIUM"
    const companyOptionClicked = await page.evaluate(() => {
      const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const opt = Array.from(document.querySelectorAll('button, a, li, div')).filter(isVisible).find(el => /taller alpha premium/i.test((el.textContent || '').trim()) && (el.textContent || '').trim().length < 60);
      if (opt) { opt.click(); return true; }
      return false;
    });
    if (companyOptionClicked) {
      await page.waitForTimeout(2000);
      console.log('ℹ️ Se encontró y seleccionó "TALLER ALPHA PREMIUM" en modal de selección.');
    }

    await page.waitForSelector('#product_search', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const bodyText = await page.locator('body').innerText();
    const showsCompany = /taller alpha premium/i.test(bodyText);
    const showsCategories = /categorías/i.test(bodyText) && /todos/i.test(bodyText);
    const productCount = await page.locator('.product_box').count();
    const showsProducts = productCount > 1;

    if (showsCompany && showsCategories && showsProducts) {
      console.log('✅ CP-031 PASSED: El POS cargó con la compañía TALLER ALPHA PREMIUM, categorías y productos visibles');
    } else {
      throw new Error('showsCompany=' + showsCompany + ', showsCategories=' + showsCategories + ', showsProducts=' + showsProducts + '(count=' + productCount + ')');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp031-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-031 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp031_carga_modulo_pos();
