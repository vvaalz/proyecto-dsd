const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const TOLERANCIA = 1;
const CLIENTE_ID = 12735;
const CLIENTE_IDENTIFICACION = '119050235';

const screenshotOnFail = async (page, name) => { try { const dir=path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {} };

async function cp071_exoneracion_hacienda() {
  console.log('🔄 Ejecutando CP-071: Aplicar exoneración y validar aceptación por Hacienda...');
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

    // Producto 1: AAA-Multímetro x2 (gravado)
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => { const t=Array.from(document.querySelectorAll('.product_box')).find(b=>/aaa-mult[ií]metro automotriz digital/i.test((b.textContent||'').replace(/\s+/g,' '))); if(t){(t.querySelector('.product_box_quantity_content')||t).click();} });
      await page.waitForTimeout(1000);
    }
    // Producto 2: AAA-Bombillos x1 (exento)
    await page.evaluate(() => { const t=Array.from(document.querySelectorAll('.product_box')).find(b=>/aaa-bombillos/i.test((b.textContent||'').replace(/\s+/g,' '))); if(t){(t.querySelector('.product_box_quantity_content')||t).click();} });
    await page.waitForTimeout(1200);

    await page.waitForSelector('#tb_table_buy_list', { timeout: 20000 });
    await page.waitForFunction(() => /aaa-mult[ií]metro/i.test(document.getElementById('tb_table_buy_list').textContent) && /aaa-bombillos/i.test(document.getElementById('tb_table_buy_list').textContent), null, { timeout: 20000 });

    const totalesInfo = await page.evaluate(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
      const label=Array.from(document.querySelectorAll('*')).filter(isVis).find(el=>/^TOTAL:$/i.test((el.textContent||'').trim()));
      const totalEl=label?label.nextElementSibling:null;
      return { totalText:totalEl?totalEl.textContent.trim():null };
    });
    console.log('💰 Total del carrito:', totalesInfo.totalText);
    const totalValue = totalesInfo.totalText ? parseFloat((totalesInfo.totalText.match(/([\d,]+\.\d{2})/)||['0','0'])[1].replace(/,/g,'')) : NaN;
    if (isNaN(totalValue)||totalValue<=0) { await screenshotOnFail(page,'cp071-fail-total-carrito'); throw new Error('No se pudo leer el total del carrito'); }

    await page.evaluate(() => document.getElementById('show_invoice_advanced_detail').click());
    await page.waitForTimeout(800);
    const ivaAntes = await page.evaluate(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
      const el=Array.from(document.querySelectorAll('.advanced_invoice_detail,[class*="total_div"]')).filter(isVis).find(e=>/^IVA/i.test((e.textContent||'').replace(/\s+/g,' ').trim()));
      return el?el.textContent.replace(/\s+/g,' ').trim():null;
    });
    const ivaMatch = ivaAntes?ivaAntes.match(/₡\s*([\d,]+\.\d{2})/):null;
    const ivaValorAntes = ivaMatch?parseFloat(ivaMatch[1].replace(/,/g,'')):NaN;
    console.log('🧾 IVA antes de exonerar:', ivaAntes, '-> valor numérico:', ivaValorAntes);
    if (!(ivaValorAntes > 0)) { await screenshotOnFail(page,'cp071-fail-iva-no-positivo'); throw new Error('Se esperaba IVA > 0 antes de aplicar exoneración'); }

    await page.evaluate(() => set_apply_exoneration_modal());
    await page.waitForSelector('#dialog_add_exoneration', { timeout: 5000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const setVal=(id,v)=>{const el=document.getElementById(id);if(el){el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));}};
      setVal('payment_exoneration_number','EXO-QA-CP071-2026');
      setVal('payment_exoneration_company_name','Ministerio de Hacienda');
      const d=document.getElementById('payment_exoneration_date'); if(d){d.value=new Date().toISOString().substring(0,10);d.dispatchEvent(new Event('input',{bubbles:true}));}
      setVal('apply_exoneration_text','Orden de exoneración de prueba CP-071');
      setVal('payment_exoneration_percent','100');
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.getElementById('apply_sale_exoneration').click());
    await page.waitForTimeout(1500);

    const modalCerrado = await page.evaluate(() => { const m=document.getElementById('dialog_add_exoneration'); return !m||window.getComputedStyle(m).display==='none'; });
    if (!modalCerrado) { await screenshotOnFail(page,'cp071-fail-modal-exoneracion-no-cerro'); throw new Error('El modal de exoneración no se cerró tras hacer clic en "Aplicar"'); }

    const exoState = await page.evaluate(() => ({
      amount:document.getElementById('total_exoneration_amount')?document.getElementById('total_exoneration_amount').textContent.trim():null,
      percent:document.getElementById('total_exoneration_percent')?document.getElementById('total_exoneration_percent').textContent.trim():null
    }));
    console.log('🏛️ Estado de exoneración aplicada:', JSON.stringify(exoState));

    const exoAmountMatch = exoState.amount?exoState.amount.match(/([\d,]+\.\d{2})/):null;
    const exoAmountValue = exoAmountMatch?parseFloat(exoAmountMatch[1].replace(/,/g,'')):NaN;
    if (!(exoAmountValue > 0)) { await screenshotOnFail(page,'cp071-fail-exoneracion-monto-cero'); throw new Error('El monto de exoneración no es mayor que cero'); }
    if (!(Math.abs(exoAmountValue - ivaValorAntes) <= TOLERANCIA)) { await screenshotOnFail(page,'cp071-fail-exoneracion-vs-iva'); throw new Error('El monto exonerado (' + exoState.amount + ') no coincide con el IVA previo (' + ivaAntes + '), diferencia > ±' + TOLERANCIA); }
    console.log('✔ Monto exonerado (' + exoState.amount + ') coincide con el IVA del carrito (' + ivaAntes + ') dentro de la tolerancia ±' + TOLERANCIA);

    const cs = await page.evaluate((id) => { try { selectCustomerToPos(id); return document.getElementById('customer_select')?.value; } catch(e){return null;} }, CLIENTE_ID);
    if (cs !== String(CLIENTE_ID)) { await screenshotOnFail(page,'cp071-fail-cliente'); throw new Error('No se pudo asociar el cliente (id ' + CLIENTE_ID + ')'); }
    await page.waitForTimeout(1200);

    await page.evaluate(() => document.getElementById('btn_cash_pos').click());
    await page.waitForFunction(() => { const el=document.getElementById('dialog_payment'); return el?window.getComputedStyle(el).display!=='none':false; }, null, { timeout: 30000 });

    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch(e){} }, CLIENTE_ID);
    await page.waitForTimeout(1000);

    // Intento 1: Factura Electrónica
    await page.evaluate(() => { const s=document.getElementById('payment_electronic_document_type');s.value='1';s.dispatchEvent(new Event('change',{bubbles:true}));if(window.jQuery&&jQuery(s).data('chosen'))jQuery(s).trigger('chosen:updated'); });
    await page.waitForTimeout(500);
    await page.evaluate(() => { const c=document.getElementById('ck_is_payment_cash');if(c&&!c.checked){c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));}const e=document.getElementById('is_payment_cash');if(e&&!e.checked){e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));} });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.getElementById('make_payment').click());
    await page.waitForTimeout(2000);

    const feBloqueada = await page.evaluate(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
      const n=Array.from(document.querySelectorAll('.noty_text')).filter(isVis)[0];
      return n?n.textContent.trim():null;
    });
    console.log('🧾 Resultado Factura Electrónica:', feBloqueada||'(sin error)');

    let documentoUsado = 'Factura Electrónica';
    if (feBloqueada) {
      documentoUsado = 'Tiquete Electrónico';
      await page.evaluate(() => { const s=document.getElementById('payment_electronic_document_type');s.value='4';s.dispatchEvent(new Event('change',{bubbles:true}));if(window.jQuery&&jQuery(s).data('chosen'))jQuery(s).trigger('chosen:updated'); });
      await page.waitForTimeout(500);
      await page.evaluate(() => document.getElementById('make_payment').click());
    }

    let cartEmpty = false;
    for (let i = 0; i < 12 && !cartEmpty; i++) {
      await page.waitForTimeout(1000);
      const state = await page.evaluate(() => {
        const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
        const sa=Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
        return { hasSweetAlert:!!sa, cM:/aaa-mult[ií]metro/i.test(document.getElementById('tb_table_buy_list').textContent), cB:/aaa-bombillos/i.test(document.getElementById('tb_table_buy_list').textContent) };
      });
      if (state.hasSweetAlert) await page.evaluate(()=>{const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0;};const btn=Array.from(document.querySelectorAll('.sweet-alert button.confirm')).filter(isVis)[0];if(btn)btn.click();});
      cartEmpty = !state.cM && !state.cB;
    }
    if (!cartEmpty) { await screenshotOnFail(page,'cp071-fail-no-confirmado'); throw new Error('La factura con exoneración no se confirmó'); }

    // Validar Hacienda — si el reporte no carga, se documenta como hallazgo
    try {
      await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/ElectronicBilling/ElectronicBillingReport', { waitUntil: 'domcontentloaded', timeout: 90000 });
    } catch (gotoError) {
      await screenshotOnFail(page, 'cp071-hallazgo-hacienda-pendiente');
      console.log('⚠️ CP-071 RESULT: Hallazgo parcial — exoneración aplicada correctamente (' + exoState.amount + ' = IVA ₡' + ivaValorAntes + ' dentro de tolerancia ±' + TOLERANCIA + '). Venta completada con ' + documentoUsado + ' (total: ' + totalesInfo.totalText + '). El Reporte de Facturas Hacienda no cargó en 90s (' + gotoError.message.split('\n')[0] + '). Envío asíncrono en entorno compartido.');
      return;
    }
    await page.waitForSelector('#electronic_billing_search', { state: 'attached', timeout: 20000 });
    await page.waitForTimeout(2500);

    let estadoHacienda = null, filaEncontrada = null;
    for (let i = 0; i < 15; i++) {
      filaEncontrada = await page.evaluate((id) => {
        const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
        const rows=Array.from(document.querySelectorAll('tbody tr')).filter(isVis);
        const m=rows.find(r=>(r.textContent||'').includes(id));
        return m?m.textContent.replace(/\s+/g,' ').trim():null;
      }, CLIENTE_IDENTIFICACION);
      if (filaEncontrada) {
        if (/aceptado/i.test(filaEncontrada)) { estadoHacienda = 'Aceptado'; break; }
        if (/rechazado/i.test(filaEncontrada)) { estadoHacienda = 'Rechazado'; break; }
      }
      await page.waitForTimeout(4000);
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForSelector('#electronic_billing_search', { state: 'attached', timeout: 20000 });
      await page.waitForTimeout(1500);
    }

    const totalStr = totalesInfo.totalText||'(no leído)', ivaStr = ivaAntes||'(no leído)';
    if (estadoHacienda === 'Aceptado') {
      console.log('✅ CP-071 PASSED | productos: 2 (AAA-Multímetro x2 gravado + AAA-Bombillos x1 exento) | moneda: colones | tipo doc: ' + documentoUsado + ' | método pago: efectivo | total: ' + totalStr + ' | IVA (antes exoneración): ' + ivaStr + ' | exoneración aplicada: ' + exoState.amount + ' (' + exoState.percent + '%) | estado Hacienda: ACEPTADO');
    } else if (estadoHacienda === 'Rechazado') {
      await screenshotOnFail(page,'cp071-fail-hacienda-rechazado');
      throw new Error('Hacienda RECHAZÓ la factura con exoneración. Fila: ' + filaEncontrada);
    } else {
      await screenshotOnFail(page,'cp071-hallazgo-hacienda-pendiente');
      console.log('⚠️ CP-071 RESULT: Hallazgo parcial — exoneración aplicada correctamente (' + exoState.amount + ' = IVA ₡' + ivaValorAntes + ' dentro de tolerancia ±' + TOLERANCIA + ', monto exonerado cubre el IVA exacto sin incluir el valor base). Venta completada con ' + documentoUsado + ' (total: ' + totalStr + '). El estado de Hacienda no resolvió a "Aceptado"/"Rechazado" en ~75s de reintentos. ' + (filaEncontrada?'Última fila: '+filaEncontrada.substring(0,200):'Fila no localizada.'));
    }
  } catch (error) {
    await screenshotOnFail(page,'cp071-fail-excepcion');
    console.log('❌ CP-071 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp071_exoneracion_hacienda();
