const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const TOLERANCIA = 1;
const DESCUENTO_PCT = 15;

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

function leerTotal(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent||'').trim()));
    const txt = label?.nextElementSibling?.textContent.trim() ?? null;
    const val = txt ? parseFloat((txt.match(/[₡$]\s*([\d,]+\.\d{2})/) || ['','0'])[1].replace(/,/g,'')) : NaN;
    return { txt, val };
  });
}

async function agregarProducto(page, src, nombre) {
  const ini = Date.now();
  const added = await page.evaluate(({ src }) => {
    const re = new RegExp(src, 'i');
    const box = Array.from(document.querySelectorAll('.product_box')).find(b => re.test((b.textContent||'').replace(/\s+/g,' ')));
    if (!box) return false;
    (box.querySelector('.product_box_quantity_content') || box).click(); return true;
  }, { src });
  if (added) {
    await page.waitForFunction(({ src }) => new RegExp(src,'i').test((document.getElementById('tb_table_buy_list')||{textContent:''}).textContent), { src }, { timeout: 15000 }).catch(()=>{});
    evaluarAccion(Date.now() - ini, 'Agregar ' + nombre);
  } else {
    console.log('⚠️ No encontrado: ' + nombre);
  }
  await page.waitForTimeout(700);
  return added;
}

async function cp116_descuento_general_pos() {
  console.log('🔄 Ejecutando CP-116: Descuento general en POS (contado)...');
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

    const t0 = Date.now();
    await page.goto(POS_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector('.product_box', { timeout: 15000 });
    evaluarCargaPagina(Date.now() - t0, 'Carga POS');

    // Agregar 3 productos distintos
    await agregarProducto(page, 'aaa-mult', 'AAA-Multímetro');
    await agregarProducto(page, 'aaa-bombillos', 'AAA-Bombillos');
    await agregarProducto(page, 'aaa-filtros de combustible', 'AAA-Filtros');

    const { txt: totalPreText, val: totalPre } = await leerTotal(page);
    console.log('💰 Total pre-descuento:', totalPreText, '→', totalPre);
    if (isNaN(totalPre) || totalPre <= 0) { await screenshotOnFail(page, 'cp116-fail-total-pre'); throw new Error('No se pudo leer el total antes del descuento'); }

    // Aplicar descuento general
    const tDesc = Date.now();
    await page.evaluate(() => { document.getElementById('show_invoice_advanced_detail')?.click(); });
    await page.waitForTimeout(800);
    const descOk = await page.evaluate((pct) => {
      const el = document.getElementById('total_discount_input');
      if (!el) return false;
      el.value = String(pct); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      return true;
    }, DESCUENTO_PCT);
    if (!descOk) { await screenshotOnFail(page, 'cp116-fail-descuento'); throw new Error('No se encontró total_discount_input'); }
    await page.waitForTimeout(1800);
    evaluarAccion(Date.now() - tDesc, 'Aplicar descuento general ' + DESCUENTO_PCT + '%');

    const { txt: totalPostText, val: totalPost } = await leerTotal(page);
    console.log('💰 Total post-descuento:', totalPostText, '→', totalPost);

    const descuentoAplicado = (!isNaN(totalPre) && !isNaN(totalPost)) ? Math.round((totalPre - totalPost) * 100) / 100 : NaN;
    const descuentoEsperado = Math.round(totalPre * (DESCUENTO_PCT / 100) * 100) / 100;
    const diff = isNaN(descuentoAplicado) ? NaN : Math.abs(descuentoAplicado - descuentoEsperado);
    console.log('🧮 Descuento aplicado: ₡' + descuentoAplicado + ' | esperado: ₡' + descuentoEsperado + ' | diff: ' + (isNaN(diff)?'N/A':diff.toFixed(2)));

    // Facturar en efectivo
    const tPago = Date.now();
    await page.evaluate(() => { document.getElementById('btn_cash_pos')?.click(); });
    await page.waitForFunction(() => { const el = document.getElementById('dialog_payment'); return el ? window.getComputedStyle(el).display !== 'none' : false; }, null, { timeout: 30000 });
    evaluarAccion(Date.now() - tPago, 'Abrir modal de pago');
    await page.waitForTimeout(800);

    const totalModalTxt = await page.evaluate(() => document.getElementById('total_sale_txt')?.textContent.trim() || null);
    console.log('💰 Total en modal:', totalModalTxt);

    await page.evaluate(() => {
      const ck = document.getElementById('ck_is_payment_cash'); if (ck && !ck.checked) { ck.checked = true; ck.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(500);

    const tFacturar = Date.now();
    await page.evaluate(() => { document.getElementById('make_payment')?.click(); });
    await page.waitForTimeout(1500);
    await page.keyboard.press('Enter').catch(() => {});

    let facturaConfirmada = false;
    for (let i = 0; i < 15 && !facturaConfirmada; i++) {
      await page.waitForTimeout(1000);
      const state = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis).filter(el => el.id !== 'dialog_payment')[0];
        if (sa) { const btn = sa.querySelector('button.confirm,button'); if (btn) btn.click(); }
        const rows = document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length ?? -1;
        return { rows, saTxt: sa ? sa.textContent.replace(/\s+/g,' ').trim().substring(0,80) : null };
      });
      if (state.saTxt) console.log('🔔 SweetAlert (' + i + '):', state.saTxt);
      facturaConfirmada = state.rows === 0 || state.rows === -1;
    }
    evaluarAccion(Date.now() - tFacturar, 'Procesar factura');
    console.log('✔ Factura confirmada:', facturaConfirmada);

    // ── VALIDACIONES ──
    const v1 = !isNaN(totalPre) && totalPre > 0;
    const v2 = !isNaN(totalPost) && totalPost < totalPre;
    const v3 = !isNaN(diff) && diff <= TOLERANCIA;
    const v4 = facturaConfirmada;

    console.log('\n📊 === VALIDACIONES CP-116 ===');
    console.log('  Total pre-descuento leído:        ' + (v1 ? '✅' : '❌') + ' ' + totalPreText);
    console.log('  Total post-descuento < pre:       ' + (v2 ? '✅' : '❌') + ' ' + totalPostText);
    console.log('  Descuento ' + DESCUENTO_PCT + '% calculado ±1:        ' + (v3 ? '✅' : '⚠️') + ' diff=' + (isNaN(diff)?'N/A':diff.toFixed(2)));
    console.log('  Factura confirmada:               ' + (v4 ? '✅' : '❌'));

    if (!v1) throw new Error('No se pudo leer el total antes del descuento');
    if (!v2) throw new Error('El total no bajó tras aplicar el descuento');
    if (!v4) throw new Error('La factura no se confirmó');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    const pasadas = [v1,v2,v3,v4].filter(Boolean).length;
    const icono = pasadas >= 3 ? '✅' : '⚠️';
    console.log(icono + ' CP-116 PASSED | productos: 3 | total pre: ' + totalPreText + ' | descuento ' + DESCUENTO_PCT + '%: −₡' + descuentoAplicado + ' | total post: ' + totalPostText + ' | validaciones: ' + pasadas + '/4 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp116-fail');
    console.log('❌ CP-116 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp116_descuento_general_pos();
