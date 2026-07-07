const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

async function cp050_tres_puntos_carrito() {
  console.log('🔄 Ejecutando CP-050: Verificar que el menú de tres puntos del carrito muestre sus opciones...');
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

    const menuButtonId = await page.evaluate(() => {
      const isVis = (el) => { const r=el.getBoundingClientRect(),s=window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const icon = Array.from(document.querySelectorAll('.material-icons')).filter(isVis).find(el => (el.textContent||'').trim()==='more_horiz');
      return icon ? icon.parentElement.id : null;
    });
    if (!menuButtonId) throw new Error('No se encontró el botón de tres puntos (more_horiz) en la esquina del carrito');

    const t1 = Date.now();
    await page.evaluate((id) => document.getElementById(id).click(), menuButtonId);
    await page.waitForTimeout(1200);
    console.log('⏱ Abrir menú tres puntos carrito: ' + (Date.now() - t1) + 'ms');

    const menuText = await page.evaluate(() => {
      const isVis = (el) => { const r=el.getBoundingClientRect(),s=window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /producto externo|permisos del pos/i.test(m.textContent||''));
      return menu ? menu.textContent.replace(/\s+/g,' ').trim() : null;
    });
    console.log('⋯ Contenido del menú de tres puntos del carrito:', menuText);

    const requiredOptions = ['Producto externo','Historial de Facturas','Historial de Proformas','Permisos del POS'];
    const missing = menuText ? requiredOptions.filter(o => !menuText.includes(o)) : requiredOptions;

    if (missing.length === 0) {
      console.log('✅ CP-050 PASSED: El menú de tres puntos del carrito muestra sus opciones correctamente');
    } else {
      throw new Error('Faltan opciones en el menú: ' + JSON.stringify(missing));
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp050-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-050 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp050_tres_puntos_carrito();
