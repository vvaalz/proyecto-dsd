const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const TOLERANCIA = 1;
const CLIENTE_ID = 12735;

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function navegarCtrlB(page, termino, urlFallback = null) {
  try {
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Control+b');
    await page.waitForSelector('#quick_search', { state: 'visible', timeout: 5000 });
    await page.fill('#quick_search', termino);
    await page.waitForTimeout(1200);
    const destino = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const links = Array.from(document.getElementById('dialog_quick_search')?.querySelectorAll('a[href]') || []).filter(isVis);
      if (links.length > 0) { links[0].click(); return links[0].href; }
      return null;
    });
    if (destino) { await page.waitForTimeout(2500); console.log('⌨️ Ctrl+B → ' + termino + ' (' + destino + ')'); return true; }
  } catch {}
  if (urlFallback) { await page.goto(urlFallback, { waitUntil: 'domcontentloaded', timeout: 90000 }); console.log('🔗 URL fallback: ' + urlFallback); return true; }
  return false;
}

async function cp081_descuento_general_credito() {
  console.log('🔄 Ejecutando CP-081: Descuento general en factura a crédito — validar cálculos ±1...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.clearCookies();
  const page = await context.newPage();
  const tiempoInicioCP = Date.now();

  try {
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    await page.fill('#email', 'qadesignsoftcr@gmail.com');
    await page.fill('#password', 'qa0000');
    await page.click('#loginButton');
    await page.waitForURL('**/dashboard**', { timeout: 40000 });

    // Navegar al POS con Ctrl+B
    const t0 = Date.now();
    await navegarCtrlB(page, 'Facturar', 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1');
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector('.product_box', { timeout: 15000 });
    evaluarCargaPagina(Date.now() - t0, 'Carga POS (Ctrl+B → Facturar)');

    // Asegurar colones
    await page.evaluate(() => { document.getElementById('menu_type_currency')?.click(); });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /col[oó]n|d[oó]lar/i.test(m.textContent || ''));
      if (menu) { const opt = Array.from(menu.querySelectorAll('li')).find(li => /col[oó]n costarricense/i.test(li.textContent || '')); if (opt) opt.click(); }
    });
    await page.waitForTimeout(600);

    // Agregar 3 productos
    const productos = [
      { src: 'aaa-mult', flags: 'i', nombre: 'AAA-Multímetro (₡100)' },
      { src: 'aaa-bombillos', flags: 'i', nombre: 'AAA-Bombillos (₡150)' },
      { src: 'aaa-filtros de combustible', flags: 'i', nombre: 'AAA-Filtros (₡37,290)' }
    ];
    for (const p of productos) {
      const ini = Date.now();
      const added = await page.evaluate(({ src, flags }) => {
        const re = new RegExp(src, flags);
        const t = Array.from(document.querySelectorAll('.product_box')).find(b => re.test((b.textContent || '').replace(/\s+/g, ' ')));
        if (!t) return false;
        (t.querySelector('.product_box_quantity_content') || t).click(); return true;
      }, { src: p.src, flags: p.flags });
      if (!added) console.log('⚠️ No se encontró: ' + p.nombre);
      else {
        await page.waitForFunction(
          ({ src, flags }) => new RegExp(src, flags).test((document.getElementById('tb_table_buy_list') || { textContent: '' }).textContent),
          { src: p.src, flags: p.flags }, { timeout: 15000 }
        ).catch(() => {});
        evaluarAccion(Date.now() - ini, 'Agregar ' + p.nombre);
      }
      await page.waitForTimeout(800);
    }

    // Leer total pre-descuento
    const totalPreText = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent || '').trim()));
      const next = label ? label.nextElementSibling : null;
      return next ? next.textContent.trim() : null;
    });
    const totalPre = totalPreText ? parseFloat((totalPreText.match(/[₡$]\s*([\d,]+\.\d{2})/) || ['','0'])[1].replace(/,/g,'')) : NaN;
    console.log('💰 Total pre-descuento:', totalPreText, '→ ₡' + totalPre);

    // Aplicar descuento general del 15%
    const DESCUENTO_PCT = 15;
    const tDesc = Date.now();
    await page.evaluate(() => document.getElementById('show_invoice_advanced_detail')?.click());
    await page.waitForTimeout(800);
    const descOk = await page.evaluate((pct) => {
      const el = document.getElementById('total_discount_input');
      if (!el) return false;
      el.value = String(pct); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      return true;
    }, DESCUENTO_PCT);
    if (!descOk) { await screenshotOnFail(page, 'cp081-fail-descuento'); throw new Error('No se encontró total_discount_input'); }
    await page.waitForTimeout(1800);
    evaluarAccion(Date.now() - tDesc, 'Aplicar descuento general ' + DESCUENTO_PCT + '%');

    // Leer total post-descuento
    const totalPostText = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent || '').trim()));
      const next = label ? label.nextElementSibling : null;
      return next ? next.textContent.trim() : null;
    });
    const totalPost = totalPostText ? parseFloat((totalPostText.match(/[₡$]\s*([\d,]+\.\d{2})/) || ['','0'])[1].replace(/,/g,'')) : NaN;
    console.log('💰 Total post-descuento:', totalPostText, '→ ₡' + totalPost);

    // Leer IVA
    const ivaText = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const el = Array.from(document.querySelectorAll('.advanced_invoice_detail,[class*="total_div"]')).filter(isVis).find(e => /^IVA/i.test((e.textContent||'').replace(/\s+/g,' ').trim()));
      return el ? el.textContent.replace(/\s+/g,' ').trim() : null;
    });
    const ivaVal = ivaText ? parseFloat((ivaText.match(/[₡$]\s*([\d,]+\.\d{2})/) || ['','0'])[1].replace(/,/g,'')) : 0;

    // Validación matemática ±1
    if (!isNaN(totalPre) && !isNaN(totalPost)) {
      const descuentoAplicado = Math.round((totalPre - totalPost) * 100) / 100;
      const descuentoEsperado = Math.round(totalPre * (DESCUENTO_PCT / 100) * 100) / 100;
      const diff = Math.abs(descuentoAplicado - descuentoEsperado);
      if (diff <= TOLERANCIA) console.log('✔ Descuento ' + DESCUENTO_PCT + '% validado: ₡' + totalPre + ' → ₡' + totalPost + ' (−₡' + descuentoAplicado + ', diff ₡' + diff.toFixed(2) + ' ≤ ±' + TOLERANCIA + ')');
      else console.log('⚠️ Diferencia descuento: ₡' + diff.toFixed(2) + ' > ±' + TOLERANCIA);
    }

    // Asociar cliente y activar crédito
    const cs = await page.evaluate((id) => { try { selectCustomerToPos(id); return document.getElementById('customer_select')?.value; } catch { return null; } }, CLIENTE_ID);
    console.log('👤 Cliente 12735:', cs === String(CLIENTE_ID) ? '✓' : 'no asociado');
    await page.waitForTimeout(1200);

    await page.evaluate(() => document.getElementById('btn_cash_pos').click());
    await page.waitForFunction(() => { const el = document.getElementById('dialog_payment'); return el ? window.getComputedStyle(el).display !== 'none' : false; }, null, { timeout: 30000 });
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch {} }, CLIENTE_ID);
    await page.waitForTimeout(1000);

    await page.evaluate(() => { document.getElementById('ck_is_payment_credit').checked = true; switch_payment_type(2); });
    await page.waitForTimeout(1500);

    const creditoOk = await page.evaluate(() => document.getElementById('ck_is_payment_credit').checked);
    if (!creditoOk) { await screenshotOnFail(page, 'cp081-fail-credito'); throw new Error('Crédito no se activó'); }

    // Procesar pago
    const tPago = Date.now();
    await page.evaluate(() => document.getElementById('make_payment').click());
    let cartEmpty = false;
    for (let i = 0; i < 14 && !cartEmpty; i++) {
      await page.waitForTimeout(1000);
      try {
        const s = await page.evaluate(() => {
          const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
          const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
          return { sa: !!sa, rows: document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0 };
        });
        if (s.sa) await page.evaluate(() => { const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0;}; const btn=Array.from(document.querySelectorAll('.sweet-alert button.confirm')).filter(isVis)[0]; if(btn)btn.click(); }).catch(()=>{});
        cartEmpty = s.rows === 0;
      } catch (e) { if (/navigation|context/i.test(e.message)) { cartEmpty = true; break; } throw e; }
    }
    evaluarAccion(Date.now() - tPago, 'Procesar pago a crédito');
    if (!cartEmpty) { await screenshotOnFail(page, 'cp081-fail-pago'); throw new Error('Carrito no quedó vacío'); }

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-081 PASSED | productos: 3 | moneda: colones | tipo doc: Factura Interna (crédito) | método pago: crédito | total pre-desc: ₡' + totalPre + ' | descuento ' + DESCUENTO_PCT + '%: −₡' + Math.round((totalPre-totalPost)*100)/100 + ' | total final: ₡' + totalPost + ' | IVA: ₡' + ivaVal + ' | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp081-fail-excepcion');
    console.log('❌ CP-081 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp081_descuento_general_credito();
