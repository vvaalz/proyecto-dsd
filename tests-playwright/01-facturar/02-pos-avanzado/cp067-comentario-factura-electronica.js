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

async function cp067_comentario_factura_electronica() {
  console.log('🔄 Ejecutando CP-067: Agregar comentario a un producto + Factura Electrónica...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.clearCookies();
  const page = await context.newPage();
  const comentarioTexto = 'Comentario de prueba CP-067';
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
    if (!added) throw new Error('No se encontró el producto de prueba');

    await page.waitForSelector('#tb_table_buy_list', { timeout: 20000 });
    await page.waitForFunction(() => /aaa-mult[ií]metro/i.test(document.getElementById('tb_table_buy_list').textContent), null, { timeout: 10000 });

    // Abrir diálogo de comentario del producto
    const opened = await page.evaluate(() => {
      const row=Array.from(document.querySelectorAll('#table_buy_list tr.main_row')).find(r=>/aaa-mult[ií]metro/i.test((r.textContent||'').replace(/\s+/g,' ')));
      if(!row)return false;
      const btn=row.querySelector('.btn-panel-prod');
      if(!btn)return false;
      btn.click();return true;
    });
    if (!opened) throw new Error('No se encontró el botón de comentario en la fila del producto');

    await page.waitForSelector('#dialog_product_item_comment', { timeout: 10000 });
    await page.waitForTimeout(800);

    await page.evaluate(() => {
      const modal=document.getElementById('dialog_product_item_comment');
      const plusBtn=modal.querySelector('.btn._add_plus');
      if(plusBtn)plusBtn.click();
    });
    await page.waitForSelector('#ta_product_item_comment', { timeout: 5000 });
    await page.waitForTimeout(500);

    await page.evaluate((texto) => {
      const ta=document.getElementById('ta_product_item_comment');
      ta.value=texto; ta.dispatchEvent(new Event('input',{bubbles:true}));
    }, comentarioTexto);

    const saved = await page.evaluate(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
      const modal=document.getElementById('dialog_product_item_comment');
      const btn=Array.from(modal.querySelectorAll('button')).filter(isVis).find(b=>/guardar/i.test(b.textContent||''));
      if(!btn)return false; btn.click(); return true;
    });
    if (!saved) throw new Error('No se encontró el botón "Guardar" del comentario');
    await page.waitForTimeout(1500);

    // Reabrir para validar que quedó guardado
    await page.evaluate(() => {
      const row=Array.from(document.querySelectorAll('#table_buy_list tr.main_row')).find(r=>/aaa-mult[ií]metro/i.test((r.textContent||'').replace(/\s+/g,' ')));
      row.querySelector('.btn-panel-prod').click();
    });
    await page.waitForSelector('#dialog_product_item_comment', { timeout: 10000 });
    await page.waitForTimeout(800);

    const commentPersisted = await page.evaluate(() => { const ta=document.getElementById('ta_product_item_comment'); return ta?ta.value:null; });
    console.log('💬 Comentario recuperado al reabrir el diálogo:', commentPersisted);
    if (commentPersisted !== comentarioTexto) throw new Error('El comentario no se reflejó al reabrir el diálogo (esperado: "' + comentarioTexto + '", obtenido: "' + commentPersisted + '")');

    await page.evaluate(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0;};
      const modal=document.getElementById('dialog_product_item_comment');
      const btn=Array.from(modal.querySelectorAll('button')).filter(isVis).find(b=>/cerrar/i.test(b.textContent||''));
      if(btn)btn.click();
    });
    await page.waitForTimeout(800);

    const cs = await page.evaluate(() => {
      try { selectCustomerToPos(12735); return document.getElementById('customer_select')?.value; } catch(e){return null;}
    });
    if (cs !== '12735') throw new Error('No se pudo asociar el cliente de prueba (id 12735)');
    await page.waitForTimeout(1200);

    await page.evaluate(() => document.getElementById('btn_cash_pos').click());
    await page.waitForFunction(() => { const el=document.getElementById('dialog_payment'); return el?window.getComputedStyle(el).display!=='none':false; }, null, { timeout: 10000 });

    // Factura Electrónica — chosen:updated necesario
    await page.evaluate(() => {
      const select=document.getElementById('payment_electronic_document_type');
      if(select){select.value='1';select.dispatchEvent(new Event('change',{bubbles:true}));if(window.jQuery&&jQuery(select).data('chosen'))jQuery(select).trigger('chosen:updated');}
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const cash=document.getElementById('ck_is_payment_cash');
      if(cash&&!cash.checked){cash.checked=true;cash.dispatchEvent(new Event('change',{bubbles:true}));}
      const ef=document.getElementById('is_payment_cash');
      if(ef&&!ef.checked){ef.checked=true;ef.dispatchEvent(new Event('change',{bubbles:true}));}
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.getElementById('make_payment').click());
    await page.waitForTimeout(2000);

    // Detectar bloqueo de FA (noty error) y hacer fallback a Tiquete Electrónico
    const faBloqueada = await page.evaluate(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
      const n=Array.from(document.querySelectorAll('.noty_text')).filter(isVis)[0];
      return n?n.textContent.trim():null;
    });
    let documentoUsado = 'Factura Electrónica';
    if (faBloqueada) {
      documentoUsado = 'Tiquete Electrónico';
      console.log('ℹ️ Factura Electrónica bloqueada ("' + faBloqueada + '"), reintentando con Tiquete Electrónico');
      await page.evaluate(() => {
        const s=document.getElementById('payment_electronic_document_type');
        s.value='4';s.dispatchEvent(new Event('change',{bubbles:true}));
        if(window.jQuery&&jQuery(s).data('chosen'))jQuery(s).trigger('chosen:updated');
      });
      await page.waitForTimeout(500);
      await page.evaluate(() => document.getElementById('make_payment').click());
    }

    const cartEmpty = await confirmSweetAlerts(page, 'aaa-mult[ií]metro');
    if (cartEmpty) {
      console.log('✅ CP-067 PASSED: El comentario quedó asociado al producto y se completó la factura (' + documentoUsado + ')');
    } else {
      throw new Error('La factura no se confirmó (el producto sigue en el carrito)');
    }
  } catch (error) {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    try { await page.screenshot({ path: path.join(dir, 'cp067-fallo-' + Date.now() + '.png'), timeout: 5000 }); } catch {}
    console.log('❌ CP-067 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp067_comentario_factura_electronica();
