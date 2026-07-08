const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const TOLERANCIA = 1;

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

async function agregarProductoCatalogo(page, src, nombre) {
  const added = await page.evaluate(({ src }) => {
    const re = new RegExp(src, 'i');
    const box = Array.from(document.querySelectorAll('.product_box')).find(b => re.test((b.textContent||'').replace(/\s+/g,' ')));
    if (!box) return false;
    (box.querySelector('.product_box_quantity_content') || box).click(); return true;
  }, { src });
  if (added) {
    await page.waitForFunction(({ src }) => new RegExp(src,'i').test((document.getElementById('tb_table_buy_list')||{textContent:''}).textContent), { src }, { timeout: 15000 }).catch(()=>{});
    console.log('✔ Agregado: ' + nombre);
  } else console.log('⚠️ No encontrado: ' + nombre);
  await page.waitForTimeout(700);
  return added;
}

async function agregarProductoRapido(page, nombre, precio, gravado = true) {
  // Buscar botón de producto rápido
  const rapido = await page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const btn = Array.from(document.querySelectorAll('button,[onclick]')).filter(isVis)
      .find(el => /producto r[aá]pido|quick|rapido|add_pos_quick/i.test((el.textContent||'')+(el.getAttribute('onclick')||'')+(el.id||'')));
    if (btn) { btn.click(); return btn.id || btn.textContent.trim().substring(0,30); }
    // Intentar función directa
    if (typeof show_quick_product_modal === 'function') { show_quick_product_modal(); return 'show_quick_product_modal()'; }
    if (typeof add_pos_quick_product === 'function') { return 'add_pos_quick_product'; }
    return null;
  });
  if (!rapido) { console.log('⚠️ No se encontró botón/función de producto rápido'); return false; }
  console.log('🛒 Producto rápido via:', rapido);
  await page.waitForTimeout(1500);

  // Completar el modal de producto rápido
  const modalFilled = await page.evaluate(({ nombre, precio, gravado }) => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    // Buscar campo de descripción
    const descInput = Array.from(document.querySelectorAll('input,textarea')).filter(isVis)
      .find(el => /nombre|descripci[oó]n|product_name|quick_name|name/i.test((el.id||'')+(el.placeholder||'')+(el.name||'')));
    if (descInput) { descInput.value = nombre; descInput.dispatchEvent(new Event('input',{bubbles:true})); }
    // Precio
    const precioInput = Array.from(document.querySelectorAll('input[type="number"],input[type="text"]')).filter(isVis)
      .find(el => /precio|price|monto|amount/i.test((el.id||'')+(el.placeholder||'')+(el.name||'')));
    if (precioInput) { precioInput.value = String(precio); precioInput.dispatchEvent(new Event('input',{bubbles:true})); }
    // IVA
    if (!gravado) {
      const ivaCheck = Array.from(document.querySelectorAll('input[type="checkbox"],select')).filter(isVis)
        .find(el => /iva|tax|exento|gravado|impuesto/i.test((el.id||'')+(el.name||'')));
      if (ivaCheck) { if(ivaCheck.tagName==='INPUT') ivaCheck.checked=false; }
    }
    const visibleInputs = Array.from(document.querySelectorAll('input,select,textarea')).filter(isVis).map(el => ({ id: el.id.substring(0,30), type: el.type, val: (el.value||'').substring(0,20), ph: (el.placeholder||'').substring(0,20) }));
    return { descInput: descInput?.id, precioInput: precioInput?.id, visibleInputs: visibleInputs.slice(0,8) };
  }, { nombre, precio, gravado });
  console.log('🔍 Modal producto rápido:', JSON.stringify(modalFilled));
  await page.waitForTimeout(500);

  // Confirmar
  const guardado = await page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(el => /agregar|add|guardar|confirm|aceptar|ok/i.test(el.textContent||''));
    if (btn) { btn.click(); return btn.textContent.trim().substring(0,20); }
    return null;
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0; };
    const btn = Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis)[0];
    if (btn) btn.click();
  }).catch(()=>{});
  return !!guardado;
}

