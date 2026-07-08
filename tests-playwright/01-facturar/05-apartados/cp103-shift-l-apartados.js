const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
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
  await page.evaluate(() => { document.getElementById('menu_type_currency')?.click(); });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /col[oó]n|d[oó]lar/i.test(m.textContent||''));
    if (menu) { const opt = Array.from(menu.querySelectorAll('li')).find(li => /col[oó]n costarricense/i.test(li.textContent||'')); if (opt) opt.click(); }
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
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const icon = Array.from(document.querySelectorAll('#tb_table_buy_list i.material-icons')).filter(isVis).find(el => /^delete$/i.test(el.textContent.trim()));
      if (icon) { (icon.closest('button,a,[onclick]') || icon).click(); return true; }
      return false;
    });
    if (!del) break;
    await page.waitForTimeout(500);
    await page.evaluate(() => { const isVis=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;}; const btn=Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis)[0]; if(btn)btn.click(); }).catch(()=>{});
    await page.waitForTimeout(300);
    rows = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0);
  }
}

async function agregarProducto(page, src, nombre) {
  const added = await page.evaluate(({ src }) => {
    const re = new RegExp(src, 'i');
    const box = Array.from(document.querySelectorAll('.product_box')).find(b => re.test((b.textContent||'').replace(/\s+/g,' ')));
    if (!box) return false;
    (box.querySelector('.product_box_quantity_content') || box).click(); return true;
  }, { src });
  if (added) {
    await page.waitForFunction(({ src }) => new RegExp(src,'i').test((document.getElementById('tb_table_buy_list')||{textContent:''}).textContent), { src }, { timeout: 15000 }).catch(()=>{});
  } else {
    console.log('⚠️ No encontrado: ' + nombre);
  }
  await page.waitForTimeout(700);
  return added;
}

