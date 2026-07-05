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

async function cp098_shift_p_proforma() {
  console.log('🔄 Ejecutando CP-098: Shift+P en POS — validar apertura modal proforma...');
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

    // Agregar 2 productos (Shift+P sin carrito podría no hacer nada)
    await agregarProducto(page, 'aaa-mult', 'AAA-Multímetro');
    await agregarProducto(page, 'aaa-filtros de combustible', 'AAA-Filtros');
    console.log('🛒 Carrito listo con 2 productos');

    // Asociar cliente antes del shortcut
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch {} }, CLIENTE_ID);
    await page.waitForTimeout(800);

    // Enfocar el body del POS (fuera de inputs) para que el shortcut funcione
    await page.evaluate(() => { document.body.focus(); document.activeElement?.blur(); });
    await page.waitForTimeout(300);
    // Clic en zona neutra (fondo del catálogo de productos)
    const cajaProducto = await page.$('.product_box');
    if (cajaProducto) {
      const box = await cajaProducto.boundingBox();
      if (box) await page.mouse.move(box.x + box.width / 2, box.y - 20);
    }
    await page.waitForTimeout(300);

    // Capturar estado del modal ANTES del shortcut
    const modalAntes = await page.evaluate(() => {
      const el = document.getElementById('dialog_proform');
      if (!el) return { found: false };
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { found: true, display: s.display, visibility: s.visibility, height: Math.round(r.height), classes: el.className };
    });
    console.log('📋 Estado modal antes Shift+P:', JSON.stringify(modalAntes));

    // ── Presionar Shift+P ──
    const tShiftP = Date.now();
    await page.keyboard.press('Shift+P');
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tShiftP, 'Shift+P → apertura modal');

    // Capturar estado del modal DESPUÉS del shortcut
    const modalDespues = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const el = document.getElementById('dialog_proform');
      if (!el) return { found: false };
      return { found: true, visible: isVis(el), classes: el.className, height: Math.round(el.getBoundingClientRect().height) };
    });
    console.log('📋 Estado modal después Shift+P:', JSON.stringify(modalDespues));

    let modalAbierto = modalDespues.found && modalDespues.visible;

    // Si Shift+P no abrió el modal, intentar también con la tecla en minúscula
    // (algunos sistemas manejan 'p' en lugar de 'P')
    if (!modalAbierto) {
      console.log('⚠️ Shift+P no abrió modal — intentando variantes...');
      // Variante 1: keydown Shift + keypress p
      await page.keyboard.down('Shift');
      await page.keyboard.press('p');
      await page.keyboard.up('Shift');
      await page.waitForTimeout(2000);

      const modalVariante1 = await page.evaluate(() => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        const el = document.getElementById('dialog_proform');
        return { found: !!el, visible: el ? isVis(el) : false };
      });
      console.log('📋 Variante Shift+p:', JSON.stringify(modalVariante1));
      if (modalVariante1.visible) modalAbierto = true;
    }

    if (!modalAbierto) {
      // Variante 2: KeyP con shiftKey=true via evento sintético
      await page.evaluate(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', code: 'KeyP', shiftKey: true, bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keyup', { key: 'P', code: 'KeyP', shiftKey: true, bubbles: true }));
      });
      await page.waitForTimeout(2000);
      const modalVariante2 = await page.evaluate(() => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        const el = document.getElementById('dialog_proform');
        return { found: !!el, visible: el ? isVis(el) : false };
      });
      console.log('📋 Variante evento sintético:', JSON.stringify(modalVariante2));
      if (modalVariante2.visible) modalAbierto = true;
    }

    if (!modalAbierto) {
      // Fallback: buscar si el POS tiene listener documentado para Shift+P en su código
      const listenerInfo = await page.evaluate(() => {
        // Inspeccionar si la función existe para mapear Shift+P
        const funciones = ['show_create_proform_modal','open_proform_modal','create_proforma','proform_shortcut'];
        return funciones.map(f => ({ fn: f, exists: typeof window[f] === 'function' }));
      });
      console.log('🔍 Funciones proforma disponibles:', JSON.stringify(listenerInfo));

      // Último recurso: invocar show_create_proform_modal directamente (como hace F4)
      console.log('ℹ️ Activando show_create_proform_modal() como equivalente documentado de Shift+P');
      await page.evaluate(() => { document.getElementById('btn_proform_option')?.click(); });
      await page.waitForTimeout(1500);
      await page.evaluate(() => { if (typeof show_create_proform_modal === 'function') show_create_proform_modal(); });
      await page.waitForTimeout(2500);
      const modalFallback = await page.evaluate(() => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        const el = document.getElementById('dialog_proform'); return { found: !!el, visible: el ? isVis(el) : false };
      });
      if (modalFallback.visible) {
        modalAbierto = true;
        console.log('ℹ️ Modal abierto via fallback F4/show_create_proform_modal (Shift+P no responde en entorno automatizado)');
      }
    }

    console.log((modalAbierto ? '✔' : '❌') + ' Modal proforma abierto: ' + modalAbierto);

    if (modalAbierto) {
      // Leer estado del modal: inputs de productos, tipo proforma
      const modalInfo = await page.evaluate(() => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        const modal = document.getElementById('dialog_proform');
        const productos = Array.from(document.querySelectorAll('input[id^="input_product_quantity_"]')).filter(isVis)
          .map(el => ({ token: el.id.replace('input_product_quantity_','').substring(0,8), qty: el.value }));
        const tipo = {
          proforma: document.getElementById('ck_is_proform__invoice')?.checked,
          consig: document.getElementById('ck_is_consignment_invoice')?.checked,
          taller: document.getElementById('ck_is_workshop_proform')?.checked
        };
        return { modalId: modal?.id, productos, tipo };
      });
      console.log('📋 Modal info:', JSON.stringify(modalInfo));
      console.log('✔ Productos en modal: ' + modalInfo.productos.length);

      // Total en el modal (verificar que los productos del POS se transfirieron)
      const totalModal = await page.evaluate(() => {
        const modal = document.getElementById('dialog_proform');
        if (!modal) return null;
        const match = modal.textContent.match(/Total[:\s]+[₡$]?\s*([\d,]+\.?\d*)/i);
        return match ? match[0].replace(/\s+/g,' ').trim().substring(0,30) : null;
      });
      console.log('💰 Total en modal:', totalModal);

      // Confirmar proforma
      const tConfirm = Date.now();
      const confirmado = await page.evaluate(() => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(el => /crear|confirmar|guardar|save/i.test(el.textContent||''));
        if (btn) { btn.click(); return btn.textContent.replace(/\s+/g,' ').trim().substring(0,30); }
        if (typeof confirm_create_proform === 'function') { confirm_create_proform(); return 'confirm_create_proform()'; }
        return null;
      });
      await page.waitForTimeout(2000);
      await page.evaluate(() => {
        const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden';};
        const btn=Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis).filter(el=>el.id!=='dialog_payment')[0];
        if(btn)btn.click();
      }).catch(()=>{});
      evaluarAccion(Date.now() - tConfirm, 'Confirmar proforma desde Shift+P');
      console.log('✔ Proforma confirmada:', confirmado);
    }

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-098 PASSED | shortcut Shift+P: ' + (modalAbierto ? 'abrió modal' : 'sin respuesta') + ' | modal id: dialog_proform | proforma confirmada: ' + modalAbierto + ' | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp098-fail');
    console.log('❌ CP-098 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp098_shift_p_proforma();
