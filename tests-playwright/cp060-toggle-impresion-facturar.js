const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

async function cp060_toggle_impresion_facturar() {
  console.log('🔄 Ejecutando CP-060: Deshabilitar/habilitar la impresión y generar facturas en ambos estados...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.clearCookies();
  const page = await context.newPage();

  const pressF8 = async () => {
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', code: 'F8', keyCode: 119, which: 119, bubbles: true })));
    await page.waitForTimeout(1500);
  };
  const readPrintState = async () => {
    const body = await page.locator('body').innerText();
    const matches = [...body.matchAll(/impresi[oó]n de facturas (activada|desactivada)/gi)];
    if (matches.length === 0) return null;
    return matches[matches.length - 1][1].toLowerCase();
  };
  const facturarProductoGravado = async () => {
    await page.waitForSelector('.product_box', { timeout: 15000 });
    const added = await page.evaluate(() => {
      const t=Array.from(document.querySelectorAll('.product_box')).find(b=>/aaa-mult[ií]metro automotriz digital/i.test(b.textContent||''));
      if(!t)return false; (t.querySelector('.product_box_quantity_content')||t).click(); return true;
    });
    if (!added) return false;

    await page.waitForSelector('#tb_table_buy_list', { timeout: 20000 });
    // null como arg para que { timeout } sea interpretado como options (3er argumento)
    await page.waitForFunction(() => /aaa-mult[ií]metro/i.test(document.getElementById('tb_table_buy_list').textContent), null, { timeout: 20000 });

    const customerSelected = await page.evaluate(() => {
      try { selectCustomerToPos(12735); return document.getElementById('customer_select')?document.getElementById('customer_select').value:null; } catch(e){return null;}
    });
    if (customerSelected !== '12735') return false;
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
      const state = await page.evaluate(() => {
        const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
        const sa=Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
        return { hasSweetAlert:!!sa, cartHasProduct:/aaa-mult[ií]metro/i.test(document.getElementById('tb_table_buy_list').textContent) };
      });
      if (state.hasSweetAlert) {
        await page.evaluate(() => {
          const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0;};
          const btn=Array.from(document.querySelectorAll('.sweet-alert button.confirm')).filter(isVis)[0];
          if(btn)btn.click();
        });
      }
      cartEmpty = !state.cartHasProduct;
    }
    return cartEmpty;
  };

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

    // Asegurar impresión DESACTIVADA
    await pressF8();
    let state = await readPrintState();
    if (state !== 'desactivada') { await pressF8(); state = await readPrintState(); }
    if (state !== 'desactivada') throw new Error('No se pudo confirmar el estado "Impresión de facturas DESACTIVADA" tras presionar F8');
    console.log('🖨️ Estado tras deshabilitar:', state);

    const t1 = Date.now();
    const facturaSinImpresionOk = await facturarProductoGravado();
    console.log('⏱ Factura sin impresión: ' + (Date.now() - t1) + 'ms');
    if (!facturaSinImpresionOk) throw new Error('No se pudo generar la factura con la impresión deshabilitada');

    // Esperar a que el POS se resetee completamente antes de la segunda factura
    await page.waitForTimeout(2000);

    // Volver a ACTIVAR la impresión
    await pressF8();
    const state2 = await readPrintState();
    if (state2 !== 'activada') throw new Error('No se pudo confirmar el estado "Impresión de facturas ACTIVADA" tras presionar F8 nuevamente');
    console.log('🖨️ Estado tras habilitar:', state2);

    const t2 = Date.now();
    const facturaConImpresionOk = await facturarProductoGravado();
    console.log('⏱ Factura con impresión: ' + (Date.now() - t2) + 'ms');
    if (!facturaConImpresionOk) throw new Error('No se pudo generar la factura con la impresión habilitada');

    console.log('✅ CP-060 PASSED: Se deshabilitó/habilitó la impresión (F8) y se generaron facturas correctamente en ambos estados');
  } catch (error) {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp060-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-060 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp060_toggle_impresion_facturar();