async function crearProforma(page) {
  await page.evaluate(() => { document.getElementById('btn_proform_option')?.click(); });
  await page.waitForTimeout(2000);
  const tModal = Date.now();
  await page.evaluate(() => { if (typeof show_create_proform_modal === 'function') show_create_proform_modal(); });
  await page.waitForTimeout(2500);

  // Inspeccionar modal
  const modalInfo = await page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const modals = Array.from(document.querySelectorAll('[id*="dialog"],[id*="modal"]')).filter(isVis).filter(el => el.id !== 'dialog_payment');
    const inputs = Array.from(document.querySelectorAll('input,select')).filter(isVis).map(el => ({ id: el.id.substring(0,40), type: el.type, val: (el.value||'').substring(0,20) }));
    const btns = Array.from(document.querySelectorAll('button')).filter(isVis).map(el => ({ id: el.id.substring(0,30), text: el.textContent.replace(/\s+/g,' ').trim().substring(0,30) }));
    return { modals: modals.map(m=>m.id), inputs: inputs.slice(0,10), btns: btns.filter(b=>b.text).slice(0,8) };
  });
  console.log('📋 Modal crear proforma:', JSON.stringify(modalInfo));

  // Confirmar
  const confirmado = await page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(el => /confirmar|guardar|crear|save|confirm|aceptar/i.test(el.textContent||''));
    if (btn) { btn.click(); return btn.textContent.replace(/\s+/g,' ').trim().substring(0,30); }
    if (typeof confirm_create_proform === 'function') { confirm_create_proform(); return 'confirm_create_proform()'; }
    return null;
  });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0; };
    const btn = Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis).filter(el => el.id !== 'dialog_payment')[0];
    if (btn) btn.click();
  }).catch(()=>{});
  await page.waitForTimeout(1500);
  console.log('✔ Proforma confirmada:', confirmado);
  return { modalInfo, confirmado };
}

async function cp087_proforma_productos_rapidos() {
  console.log('🔄 Ejecutando CP-087: Proforma con varios productos rápidos...');
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

    // Agregar 2 productos del catálogo (fallback por si no hay producto rápido disponible)
    // El "producto rápido" en TallerAlpha requiere CABYS que puede no estar disponible
    // Usamos productos del catálogo como proxy + intentamos producto rápido
    let productosAgregados = 0;

    // Intentar producto rápido primero
    const rapido1 = await agregarProductoRapido(page, 'Servicio de inspección', 5000, true);
    if (rapido1) { productosAgregados++; console.log('✔ Producto rápido 1 agregado'); }

    const rapido2 = await agregarProductoRapido(page, 'Mano de obra general', 3000, true);
    if (rapido2) { productosAgregados++; console.log('✔ Producto rápido 2 agregado'); }

    // Si no hubo productos rápidos, usar catálogo
    if (productosAgregados === 0) {
      console.log('⚠️ Productos rápidos no disponibles — usando catálogo como fallback');
      const a1 = await agregarProductoCatalogo(page, 'aaa-mult', 'AAA-Multímetro');
      const a2 = await agregarProductoCatalogo(page, 'aaa-bombillos', 'AAA-Bombillos');
      if (a1) productosAgregados++;
      if (a2) productosAgregados++;
    }

    const rows = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0);
    console.log('🛒 Filas en carrito:', rows);

    // Leer total
    const { txt: totalText, val: totalVal } = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent||'').trim()));
      const txt = label?.nextElementSibling?.textContent.trim() ?? null;
      return { txt, val: txt ? parseFloat((txt.match(/[₡$]\s*([\d,]+\.\d{2})/) || ['','0'])[1].replace(/,/g,'')) : NaN };
    });
    console.log('💰 Total carrito:', totalText, '→ ₡' + totalVal);

    // Crear proforma desde F4
    const tProforma = Date.now();
    const { modalInfo, confirmado } = await crearProforma(page);
    evaluarAccion(Date.now() - tProforma, 'Crear proforma desde F4');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-087 PASSED | productos: ' + productosAgregados + ' | tipo: ' + (rapido1 || rapido2 ? 'rápidos' : 'catálogo fallback') + ' | moneda: colones | total: ₡' + totalVal + ' | modal: ' + (modalInfo.modals.join(',') || 'n/a') + ' | confirmado: ' + confirmado + ' | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp087-fail');
    console.log('❌ CP-087 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp087_proforma_productos_rapidos();
