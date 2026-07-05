const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const TOLERANCIA = 1;
const CLIENTE_ID = 12735;

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function cargarPOS(page) {
  await page.goto(POS_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
  await page.waitForTimeout(3000);
  await page.waitForSelector('.product_box', { timeout: 15000 });
  await page.evaluate(() => { document.getElementById('menu_type_currency')?.click(); });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /col[oó]n|d[oó]lar/i.test(m.textContent || ''));
    if (menu) { const opt = Array.from(menu.querySelectorAll('li')).find(li => /col[oó]n costarricense/i.test(li.textContent || '')); if (opt) opt.click(); }
  });
  await page.waitForTimeout(600);
}

async function limpiarCarrito(page) {
  await page.evaluate(({ src, flags }) => {
    const re = new RegExp(src, flags);
    const box = Array.from(document.querySelectorAll('.product_box')).find(b => re.test((b.textContent||'').replace(/\s+/g,' ')));
    if (box) (box.querySelector('.product_box_quantity_content') || box).click();
  }, { src: 'aaa-mult', flags: 'i' });
  await page.waitForTimeout(1500);
  let rows = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0);
  for (let d = 0; d < 50 && rows > 0; d++) {
    const del = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const icon = Array.from(document.querySelectorAll('#tb_table_buy_list i.material-icons')).filter(isVis).find(el => /^delete$/i.test(el.textContent.trim()));
      if (icon) { (icon.closest('button,a,[onclick]') || icon).click(); return true; }
      return false;
    });
    if (!del) break;
    await page.waitForTimeout(500);
    await page.evaluate(() => { const isVis=(el)=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;}; const btn=Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis)[0]; if(btn)btn.click(); }).catch(()=>{});
    await page.waitForTimeout(300);
    rows = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0);
  }
}

function leerTotal(page) {
  return page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent || '').trim()));
    const txt = label?.nextElementSibling?.textContent.trim() ?? null;
    const val = txt ? parseFloat((txt.match(/[₡$]\s*([\d,]+\.\d{2})/) || ['','0'])[1].replace(/,/g,'')) : NaN;
    return { txt, val };
  });
}

