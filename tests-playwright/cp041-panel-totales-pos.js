const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const isVis = `(el) => { const r=el.getBoundingClientRect(),s=window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; }`;

async function cp041_panel_totales_pos() {
  console.log('🔄 Ejecutando CP-041: Verificar que el panel de totales muestre subtotal, IVA, descuento, devolución, utilidad y total...');
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

    const arrowFound = await page.evaluate(() => { const b=document.getElementById('show_invoice_advanced_detail'); if(!b)return false; b.click(); return true; });
    if (!arrowFound) throw new Error('No se encontró la flecha para desplegar el panel de totales');
    await page.waitForTimeout(1500);

    const panelText = await page.evaluate(() => {
      const isVis = (el) => { const r=el.getBoundingClientRect(),s=window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return Array.from(document.querySelectorAll('.advanced_invoice_detail,[class*="total_div"],[id="total_utility_div_content"]')).filter(isVis).map(el=>(el.textContent||'').replace(/\s+/g,' ').trim()).join(' | ');
    });
    console.log('📋 Panel de totales:', panelText);

    const requiredFields = ['Subtotal', 'IVA', 'Descuento', 'Devolución tarifa', 'Total utilidad'];
    const missingFields = requiredFields.filter(l => !panelText.includes(l));
    const totalVisible = await page.evaluate(() => Array.from(document.querySelectorAll('*')).filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;}).some(el=>/^TOTAL:$/i.test((el.textContent||'').trim())));

    if (missingFields.length === 0 && totalVisible) {
      console.log('✅ CP-041 PASSED: El panel de totales muestra subtotal, IVA, descuento, devolución de tarifa, total utilidad y total');
    } else {
      throw new Error('Faltan campos: ' + JSON.stringify(missingFields) + ', totalVisible=' + totalVisible);
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp041-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-041 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp041_panel_totales_pos();
