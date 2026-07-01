const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

async function cp063_agregar_orden_existente() {
  console.log('🔄 Ejecutando CP-063: Agregar productos a una orden existente (Taller) y luego facturar...');
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
    await page.waitForTimeout(2000);
    console.log('⏱ Carga POS: ' + (Date.now() - t0) + 'ms');

    await page.evaluate(() => document.getElementById('btn_taller_option').click());
    await page.waitForTimeout(2500);

    const onclickAttr = await page.evaluate(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
      const card=Array.from(document.querySelectorAll('.pos-order-card')).filter(isVis)[0];
      return card?card.getAttribute('onclick'):null;
    });
    if (!onclickAttr) throw new Error('No se encontró ninguna orden existente en el tab (F3) Taller');
    console.log('📋 Orden seleccionada:', onclickAttr);

    await page.evaluate((onclick) => { eval(onclick); }, onclickAttr);
    await page.waitForTimeout(2000);

    await page.evaluate(() => document.getElementById('btn_pos_option').click());
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 15000 });
    await page.waitForTimeout(1500);

    const rowsFromOrder = await page.evaluate(() => document.querySelectorAll('#table_buy_list tr.main_row').length);
    if (!(rowsFromOrder > 0)) throw new Error('La orden existente no agregó servicios/productos al carrito');
    console.log('🧾 Filas en el carrito provenientes de la orden:', rowsFromOrder);

    await page.waitForSelector('.product_box', { state: 'attached', timeout: 20000 });
    const added = await page.evaluate(() => {
      const t=Array.from(document.querySelectorAll('.product_box')).find(b=>/aaa-mult[ií]metro automotriz digital/i.test(b.textContent||''));
      if(!t)return false; (t.querySelector('.product_box_quantity_content')||t).click(); return true;
    });
    if (!added) throw new Error('No se pudo agregar el producto adicional a la orden');
    await page.waitForTimeout(1500);

    const productAdded = await page.waitForFunction(() => /aaa-mult[ií]metro/i.test(document.getElementById('tb_table_buy_list').textContent), null, { timeout: 8000 }).then(()=>true).catch(()=>false);
    if (!productAdded) throw new Error('El producto adicional no se reflejó en el carrito de la orden');
    console.log('🧾 Producto adicional agregado correctamente al carrito de la orden');

    const existingCustomer = await page.evaluate(() => { const el=document.getElementById('customer_select'); return el?el.value:null; });
    console.log('👤 Cliente ya asociado por la orden:', existingCustomer);

    let customerOk = existingCustomer && existingCustomer !== '0' && existingCustomer !== '';
    if (!customerOk) {
      const cs = await page.evaluate(() => { try { selectCustomerToPos(12735); return document.getElementById('customer_select')?.value; } catch(e){return null;} });
      customerOk = cs === '12735';
    }
    if (!customerOk) throw new Error('No se pudo asociar ningún cliente a la factura');
    await page.waitForTimeout(1200);

    await page.evaluate(() => document.getElementById('btn_cash_pos').click());
    await page.waitForFunction(() => { const el=document.getElementById('dialog_payment'); return el?window.getComputedStyle(el).display!=='none':false; }, null, { timeout: 10000 });

    await page.evaluate(() => {
      const cash=document.getElementById('ck_is_payment_cash');
      if(cash&&!cash.checked){cash.checked=true;cash.dispatchEvent(new Event('change',{bubbles:true}));}
      const ef=document.getElementById('is_payment_cash');
      if(ef&&!ef.checked){ef.checked=true;ef.dispatchEvent(new Event('change',{bubbles:true}));}
    });
    await page.evaluate(() => document.getElementById('make_payment').click());

    let cartEmpty = false;
    for (let i = 0; i < 12 && !cartEmpty; i++) {
      await page.waitForTimeout(1000);
      try {
        const state = await page.evaluate(() => {
          const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
          const sa=Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
          return { hasSweetAlert:!!sa, rows:document.querySelectorAll('#table_buy_list tr.main_row').length };
        });
        if (state.hasSweetAlert) {
          await page.evaluate(()=>{
            const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0;};
            const btn=Array.from(document.querySelectorAll('.sweet-alert button.confirm')).filter(isVis)[0];
            if(btn)btn.click();
          }).catch(()=>{});
        }
        cartEmpty = state.rows === 0;
      } catch (navError) {
        // El contexto JS se destruyó por una navegación tras el pago — el carrito quedó vacío
        if (/navigation|context/i.test(navError.message)) { cartEmpty = true; break; }
        throw navError;
      }
    }

    if (cartEmpty) {
      console.log('✅ CP-063 PASSED: Se agregaron productos a la orden existente y se completó la factura');
    } else {
      throw new Error('La factura de la orden con productos agregados no se confirmó');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp063-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-063 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp063_agregar_orden_existente();