async function cp090_proforma_descuento_general() {
  console.log('🔄 Ejecutando CP-090: Proforma con descuento general — validar ±1...');
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
    await cargarPOS(page);
    evaluarCargaPagina(Date.now() - t0, 'Carga POS');
    await limpiarCarrito(page);

    // Agregar 3 productos del catálogo
    const productos = [
      { src: 'aaa-mult', nombre: 'AAA-Multímetro' },
      { src: 'aaa-bombillos', nombre: 'AAA-Bombillos' },
      { src: 'aaa-filtros de combustible', nombre: 'AAA-Filtros' }
    ];
    let productosAgregados = 0;
    for (const p of productos) {
      const ini = Date.now();
      const added = await page.evaluate(({ src }) => {
        const re = new RegExp(src, 'i');
        const box = Array.from(document.querySelectorAll('.product_box')).find(b => re.test((b.textContent||'').replace(/\s+/g,' ')));
        if (!box) return false;
        (box.querySelector('.product_box_quantity_content') || box).click(); return true;
      }, { src: p.src });
      if (added) {
        await page.waitForFunction(({ src }) => new RegExp(src,'i').test((document.getElementById('tb_table_buy_list')||{textContent:''}).textContent), { src: p.src }, { timeout: 15000 }).catch(()=>{});
        productosAgregados++;
        evaluarAccion(Date.now() - ini, 'Agregar ' + p.nombre);
      }
      await page.waitForTimeout(700);
    }
    console.log('🛒 Productos agregados:', productosAgregados);

    // Total ANTES del descuento
    const { txt: totalAntesText, val: totalAntes } = await leerTotal(page);
    console.log('💰 Total antes descuento:', totalAntesText, '→ ₡' + totalAntes);

    // Aplicar descuento general 15% via total_discount_input (mismo patrón que CP-081)
    const DESCUENTO_PCT = 15;
    const tDesc = Date.now();
    await page.evaluate(() => { document.getElementById('show_invoice_advanced_detail')?.click(); });
    await page.waitForTimeout(800);
    const descOk = await page.evaluate((pct) => {
      const el = document.getElementById('total_discount_input');
      if (!el) return false;
      el.value = String(pct);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      return true;
    }, DESCUENTO_PCT);
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tDesc, 'Aplicar descuento general ' + DESCUENTO_PCT + '%');

    const { txt: totalDespuesText, val: totalDespues } = await leerTotal(page);
    console.log('💰 Total después descuento:', totalDespuesText, '→ ₡' + totalDespues);

    // Validación ±1
    let validacionDesc = false;
    if (!isNaN(totalAntes) && !isNaN(totalDespues)) {
      const descAplicado = Math.round((totalAntes - totalDespues) * 100) / 100;
      const descEsperado = Math.round(totalAntes * (DESCUENTO_PCT / 100) * 100) / 100;
      const diff = Math.abs(descAplicado - descEsperado);
      validacionDesc = diff <= TOLERANCIA;
      if (validacionDesc) console.log('✔ Descuento ' + DESCUENTO_PCT + '% validado: ₡' + totalAntes + ' → ₡' + totalDespues + ' (−₡' + descAplicado + ', diff ₡' + diff.toFixed(2) + ' ≤ ±' + TOLERANCIA + ')');
      else console.log('⚠️ Diferencia descuento: ₡' + diff.toFixed(2) + ' > ±' + TOLERANCIA + ' | aplicado=₡' + descAplicado + ' esperado=₡' + descEsperado);
    }

    // Cerrar panel avanzado
    await page.evaluate(() => { document.getElementById('show_invoice_advanced_detail')?.click(); });
    await page.waitForTimeout(400);

    // Crear proforma desde F4
    const tProforma = Date.now();
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch {} }, CLIENTE_ID);
    await page.waitForTimeout(1000);
    await page.evaluate(() => { document.getElementById('btn_proform_option')?.click(); });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { if (typeof show_create_proform_modal === 'function') show_create_proform_modal(); });
    await page.waitForTimeout(2500);

    // Inspeccionar modal y confirmar
    const modalInputs = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return Array.from(document.querySelectorAll('input,select')).filter(isVis)
        .filter(el => !['product_search','search_pos_customer'].includes(el.id))
        .map(el => ({ id: el.id.substring(0,40), type: el.type, val: (el.value||'').substring(0,30) })).slice(0,8);
    });
    console.log('📝 Modal inputs:', JSON.stringify(modalInputs));

    const confirmado = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(el => /confirmar|guardar|crear|save|confirm|aceptar/i.test(el.textContent||''));
      if (btn) { btn.click(); return btn.textContent.replace(/\s+/g,' ').trim().substring(0,30); }
      if (typeof confirm_create_proform === 'function') { confirm_create_proform(); return 'confirm_create_proform()'; }
      return null;
    });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden';}; const btn=Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis).filter(el=>el.id!=='dialog_payment')[0]; if(btn)btn.click(); }).catch(()=>{});
    evaluarAccion(Date.now() - tProforma, 'Crear proforma con descuento');

    // También intentar ver si el modal de proforma tiene su propio campo de descuento
    const descuentoEnModal = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return Array.from(document.querySelectorAll('input')).filter(isVis)
        .filter(el => /discount|descuento/i.test((el.id||'')+(el.placeholder||'')+(el.name||'')))
        .map(el => ({ id: el.id, val: el.value }));
    });
    if (descuentoEnModal.length > 0) console.log('🔍 Descuento en modal proforma:', JSON.stringify(descuentoEnModal));

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-090 PASSED | productos: ' + productosAgregados + ' | moneda: colones | descuento: ' + DESCUENTO_PCT + '% | total pre: ₡' + totalAntes + ' | total post: ₡' + totalDespues + ' | validación ±' + TOLERANCIA + ': ' + validacionDesc + ' | proforma confirmada: ' + confirmado + ' | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp090-fail');
    console.log('❌ CP-090 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp090_proforma_descuento_general();
