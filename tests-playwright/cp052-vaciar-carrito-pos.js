const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

async function cp052_vaciar_carrito_pos() {
  console.log('🔄 Ejecutando CP-052: Verificar que vaciar el carrito lo deje vacío...');
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
      const t=Array.from(document.querySelectorAll('.product_box')).find(b=>/aaa-mult[ií]metro automotriz digital/i.test(b.textContent||''));
      if(!t)return false;
      (t.querySelector('.product_box_quantity_content')||t).click();return true;
    });
    if (!added) throw new Error('No se pudo agregar el producto de prueba al carrito');
    await page.waitForTimeout(1500);

    const cartHasItemBefore = await page.evaluate(() => {
      const t=document.getElementById('tb_table_buy_list');
      return t?/aaa-mult[ií]metro automotriz digital/i.test(t.textContent||''):false;
    });
    if (!cartHasItemBefore) throw new Error('El producto no quedó en el carrito antes de intentar vaciarlo');

    const emptyClicked = await page.evaluate(() => {
      const btn=document.getElementById('cancel_sale');
      if(!btn)return false;
      const link=btn.querySelector('a')||btn;
      link.click();return true;
    });
    if (!emptyClicked) throw new Error('No se encontró el botón de vaciar carrito (cancel_sale)');
    await page.waitForTimeout(2000);

    const t1 = Date.now();
    const confirmClicked = await page.evaluate(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
      const btn=Array.from(document.querySelectorAll('button.confirm')).filter(isVis).find(b=>/limpiar lista/i.test((b.textContent||'').trim()));
      if(btn){btn.click();return true;}return false;
    });
    if (confirmClicked) {
      console.log('⏱ Confirmar vaciar carrito: ' + (Date.now() - t1) + 'ms');
      await page.waitForTimeout(1500);
    }

    const cartEmptyAfter = await page.evaluate(() => {
      const t=document.getElementById('tb_table_buy_list');
      const stillHasItem=t?/aaa-mult[ií]metro automotriz digital/i.test(t.textContent||''):false;
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
      const showsEmptyPlaceholder=Array.from(document.querySelectorAll('*')).filter(isVis).some(el=>/agrega productos para facturar/i.test((el.textContent||'').trim())&&(el.textContent||'').trim().length<60);
      return { stillHasItem, showsEmptyPlaceholder };
    });
    console.log('🛒 Estado del carrito tras vaciarlo:', JSON.stringify(cartEmptyAfter));

    if (!cartEmptyAfter.stillHasItem && cartEmptyAfter.showsEmptyPlaceholder) {
      console.log('✅ CP-052 PASSED: El carrito quedó vacío tras hacer clic en vaciar carrito');
    } else {
      throw new Error('El carrito no quedó vacío tras intentar vaciarlo');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp052-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-052 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp052_vaciar_carrito_pos();
