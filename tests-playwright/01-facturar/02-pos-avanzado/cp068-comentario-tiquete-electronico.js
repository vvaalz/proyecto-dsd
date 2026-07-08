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

async function cp068_comentario_tiquete_electronico() {
  console.log('🔄 Ejecutando CP-068: Agregar comentario a un producto + Tiquete Electrónico...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.clearCookies();
  const page = await context.newPage();
  const comentarioTexto = 'Comentario de prueba CP-068';
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
    if (!added) {
      await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp068-fail-producto-no-encontrado-'+Date.now()+'.png'), timeout:5000 }).catch(()=>{});
      throw new Error('No se encontró el producto de prueba');
    }
    await page.waitForSelector('#tb_table_buy_list', { timeout: 20000 });
    await page.waitForFunction(() => /aaa-mult[ií]metro/i.test(document.getElementById('tb_table_buy_list').textContent), null, { timeout: 10000 });

    const opened = await page.evaluate(() => {
      const row=Array.from(document.querySelectorAll('#table_buy_list tr.main_row')).find(r=>/aaa-mult[ií]metro/i.test((r.textContent||'').replace(/\s+/g,' ')));
      if(!row)return false; const btn=row.querySelector('.btn-panel-prod'); if(!btn)return false; btn.click(); return true;
    });
    if (!opened) { await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp068-fail-boton-comentario-'+Date.now()+'.png'), timeout:5000 }).catch(()=>{}); throw new Error('No se encontró el botón de comentario'); }

    await page.waitForSelector('#dialog_product_item_comment', { timeout: 20000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => { const m=document.getElementById('dialog_product_item_comment'); const p=m.querySelector('.btn._add_plus'); if(p)p.click(); });
    await page.waitForSelector('#ta_product_item_comment', { timeout: 5000 });
    await page.waitForTimeout(500);
    await page.evaluate((txt) => { const ta=document.getElementById('ta_product_item_comment'); ta.value=txt; ta.dispatchEvent(new Event('input',{bubbles:true})); }, comentarioTexto);

    const saved = await page.evaluate(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
      const m=document.getElementById('dialog_product_item_comment');
      const btn=Array.from(m.querySelectorAll('button')).filter(isVis).find(b=>/guardar/i.test(b.textContent||''));
      if(!btn)return false; btn.click(); return true;
    });
    if (!saved) { await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp068-fail-boton-guardar-'+Date.now()+'.png'), timeout:5000 }).catch(()=>{}); throw new Error('No se encontró el botón "Guardar" del comentario'); }
    await page.waitForTimeout(1500);

    await page.evaluate(() => {
      const row=Array.from(document.querySelectorAll('#table_buy_list tr.main_row')).find(r=>/aaa-mult[ií]metro/i.test((r.textContent||'').replace(/\s+/g,' ')));
      row.querySelector('.btn-panel-prod').click();
    });
    await page.waitForSelector('#dialog_product_item_comment', { timeout: 20000 });
    await page.waitForTimeout(800);
    const commentPersisted = await page.evaluate(() => { const ta=document.getElementById('ta_product_item_comment'); return ta?ta.value:null; });
    console.log('💬 Comentario recuperado:', commentPersisted);
    if (commentPersisted !== comentarioTexto) {
      await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp068-fail-comentario-no-persistido-'+Date.now()+'.png'), timeout:5000 }).catch(()=>{});
      throw new Error('El comentario no se reflejó al reabrir el diálogo');
    }

    await page.evaluate(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0;};
      const m=document.getElementById('dialog_product_item_comment');
      const btn=Array.from(m.querySelectorAll('button')).filter(isVis).find(b=>/cerrar/i.test(b.textContent||''));
      if(btn)btn.click();
    });
    await page.waitForTimeout(800);

    // Validar total ±1
    const cartTotalText = await page.evaluate(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
      const label=Array.from(document.querySelectorAll('*')).filter(isVis).find(el=>/^TOTAL:$/i.test((el.textContent||'').trim()));
      const next=label?label.nextElementSibling:null;
      return next?next.textContent.trim():null;
    });
    const cartTotalMatch = cartTotalText?cartTotalText.match(/([\d,]+\.\d{2})/):null;
    const cartTotalValue = cartTotalMatch?parseFloat(cartTotalMatch[1].replace(/,/g,'')):NaN;
    console.log('💰 Total del carrito leído:', cartTotalText, '-> valor numérico:', cartTotalValue);
    if (!(Math.abs(cartTotalValue - PRECIO_ESPERADO) <= TOLERANCIA)) {
      await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp068-fail-monto-total-'+Date.now()+'.png'), timeout:5000 }).catch(()=>{});
      throw new Error('El total del carrito (' + cartTotalText + ') no coincide con el esperado ₡' + PRECIO_ESPERADO + ' (tolerancia ±' + TOLERANCIA + ')');
    }

    const cs = await page.evaluate(() => {
      try { selectCustomerToPos(12735); return document.getElementById('customer_select')?.value; } catch(e){return null;}
    });
    if (cs !== '12735') { await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp068-fail-cliente-'+Date.now()+'.png'), timeout:5000 }).catch(()=>{}); throw new Error('No se pudo asociar el cliente de prueba (id 12735)'); }
    await page.waitForTimeout(1200);

    await page.evaluate(() => document.getElementById('btn_cash_pos').click());
    await page.waitForFunction(() => { const el=document.getElementById('dialog_payment'); return el?window.getComputedStyle(el).display!=='none':false; }, null, { timeout: 10000 });

    // Tiquete Electrónico (value='4') con chosen:updated
    await page.evaluate(() => {
      const select=document.getElementById('payment_electronic_document_type');
      if(select){select.value='4';select.dispatchEvent(new Event('change',{bubbles:true}));if(window.jQuery&&jQuery(select).data('chosen'))jQuery(select).trigger('chosen:updated');}
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const cash=document.getElementById('ck_is_payment_cash');
      if(cash&&!cash.checked){cash.checked=true;cash.dispatchEvent(new Event('change',{bubbles:true}));}
      const ef=document.getElementById('is_payment_cash');
      if(ef&&!ef.checked){ef.checked=true;ef.dispatchEvent(new Event('change',{bubbles:true}));}
    });
    await page.waitForTimeout(500);

    const docType = await page.evaluate(() => document.getElementById('payment_electronic_document_type').value);
    if (docType !== '4') {
      await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp068-fail-tipo-documento-'+Date.now()+'.png'), timeout:5000 }).catch(()=>{});
      throw new Error('No se pudo seleccionar "Tiquete Electrónico" (valor actual: ' + docType + ')');
    }

    await page.evaluate(() => document.getElementById('make_payment').click());
    const cartEmpty = await confirmSweetAlerts(page, 'aaa-mult[ií]metro');

    if (cartEmpty) {
      console.log('✅ CP-068 PASSED: El comentario quedó asociado al producto, el total (' + cartTotalText + ') fue válido y se completó el Tiquete Electrónico');
    } else {
      await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp068-fail-no-confirmado-'+Date.now()+'.png'), timeout:5000 }).catch(()=>{});
      throw new Error('El Tiquete Electrónico no se confirmó (el producto sigue en el carrito)');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp068-fail-excepcion-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-068 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp068_comentario_tiquete_electronico();
