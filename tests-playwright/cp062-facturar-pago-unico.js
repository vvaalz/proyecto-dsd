const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

async function confirmSweetAlerts(page, productPattern, maxRetries = 12) {
  let cartEmpty = false;
  for (let i = 0; i < maxRetries && !cartEmpty; i++) {
    await page.waitForTimeout(1000);
    const state = await page.evaluate((pat) => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
      const sa=Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
      const re=new RegExp(pat,'i');
      return { hasSweetAlert:!!sa, cartHasProduct:re.test(document.getElementById('tb_table_buy_list').textContent) };
    }, productPattern);
    if (state.hasSweetAlert) {
      await page.evaluate(()=>{
        const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0;};
        const btn=Array.from(document.querySelectorAll('.sweet-alert button.confirm')).filter(isVis)[0];
        if(btn)btn.click();
      });
    }
    cartEmpty = !state.cartHasProduct;
  }
  return cartEmpty;
}

async function cp062_facturar_pago_unico() {
  console.log('🔄 Ejecutando CP-062: Verificar facturación con un solo método de pago (tarjeta)...');
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
    await page.waitForSelector('.product_box', { timeout: 15000 });
    console.log('⏱ Carga POS: ' + (Date.now() - t0) + 'ms');

    const added = await page.evaluate(() => {
      const t=Array.from(document.querySelectorAll('.product_box')).find(b=>/aaa-mult[ií]metro automotriz digital/i.test(b.textContent||''));
      if(!t)return false; (t.querySelector('.product_box_quantity_content')||t).click(); return true;
    });
    if (!added) throw new Error('No se encontró el producto de prueba');

    await page.waitForSelector('#tb_table_buy_list', { timeout: 20000 });
    await page.waitForFunction(() => /aaa-mult[ií]metro/i.test(document.getElementById('tb_table_buy_list').textContent), null, { timeout: 10000 });

    const customerSelected = await page.evaluate(() => {
      try { selectCustomerToPos(12735); return document.getElementById('customer_select')?.value; } catch(e){return null;}
    });
    if (customerSelected !== '12735') throw new Error('No se pudo asociar el cliente de prueba (id 12735)');
    await page.waitForTimeout(1200);

    await page.evaluate(() => document.getElementById('btn_cash_pos').click());
    await page.waitForFunction(() => { const el=document.getElementById('dialog_payment'); return el?window.getComputedStyle(el).display!=='none':false; }, null, { timeout: 10000 });
    await page.waitForTimeout(800);

    const totalToPay = await page.evaluate(() => {
      const f=document.getElementById('payment_cash_total');
      return f?parseFloat(f.value||'0'):0;
    });
    if (!(totalToPay > 0)) throw new Error('No se pudo determinar el monto total a pagar');
    console.log('💰 Monto total a pagar con tarjeta:', totalToPay);

    await page.evaluate(() => {
      const card=document.getElementById('is_payment_credit_card');
      if(card&&!card.checked){card.checked=true;card.dispatchEvent(new Event('change',{bubbles:true}));}
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const cash=document.getElementById('ck_is_payment_cash');
      if(cash&&cash.checked){cash.checked=false;cash.dispatchEvent(new Event('change',{bubbles:true}));}
      const ef=document.getElementById('is_payment_cash');
      if(ef&&ef.checked){ef.checked=false;ef.dispatchEvent(new Event('change',{bubbles:true}));}
    });
    await page.waitForTimeout(500);

    await page.evaluate((total) => {
      const el=document.getElementById('payment_credit_card_total');
      if(el){el.value=total;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
    }, totalToPay);
    await page.waitForTimeout(500);

    await page.evaluate(() => document.getElementById('make_payment').click());
    const cartEmpty = await confirmSweetAlerts(page, 'aaa-mult[ií]metro');

    if (cartEmpty) {
      console.log('✅ CP-062 PASSED: Se facturó con un solo método de pago (tarjeta ₡' + totalToPay + ') y la venta se completó');
    } else {
      throw new Error('La factura con pago único no se confirmó (el producto sigue en el carrito)');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp062-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-062 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp062_facturar_pago_unico();
