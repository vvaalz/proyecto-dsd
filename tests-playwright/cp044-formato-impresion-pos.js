const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

async function cp044_formato_impresion_pos() {
  console.log('🔄 Ejecutando CP-044: Verificar que el selector de formato de impresión muestre todas las opciones...');
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

    const printBtnExists = await page.evaluate(() => !!document.getElementById('menu_type_print'));
    if (!printBtnExists) throw new Error('No se encontró el ícono de impresora en el encabezado');

    await page.evaluate(() => document.getElementById('menu_type_print').click());
    await page.waitForTimeout(1200);

    const menuText = await page.evaluate(() => {
      const isVis = (el) => { const r=el.getBoundingClientRect(),s=window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /tipo de impresi[oó]n/i.test(m.textContent||''));
      return menu ? menu.textContent.replace(/\s+/g,' ').trim() : null;
    });
    console.log('🖨️ Contenido del menú de formato de impresión:', menuText);

    const requiredFormats = ['A4','Punto de Venta','Impresora - Driver Genérico','Impresión Aduanas','Impresión MZ','A4 Plantilla 2','Punto de Venta v2','Factura Matricial','A4 custom Honduras'];
    const missing = menuText ? requiredFormats.filter(o => !menuText.includes(o)) : requiredFormats;

    if (missing.length === 0) {
      console.log('✅ CP-044 PASSED: El selector de impresión muestra los 9 formatos esperados');
    } else {
      throw new Error('Faltan formatos de impresión: ' + JSON.stringify(missing));
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp044-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-044 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp044_formato_impresion_pos();
