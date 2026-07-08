const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const PRECIO_ESPERADO = 100;
const TOLERANCIA = 1;

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
    if (state.hasSweetAlert) await page.evaluate(()=>{const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0;};const btn=Array.from(document.querySelectorAll('.sweet-alert button.confirm')).filter(isVis)[0];if(btn)btn.click();});
    cartEmpty = !state.cartHasProduct;
  }
  return cartEmpty;
}

const screenshotOnFail = async (page, name) => { try { const dir=path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {} };

async function cp069_facturar_contingencia() {
  console.log('🔄 Ejecutando CP-069: Activar modo de contingencia y facturar...');
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
      const t=Array.from(document.querySelectorAll('.product_box')).find(b=>/aaa-mult[ií]metro automotriz digital/i.test((b.textContent||'').replace(/\s+/g,' ')));
      if(!t)return false; (t.querySelector('.product_box_quantity_content')||t).click(); return true;
    });
    if (!added) { await screenshotOnFail(page,'cp069-fail-producto-no-encontrado'); throw new Error('No se encontró el producto de prueba'); }

    await page.waitForSelector('#tb_table_buy_list', { timeout: 20000 });
    await page.waitForFunction(() => /aaa-mult[ií]metro/i.test(document.getElementById('tb_table_buy_list').textContent), null, { timeout: 20000 });

    const cartTotalText = await page.evaluate(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
      const label=Array.from(document.querySelectorAll('*')).filter(isVis).find(el=>/^TOTAL:$/i.test((el.textContent||'').trim()));
      const next=label?label.nextElementSibling:null; return next?next.textContent.trim():null;
    });
    const cartTotalValue = cartTotalText ? parseFloat((cartTotalText.match(/([\d,]+\.\d{2})/)||['0','0'])[1].replace(/,/g,'')) : NaN;
    console.log('💰 Total del carrito leído:', cartTotalText, '-> valor numérico:', cartTotalValue);
    if (!(Math.abs(cartTotalValue - PRECIO_ESPERADO) <= TOLERANCIA)) { await screenshotOnFail(page,'cp069-fail-monto-total'); throw new Error('El total del carrito (' + cartTotalText + ') no coincide con el esperado ₡' + PRECIO_ESPERADO + ' (tolerancia ±' + TOLERANCIA + ')'); }

    const cs = await page.evaluate(() => { try { selectCustomerToPos(12735); return document.getElementById('customer_select')?.value; } catch(e){return null;} });
    if (cs !== '12735') { await screenshotOnFail(page,'cp069-fail-cliente'); throw new Error('No se pudo asociar el cliente de prueba (id 12735)'); }
    await page.waitForTimeout(1200);

    await page.evaluate(() => document.getElementById('btn_cash_pos').click());
    await page.waitForFunction(() => { const el=document.getElementById('dialog_payment'); return el?window.getComputedStyle(el).display!=='none':false; }, null, { timeout: 10000 });

    await page.evaluate(() => { try { selectCustomerToPos(12735); } catch(e){} });
    await page.waitForTimeout(1000);

    const boxVisibleBefore = await page.evaluate(() => {
      const isVis=(el)=>{if(!el)return false;const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
      return isVis(document.getElementById('contingency_invoice_box'));
    });

    await page.evaluate(() => { const ck=document.getElementById('ck_contingency_invoice'); if(ck){ck.checked=true;ck.dispatchEvent(new Event('change',{bubbles:true}));} });
    await page.waitForSelector('#contingency_invoice_box', { timeout: 5000 });
    await page.waitForTimeout(500);

    const docTypeForzado = await page.evaluate(() => document.getElementById('payment_electronic_document_type').value);

    await page.evaluate(() => {
      const select=document.getElementById('payment_electronic_document_type');
      if(select){select.value='4';select.dispatchEvent(new Event('change',{bubbles:true}));if(window.jQuery&&jQuery(select).data('chosen'))jQuery(select).trigger('chosen:updated');}
    });
    await page.waitForTimeout(500);

    const contingencyState = await page.evaluate(() => {
      const isVis=(el)=>{if(!el)return false;const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
      return {
        checked:document.getElementById('ck_contingency_invoice').checked,
        boxVisible:isVis(document.getElementById('contingency_invoice_box')),
        numberVisible:isVis(document.getElementById('contingency_invoice_number')),
        dateVisible:isVis(document.getElementById('contingency_invoice_date')),
        dateValue:document.getElementById('contingency_invoice_date').value,
        reasonVisible:isVis(document.getElementById('contingency_invoice_reason')),
        documentTypeFinal:document.getElementById('payment_electronic_document_type').value
      };
    });
    console.log('🧾 Estado del formulario de contingencia:', JSON.stringify({...contingencyState, docTypeForzado}));

    const toggleOk = !boxVisibleBefore && contingencyState.checked && contingencyState.boxVisible && contingencyState.numberVisible && contingencyState.dateVisible && contingencyState.reasonVisible && docTypeForzado==='1' && contingencyState.documentTypeFinal==='4' && !!contingencyState.dateValue;
    if (!toggleOk) { await screenshotOnFail(page,'cp069-fail-toggle-contingencia'); throw new Error('El toggle "Factura por Contingencia" no se comportó como se esperaba'); }

    await page.evaluate(() => {
      const num=document.getElementById('contingency_invoice_number'); if(num){num.value='00100001010000000001';num.dispatchEvent(new Event('input',{bubbles:true}));}
      const reason=document.getElementById('contingency_invoice_reason'); if(reason){reason.value='Falla de conexión con el servicio de Hacienda - prueba CP-069';reason.dispatchEvent(new Event('input',{bubbles:true}));}
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const cash=document.getElementById('ck_is_payment_cash'); if(cash&&!cash.checked){cash.checked=true;cash.dispatchEvent(new Event('change',{bubbles:true}));}
      const ef=document.getElementById('is_payment_cash'); if(ef&&!ef.checked){ef.checked=true;ef.dispatchEvent(new Event('change',{bubbles:true}));}
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.getElementById('make_payment').click());

    const cartEmpty = await confirmSweetAlerts(page, 'aaa-mult[ií]metro');
    if (cartEmpty) {
      console.log('✅ CP-069 PASSED: El modo de contingencia se activó correctamente (formulario completo, forzado inicial a Factura Electrónica), el total (' + cartTotalText + ') fue válido y la factura se completó como Tiquete Electrónico bajo contingencia.');
    } else {
      await screenshotOnFail(page,'cp069-fail-no-confirmado');
      throw new Error('La factura de contingencia no se confirmó (el producto sigue en el carrito)');
    }
  } catch (error) {
    await screenshotOnFail(page,'cp069-fail-excepcion');
    console.log('❌ CP-069 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp069_facturar_contingencia();
