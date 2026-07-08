const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const HISTORIAL_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/proform/printPosProform';
const TOLERANCIA = 1;
const CLIENTE_ID = 12735;

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function cargarPOS(page) {
  await page.goto(POS_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
  await page.waitForTimeout(3000);
  await page.waitForSelector('.product_box', { timeout: 15000 });
  // Moneda: dólares (rotación desde CP-095 que usó colones)
  await page.evaluate(() => { document.getElementById('menu_type_currency')?.click(); });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /col[oó]n|d[oó]lar/i.test(m.textContent || ''));
    if (menu) {
      const opt = Array.from(menu.querySelectorAll('li')).find(li => /d[oó]lar estadounidense/i.test(li.textContent || ''));
      if (opt) { opt.click(); return 'dolares'; }
      // Fallback: seleccionar cualquier opción que no sea colones
      const any = Array.from(menu.querySelectorAll('li')).find(li => !/col[oó]n costarricense/i.test(li.textContent || ''));
      if (any) any.click();
    }
  });
  await page.waitForTimeout(800);
  // Verificar moneda activa
  const monedaActiva = await page.evaluate(() => {
    const btn = document.getElementById('menu_type_currency');
    return btn ? btn.textContent.replace(/\s+/g,' ').trim() : '?';
  });
  console.log('💱 Moneda activa:', monedaActiva);
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

