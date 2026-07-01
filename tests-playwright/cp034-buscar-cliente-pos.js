const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

async function cp034_buscar_cliente_pos() {
  console.log('🔄 Ejecutando CP-034: Verificar que se pueda asociar un cliente a la factura del POS...');

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

    const customerName = 'Cliente Prueba CP034';

    const agregarClicked = await page.evaluate(() => {
      const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVisible).find(b => (b.textContent || '').trim() === 'Agregar');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!agregarClicked) throw new Error('No se encontró el botón "Agregar" junto al buscador de cliente');
    await page.waitForTimeout(800);

    await page.evaluate(() => { if (typeof editQuickCustomerName === 'function') editQuickCustomerName(); });
    await page.waitForTimeout(1000);

    const tempInputExists = await page.evaluate(() => !!document.getElementById('temporal_customer_name'));
    if (!tempInputExists) throw new Error('No apareció el campo "Nombre del cliente" tras hacer clic en Agregar');

    await page.evaluate((name) => {
      const el = document.getElementById('temporal_customer_name');
      el.value = name;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof setTemporalCustomerName === 'function') setTemporalCustomerName();
    }, customerName);
    await page.waitForTimeout(2000);

    const customerAssociated = await page.evaluate((name) => {
      const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const inText = Array.from(document.querySelectorAll('*')).filter(isVisible).some(el => (el.textContent || '').includes(name) && el.children.length === 0);
      const inValue = Array.from(document.querySelectorAll('input')).filter(isVisible).some(el => (el.value || '').includes(name));
      return inText || inValue;
    }, customerName);

    if (customerAssociated) {
      console.log('✅ CP-034 PASSED: El cliente "' + customerName + '" quedó asociado a la factura del POS');
    } else {
      throw new Error('No se observó la información del cliente asociada a la factura tras registrarlo');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp034-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-034 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp034_buscar_cliente_pos();