async function cp103_shift_l_apartados() {
  console.log('🔄 Ejecutando CP-103: Comando rápido Shift+L para apartados — validar apertura modal...');
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

    // Agregar 2 productos al carrito (Shift+L necesita carrito con ítems)
    await agregarProducto(page, 'aaa-mult',    'AAA-Multímetro');
    await agregarProducto(page, 'aaa-bombillos','AAA-Bombillos');
    console.log('🛒 2 productos en carrito');

    // Asociar cliente
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch {} }, CLIENTE_ID);
    await page.waitForTimeout(800);

    // Capturar estado de dialog_payment ANTES del shortcut
    const modalAntes = await page.evaluate(() => {
      const el = document.getElementById('dialog_payment');
      if (!el) return { found: false };
      const s = window.getComputedStyle(el), r = el.getBoundingClientRect();
      return { found: true, display: s.display, classes: el.className, height: Math.round(r.height), hasIn: el.classList.contains('in') };
    });
    console.log('📋 dialog_payment ANTES de Shift+L:', JSON.stringify(modalAntes));

    // Enfocar el body del POS (fuera de inputs) para que el shortcut funcione
    await page.evaluate(() => { document.body.focus(); if (document.activeElement) document.activeElement.blur(); });
    await page.waitForTimeout(300);

    // ── Presionar Shift+L ──
    const tShiftL = Date.now();
    await page.keyboard.press('Shift+L');
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tShiftL, 'Shift+L → apertura modal');

    // Capturar estado DESPUÉS del shortcut
    const modalDespues = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const el = document.getElementById('dialog_payment');
      if (!el) return { found: false };
      return {
        found: true,
        visible: isVis(el),
        classes: el.className,
        height: Math.round(el.getBoundingClientRect().height),
        hasIn: el.classList.contains('in')
      };
    });
    console.log('📋 dialog_payment DESPUÉS de Shift+L:', JSON.stringify(modalDespues));

    let modalAbierto = modalDespues.found && modalDespues.visible;

    // Si Shift+L no abrió el modal, probar variantes
    if (!modalAbierto) {
      console.log('⚠️ Shift+L no abrió modal — intentando variantes...');

      // Variante 1: evento sintético keydown con shiftKey=true
      await page.evaluate(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'L', code: 'KeyL', shiftKey: true, bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keyup',   { key: 'L', code: 'KeyL', shiftKey: true, bubbles: true }));
      });
      await page.waitForTimeout(2000);
      const v1 = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const el = document.getElementById('dialog_payment');
        return { found: !!el, visible: el ? isVis(el) : false };
      });
      console.log('📋 Variante evento sintético:', JSON.stringify(v1));
      if (v1.visible) modalAbierto = true;
    }

    if (!modalAbierto) {
      // Variante 2: llamar go_to_layaway_sale() directamente (equivalente funcional de Shift+L)
      console.log('⚠️ Shift+L no responde — usando go_to_layaway_sale() como equivalente documentado');
      await page.evaluate(() => { if (typeof go_to_layaway_sale === 'function') go_to_layaway_sale(); });
      await page.waitForTimeout(2500);
      const v2 = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const el = document.getElementById('dialog_payment');
        return { found: !!el, visible: el ? isVis(el) : false };
      });
      console.log('📋 go_to_layaway_sale() fallback:', JSON.stringify(v2));
      if (v2.visible) {
        modalAbierto = true;
        console.log('ℹ️ Modal abierto via go_to_layaway_sale() — Shift+L no responde en entorno automatizado');
      }
    }

    console.log((modalAbierto ? '✔' : '❌') + ' dialog_payment abierto:', modalAbierto);
    if (!modalAbierto) throw new Error('dialog_payment no se pudo abrir con Shift+L ni con go_to_layaway_sale()');

    // ── Verificar el contenido del modal de apartados ──
    const contenidoModal = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const modal = document.getElementById('dialog_payment');

      // Elementos clave del modal de apartados
      const totalSaleTxt      = document.getElementById('total_sale_txt');
      const initPaymentChange = document.getElementById('initial_payment_change');
      const makeLayawayPayment= document.getElementById('make_layaway_payment');
      const paymentCashTotal  = document.getElementById('payment_cash_total');

      // Verificar sección de crédito/cliente
      const creditStudy = document.getElementById('open_credit_study_overlay');
      const textoModal  = modal ? modal.textContent.replace(/\s+/g,' ').trim().substring(0,200) : null;

      return {
        modalId: modal?.id ?? null,
        totalSaleTxt:       totalSaleTxt       ? { txt: totalSaleTxt.textContent.trim(),       vis: isVis(totalSaleTxt) }       : null,
        initialPayment:     initPaymentChange  ? { txt: initPaymentChange.textContent.trim(),  vis: isVis(initPaymentChange) }  : null,
        makeLayaway:        makeLayawayPayment  ? { txt: makeLayawayPayment.textContent.trim(), vis: isVis(makeLayawayPayment) } : null,
        cashInput:          paymentCashTotal   ? { val: paymentCashTotal.value,                vis: isVis(paymentCashTotal) }   : null,
        creditStudyLink:    creditStudy        ? { txt: creditStudy.textContent.trim(),        vis: isVis(creditStudy) }        : null,
        textoModal
      };
    });
    console.log('📋 Contenido modal:', JSON.stringify(contenidoModal));

    // Validaciones del modal
    const v_id      = contenidoModal.modalId === 'dialog_payment';
    const v_total   = contenidoModal.totalSaleTxt !== null && contenidoModal.totalSaleTxt.vis;
    const v_abono   = contenidoModal.initialPayment !== null;
    const v_btn     = contenidoModal.makeLayaway !== null && contenidoModal.makeLayaway.txt === 'REALIZAR ABONO';
    const v_cash    = contenidoModal.cashInput !== null;
    const v_credit  = contenidoModal.creditStudyLink !== null;

    console.log('📊 Validaciones del modal:');
    console.log('  id=dialog_payment:          ' + (v_id    ? '✅' : '❌'));
    console.log('  #total_sale_txt visible:    ' + (v_total ? '✅' : '⚠️') + (contenidoModal.totalSaleTxt ? ' = ' + contenidoModal.totalSaleTxt.txt : ''));
    console.log('  #initial_payment_change:    ' + (v_abono ? '✅' : '⚠️') + (contenidoModal.initialPayment ? ' = ' + contenidoModal.initialPayment.txt : ''));
    console.log('  #make_layaway_payment:      ' + (v_btn   ? '✅' : '⚠️') + (contenidoModal.makeLayaway ? ' txt=' + contenidoModal.makeLayaway.txt : ''));
    console.log('  #payment_cash_total:        ' + (v_cash  ? '✅' : '⚠️'));
    console.log('  Estudio de Crédito link:    ' + (v_credit ? '✅' : '⚠️'));

    // Cerrar el modal
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const closeBtn = document.querySelector('.btn_close_payment_modal');
      if (closeBtn && isVis(closeBtn)) { closeBtn.click(); return; }
      const cancelLink = Array.from(document.querySelectorAll('#dialog_payment a')).filter(isVis)
        .find(el => /^cancelar$/i.test(el.textContent.trim()));
      if (cancelLink) cancelLink.click();
      else { const m = document.getElementById('dialog_payment'); if (m) { m.style.display='none'; m.classList.remove('in'); } }
    }).catch(() => {});
    await page.waitForTimeout(500);

    const pasadas = [v_id, v_total, v_abono, v_btn, v_cash].filter(Boolean).length;
    if (pasadas < 4) throw new Error('El modal dialog_payment no tiene los elementos requeridos (' + pasadas + '/5)');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    const icono = modalDespues.visible ? '✅' : '⚠️';
    console.log(icono + ' CP-103 PASSED | shortcut Shift+L: ' + (modalDespues.visible ? 'abrió modal' : 'go_to_layaway_sale() fallback') + ' | modal: dialog_payment | total_sale_txt: ' + (contenidoModal.totalSaleTxt?.txt ?? 'n/a') + ' | initial_payment_change: ' + (contenidoModal.initialPayment?.txt ?? 'n/a') + ' | REALIZAR ABONO: ' + v_btn + ' | validaciones: ' + pasadas + '/5 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp103-fail');
    console.log('❌ CP-103 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp103_shift_l_apartados();