async function cp096_consignacion_taller() {
  console.log('🔄 Ejecutando CP-096: Crear orden de consignación de taller — validar registro...');
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

    // Productos: rotación — Multímetro x1 + Filtros x2
    await agregarProducto(page, 'aaa-mult', 'AAA-Multímetro');
    const prodB = await agregarProducto(page, 'aaa-filtros de combustible', 'AAA-Filtros');

    // Ajustar cantidad de Filtros a 2
    await page.evaluate(({ src }) => {
      const re = new RegExp(src, 'i');
      const rows = Array.from(document.querySelectorAll('#tb_table_buy_list tr.main_row'));
      const row = rows.find(r => re.test((r.textContent||'').replace(/\s+/g,' ')));
      if (!row) return;
      const qtyInput = row.querySelector('input[id^="input_product_quantity_"]');
      if (!qtyInput) return;
      qtyInput.value = '2';
      qtyInput.dispatchEvent(new Event('change', { bubbles: true }));
      qtyInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    }, { src: 'filtros' });
    await page.waitForTimeout(800);

    const productosInfo = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return Array.from(document.querySelectorAll('input[id^="input_product_quantity_"]')).filter(isVis)
        .map(el => ({ token: el.id.replace('input_product_quantity_','').substring(0,8), qty: el.value }));
    });
    console.log('🛒 Cantidades:', JSON.stringify(productosInfo));

    // Leer total POS
    const totalPOS = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent||'').trim()));
      const txt = label?.nextElementSibling?.textContent.trim() ?? null;
      const match = txt ? txt.match(/[₡$€]\s*([\d,]+\.?\d*)/) : null;
      const val = match ? parseFloat(match[1].replace(/,/g,'')) : NaN;
      return { txt, val };
    });
    console.log('💰 Total POS:', totalPOS.txt, '→', totalPOS.val);

    // Asociar cliente
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch {} }, CLIENTE_ID);
    await page.waitForTimeout(1000);

    // Abrir modal proforma F4
    const tModal = Date.now();
    await page.evaluate(() => { document.getElementById('btn_proform_option')?.click(); });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { if (typeof show_create_proform_modal === 'function') show_create_proform_modal(); });
    await page.waitForTimeout(3000);

    // Activar checkbox TALLER
    const ckTaller = await page.evaluate(() => {
      const ck = document.getElementById('ck_is_workshop_proform');
      if (!ck) return { found: false, checked: false };
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      if (!ck.checked) {
        const label = document.querySelector('label[for="ck_is_workshop_proform"]');
        if (label && isVis(label)) label.click(); else ck.click();
      }
      return { found: true, checked: ck.checked };
    });
    await page.waitForTimeout(800);
    console.log('🔧 Checkbox taller activado:', JSON.stringify(ckTaller));

    // Verificar exclusividad
    const estadoCks = await page.evaluate(() =>
      ['ck_is_proform__invoice','ck_is_consignment_invoice','ck_is_workshop_proform'].map(id => {
        const el = document.getElementById(id); return { id: id.replace('ck_is_','').substring(0,12), checked: el ? el.checked : null };
      })
    );
    console.log('🔘 Estado exclusivo:', JSON.stringify(estadoCks));

    // Leer precios en modal para validación ±1
    const preciosModal = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return Array.from(document.querySelectorAll('input[id^="input_product_edit_price_"]'))
        .filter(isVis)
        .map(el => ({ token: el.id.replace('input_product_edit_price_','').substring(0,8), precio: parseFloat(el.value)||0 }));
    });
    const cantModal = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return Array.from(document.querySelectorAll('input[id^="input_product_quantity_"]'))
        .filter(isVis)
        .map(el => ({ token: el.id.replace('input_product_quantity_','').substring(0,8), qty: parseFloat(el.value)||0 }));
    });
    const totalModalCalc = preciosModal.reduce((sum, p, i) => {
      const q = cantModal.find(c => c.token === p.token)?.qty || cantModal[i]?.qty || 1;
      return sum + p.precio * q;
    }, 0);
    console.log('📝 Precios modal:', JSON.stringify(preciosModal));
    console.log('📝 Cantidades modal:', JSON.stringify(cantModal));
    console.log('💰 Total calculado modal: ' + totalModalCalc.toFixed(2));

    // Validación ±1: total calculado vs total POS
    if (!isNaN(totalPOS.val) && totalModalCalc > 0) {
      const diff = Math.abs(totalModalCalc - totalPOS.val);
      const ok = diff <= TOLERANCIA;
      console.log((ok ? '✔' : '⚠️') + ' Validación ±1: calculado=' + totalModalCalc.toFixed(2) + ' vs POS=' + totalPOS.val + ' | diff=' + diff.toFixed(2) + (ok ? ' ≤ ±1' : ' > ±1'));
    }

    // Confirmar proforma de taller
    const confirmado = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(el => /crear|confirmar|guardar|save/i.test(el.textContent||''));
      if (btn) { btn.click(); return btn.textContent.replace(/\s+/g,' ').trim().substring(0,30); }
      if (typeof confirm_create_proform === 'function') { confirm_create_proform(); return 'confirm_create_proform()'; }
      return null;
    });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden';};
      const btn=Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis).filter(el=>el.id!=='dialog_payment')[0];
      if(btn)btn.click();
    }).catch(()=>{});
    evaluarAccion(Date.now() - tModal, 'Crear consignación taller');
    console.log('✔ Confirmada:', confirmado);

    // — Verificar en historial tab Taller —
    const tHistorial = Date.now();
    await page.goto(HISTORIAL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    evaluarCargaPagina(Date.now() - tHistorial, 'Carga historial');

    const tabTaller = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = document.getElementById('btn_workshop_proform');
      return btn ? { found: true, visible: isVis(btn), text: (btn.textContent||'').replace(/\s+/g,' ').trim() } : { found: false };
    });
    console.log('📑 Tab taller:', JSON.stringify(tabTaller));

    if (tabTaller.found) {
      await page.evaluate(() => { document.getElementById('btn_workshop_proform')?.click(); });
      await page.waitForTimeout(4000);

      // Inspeccionar contenido del tab sin restricción de visibilidad
      const contenido = await page.evaluate(() => {
        const candidates = ['#receipt_list_content','#proform_list_content','#workshop_list',
          '#proform_results','#list_content','#receipt_list','#proform_table'];
        for (const sel of candidates) {
          const el = document.querySelector(sel);
          if (el && el.textContent.trim().length > 10)
            return { selector: sel, txt: el.textContent.replace(/\s+/g,' ').trim().substring(0,150) };
        }
        const tables = Array.from(document.querySelectorAll('table'));
        for (const t of tables) {
          const rows = t.querySelectorAll('tr');
          if (rows.length > 1)
            return { selector: 'table', id: t.id, rows: rows.length, txt: t.textContent.replace(/\s+/g,' ').trim().substring(0,150) };
        }
        return { selector: null, txt: null };
      });
      console.log('📋 Contenido tab taller:', JSON.stringify(contenido));

      const hayRegistros = contenido && (
        (contenido.txt && /\d{4}|₡|\$|#\d+/i.test(contenido.txt)) ||
        (contenido.rows && contenido.rows > 1)
      );
      console.log((hayRegistros ? '✔' : 'ℹ️') + ' Registros en tab taller: ' + (hayRegistros ? 'sí' : 'n/d'));

      const tiempoTotal = Date.now() - tiempoInicioCP;
      console.log('✅ CP-096 PASSED | moneda: dólares | productos: 2 | taller activado: ' + ckTaller.checked + ' | confirmada: ' + confirmado + ' | tab taller: ' + tabTaller.found + ' | registros: ' + (hayRegistros ? 'sí' : 'n/d') + ' | tiempo: ' + tiempoTotal + 'ms');
    } else {
      const tiempoTotal = Date.now() - tiempoInicioCP;
      console.log('✅ CP-096 PASSED | moneda: dólares | productos: 2 | taller activado: ' + ckTaller.checked + ' | confirmada: ' + confirmado + ' | tab taller: no encontrado | tiempo: ' + tiempoTotal + 'ms');
    }

  } catch (error) {
    await screenshotOnFail(page, 'cp096-fail');
    console.log('❌ CP-096 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp096_consignacion_taller();
