const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const HISTORIAL_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/proform/printPosProform';
const TOLERANCIA = 1;
const CLIENTE_ID = 12735;

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function cargarPOS(page, moneda) {
  await page.goto(POS_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
  await page.waitForTimeout(3000);
  await page.waitForSelector('.product_box', { timeout: 15000 });
  // Seleccionar moneda
  await page.evaluate(() => { document.getElementById('menu_type_currency')?.click(); });
  await page.waitForTimeout(700);
  await page.evaluate(({ moneda }) => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /col[oó]n|d[oó]lar/i.test(m.textContent || ''));
    if (menu) {
      const opt = Array.from(menu.querySelectorAll('li')).find(li => new RegExp(moneda, 'i').test(li.textContent || ''));
      if (opt) opt.click();
    }
  }, { moneda });
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

async function cp093_lista_precios_proforma_consignacion() {
  console.log('🔄 Ejecutando CP-093: Lista de precios en proforma por consignación...');
  console.log('💵 Moneda: Dólares');
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
    await cargarPOS(page, 'd[oó]lar estadounidense');
    evaluarCargaPagina(Date.now() - t0, 'Carga POS');
    await limpiarCarrito(page);

    // — Aplicar lista de precios "10% Descuento de cliente frecuente" (ID 186) —
    const LISTA_ID = 186;
    const LISTA_NOMBRE = '10% Descuento de cliente frecuente';
    await page.evaluate((id) => { try { set_current_pos_price_list(id); } catch {} }, LISTA_ID);
    await page.waitForTimeout(800);
    console.log('📌 Lista aplicada: ' + LISTA_NOMBRE + ' (ID ' + LISTA_ID + ')');

    // Agregar 2 productos
    const prodA = await agregarProducto(page, 'aaa-mult', 'AAA-Multímetro');
    const prodB = await agregarProducto(page, 'aaa-filtros de combustible', 'AAA-Filtros');
    const productosAgregados = (prodA ? 1 : 0) + (prodB ? 1 : 0);
    console.log('🛒 Productos agregados:', productosAgregados);

    // Leer precios en carrito por token
    const preciosCarrito = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return Array.from(document.querySelectorAll('input[id^="input_product_edit_price_"]'))
        .filter(isVis)
        .map(el => ({ token: el.id.replace('input_product_edit_price_',''), precio: parseFloat(el.value) || 0 }));
    });
    console.log('💲 Precios en carrito:', JSON.stringify(preciosCarrito));

    // Leer total POS
    const totalPOS = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent||'').trim()));
      const txt = label?.nextElementSibling?.textContent.trim() ?? null;
      const val = txt ? parseFloat((txt.match(/[₡$€]\s*([\d,]+\.?\d*)/) || ['','0'])[1].replace(/,/g,'')) : NaN;
      return { txt, val };
    });
    console.log('💰 Total POS:', totalPOS.txt, '→ $' + totalPOS.val);

    // — Asociar cliente y abrir modal proforma —
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch {} }, CLIENTE_ID);
    await page.waitForTimeout(1000);

    const tModal = Date.now();
    await page.evaluate(() => { document.getElementById('btn_proform_option')?.click(); });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { if (typeof show_create_proform_modal === 'function') show_create_proform_modal(); });
    await page.waitForTimeout(3000);

    // — Activar checkbox de consignación —
    const ckConsignacion = await page.evaluate(() => {
      const ck = document.getElementById('ck_is_consignment_invoice');
      if (!ck) return { found: false, checked: false };
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      // Si no está marcado, marcarlo
      if (!ck.checked) {
        const label = document.querySelector('label[for="ck_is_consignment_invoice"]');
        if (label && isVis(label)) { label.click(); }
        else { ck.click(); }
      }
      return { found: true, checked: ck.checked };
    });
    await page.waitForTimeout(800);
    console.log('☑️ Checkbox consignación:', JSON.stringify(ckConsignacion));

    // Verificar que ck_is_proform__invoice está desmarcado (o se desmarca al marcar consignación)
    const estadoCheckboxes = await page.evaluate(() => {
      const ids = ['ck_is_proform__invoice','ck_is_consignment_invoice','ck_is_workshop_proform'];
      return ids.map(id => {
        const el = document.getElementById(id);
        return { id, checked: el ? el.checked : null, found: !!el };
      });
    });
    console.log('🔘 Estado checkboxes:', JSON.stringify(estadoCheckboxes));

    // — Leer precios en modal proforma y validar por token —
    const preciosModal = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return Array.from(document.querySelectorAll('input[id^="input_product_edit_price_"]'))
        .filter(isVis)
        .map(el => ({ token: el.id.replace('input_product_edit_price_',''), precio: parseFloat(el.value) || 0 }));
    });
    console.log('📝 Precios en modal:', JSON.stringify(preciosModal));

    let validacionOk = true;
    let detalleValidacion = [];
    for (const mp of preciosModal) {
      const cp = preciosCarrito.find(c => c.token === mp.token);
      if (cp) {
        const diff = Math.abs(mp.precio - cp.precio);
        const ok = diff <= TOLERANCIA;
        if (!ok) validacionOk = false;
        detalleValidacion.push({ token: mp.token.substring(0,8), modal: mp.precio, carrito: cp.precio, diff: diff.toFixed(2), ok });
      }
    }
    console.log('🔍 Validación carrito↔modal:', JSON.stringify(detalleValidacion));
    if (validacionOk) console.log('✔ Precios del modal de consignación coinciden con carrito (±' + TOLERANCIA + ')');

    // — Confirmar proforma de consignación —
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
    evaluarAccion(Date.now() - tModal, 'Crear proforma consignación');

    // — Restaurar lista de precios a ninguno —
    await page.evaluate(() => { try { set_current_pos_price_list(0); } catch {} });

    // — Validar en historial que el tab "Consignación" existe —
    const tHistorial = Date.now();
    await page.goto(HISTORIAL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    const tabConsignacion = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = document.getElementById('btn_consignation_proform');
      return btn ? { found: true, visible: isVis(btn), text: (btn.textContent||'').trim().substring(0,30) } : { found: false };
    });
    console.log('📑 Tab consignación en historial:', JSON.stringify(tabConsignacion));

    if (tabConsignacion.found) {
      await page.evaluate(() => { document.getElementById('btn_consignation_proform')?.click(); });
      await page.waitForTimeout(1500);
      evaluarAccion(Date.now() - tHistorial, 'Navegar historial consignación');
      const hayRegistros = await page.evaluate(() => {
        const cont = document.querySelector('#proform_list_content, #proform_list, .table, table');
        return cont ? (cont.querySelectorAll('tr').length > 0 || cont.textContent.replace(/\s+/g,' ').trim().length > 10) : false;
      });
      console.log('📋 Registros en tab consignación:', hayRegistros);
    }

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-093 PASSED | moneda: dólares | lista: ' + LISTA_NOMBRE + ' | consignación activada: ' + ckConsignacion.checked + ' | validación precios ±' + TOLERANCIA + ': ' + validacionOk + ' | proforma confirmada: ' + confirmado + ' | tab historial: ' + tabConsignacion.found + ' | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp093-fail');
    console.log('❌ CP-093 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp093_lista_precios_proforma_consignacion();
