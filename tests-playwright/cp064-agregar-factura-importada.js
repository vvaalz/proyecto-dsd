const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

async function cp064_agregar_factura_importada() {
  console.log('🔄 Ejecutando CP-064: Agregar productos a una factura importada y luego facturar...');
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
    await page.goto(POS, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
    await page.waitForTimeout(2000);
    console.log('⏱ Carga POS: ' + (Date.now() - t0) + 'ms');

    await page.evaluate(() => document.getElementById('btn_import_invoice_option').click());
    await page.waitForTimeout(2500);

    const showViewOnclick = await page.evaluate(() => {
      const el=document.querySelector('[onclick^="show_invoice_import_view"]');
      return el?el.getAttribute('onclick'):null;
    });
    if (!showViewOnclick) throw new Error('No se encontró ninguna factura en el historial de (F5) Importar factura');

    await page.evaluate((onclick) => { eval(onclick); }, showViewOnclick);
    await page.waitForSelector('#dialog_invoice_import_detail_view', { timeout: 10000 });
    await page.waitForTimeout(1500);

    const importOnclick = await page.evaluate(() => {
      const modal=document.getElementById('dialog_invoice_import_detail_view');
      if(!modal)return null;
      const btn=Array.from(modal.querySelectorAll('a.import-button')).find(a=>/importar/i.test(a.textContent||''));
      return btn?btn.getAttribute('onclick'):null;
    });
    if (!importOnclick) throw new Error('No se encontró el botón "IMPORTAR" en el detalle de la factura');

    await page.evaluate((onclick) => { eval(onclick); }, importOnclick);
    await page.waitForTimeout(2000);

    await page.evaluate(() => document.getElementById('btn_pos_option').click());
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 15000 });
    await page.waitForTimeout(1500);

    const rowsFromInvoice = await page.evaluate(() => document.querySelectorAll('#table_buy_list tr.main_row').length);
    if (!(rowsFromInvoice > 0)) throw new Error('La factura importada no agregó líneas al carrito');
    console.log('🧾 Filas en el carrito provenientes de la factura importada:', rowsFromInvoice);

    await page.waitForSelector('.product_box', { state: 'attached', timeout: 20000 });
    const added = await page.evaluate(() => {
      const t=Array.from(document.querySelectorAll('.product_box')).find(b=>/aaa-bombillos/i.test(b.textContent||''));
      if(!t)return false; (t.querySelector('.product_box_quantity_content')||t).click(); return true;
    });
    if (!added) throw new Error('No se pudo agregar el producto adicional a la factura importada');

    const productAdded = await page.waitForFunction(() => /aaa-bombillos/i.test(document.getElementById('tb_table_buy_list').textContent), null, { timeout: 8000 }).then(()=>true).catch(()=>false);
    if (!productAdded) throw new Error('El producto adicional no se reflejó en el carrito de la factura importada');
    console.log('🧾 Producto adicional agregado correctamente a la factura importada');

    const existingCustomer = await page.evaluate(() => { const el=document.getElementById('customer_select'); return el?el.value:null; });
    console.log('👤 Cliente ya asociado por la factura importada:', existingCustomer);
    let customerOk = existingCustomer && existingCustomer !== '0' && existingCustomer !== '';
    if (!customerOk) {
      const cs = await page.evaluate(() => { try { selectCustomerToPos(12735); return document.getElementById('customer_select')?.value; } catch(e){return null;} });
      customerOk = cs === '12735';
    }
    if (!customerOk) throw new Error('No se pudo asociar ningún cliente a la factura');
    await page.waitForTimeout(1200);

    await page.evaluate(() => document.getElementById('btn_cash_pos').click());
    await page.waitForFunction(() => { const el=document.getElementById('dialog_payment'); return el?window.getComputedStyle(el).display!=='none':false; }, null, { timeout: 20000 });

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
        if (/navigation|context/i.test(navError.message)) { cartEmpty = true; break; }
        throw navError;
      }
    }

    if (cartEmpty) {
      console.log('✅ CP-064 PASSED: Se agregaron productos a la factura importada y se completó la factura');
    } else {
      throw new Error('La factura importada con productos agregados no se confirmó');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp064-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-064 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp064_agregar_factura_importada();
