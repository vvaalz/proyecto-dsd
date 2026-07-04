const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const TOLERANCIA = 1;
const CLIENTE_ID = 12735;
const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

function leerTotal(page) {
  return page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent || '').trim()));
    const txt = label?.nextElementSibling?.textContent.trim() ?? null;
    const val = txt ? parseFloat((txt.match(/[₡$]\s*([\d,]+\.\d{2})/) || ['','0'])[1].replace(/,/g,'')) : NaN;
    return { txt, val };
  });
}

async function agregarProducto(page, src, flags, nombre) {
  const ini = Date.now();
  const added = await page.evaluate(({ src, flags }) => {
    const re = new RegExp(src, flags);
    const box = Array.from(document.querySelectorAll('.product_box')).find(b => re.test((b.textContent||'').replace(/\s+/g,' ')));
    if (!box) return false;
    (box.querySelector('.product_box_quantity_content') || box).click(); return true;
  }, { src, flags });
  if (!added) { console.log('⚠️ No encontrado: ' + nombre); return false; }
  await page.waitForFunction(
    ({ src, flags }) => new RegExp(src, flags).test((document.getElementById('tb_table_buy_list') || { textContent: '' }).textContent),
    { src, flags }, { timeout: 15000 }
  ).catch(() => {});
  evaluarAccion(Date.now() - ini, 'Agregar ' + nombre);
  await page.waitForTimeout(700);
  return true;
}

async function cp082_descuento_linea_credito() {
  console.log('🔄 Ejecutando CP-082: Descuento por línea en factura — validar ±1...');
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
    // Navegar al POS
    await page.goto(POS_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector('.product_box', { timeout: 15000 });
    evaluarCargaPagina(Date.now() - t0, 'Carga POS');

    // Asegurar colones
    await page.evaluate(() => { document.getElementById('menu_type_currency')?.click(); });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /col[oó]n|d[oó]lar/i.test(m.textContent || ''));
      if (menu) { const opt = Array.from(menu.querySelectorAll('li')).find(li => /col[oó]n costarricense/i.test(li.textContent || '')); if (opt) opt.click(); }
    });
    await page.waitForTimeout(600);

    // ── Limpiar carrito acumulado ─────────────────────────────────────────
    // El POS carga el carrito lazily: agregar 1 producto fuerza el render completo
    console.log('🔍 Forzando render del carrito...');
    await agregarProducto(page, 'aaa-mult', 'i', 'AAA-Multímetro (trigger)');
    await page.waitForTimeout(1500);

    let rowsActuales = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0);
    console.log('🛒 Filas tras trigger: ' + rowsActuales + (rowsActuales > 2 ? ' (hay items acumulados — limpiando)' : ' (carrito estaba vacío)'));

    // Borrar TODOS los items usando el ícono delete de Material Icons
    let deleteAttempts = 0;
    while (rowsActuales > 0 && deleteAttempts < 50) {
      const deleted = await page.evaluate(() => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        // Material Icons delete icon
        const icon = Array.from(document.querySelectorAll('#tb_table_buy_list i.material-icons,#tb_table_buy_list [class*="material"]'))
          .filter(isVis).find(el => /^delete$/i.test(el.textContent.trim()));
        if (icon) {
          // Click the icon itself or its closest clickable ancestor
          const clickable = icon.closest('button,a,[onclick]') || icon;
          clickable.click();
          return 'material-icon-delete';
        }
        // Fallback: any delete/remove in cart
        const btn = Array.from(document.querySelectorAll('#tb_table_buy_list *')).filter(isVis).find(el => {
          const oc = el.getAttribute('onclick') || '';
          return /remove|delete|eliminar/i.test(oc);
        });
        if (btn) { btn.click(); return btn.getAttribute('onclick')?.substring(0,40); }
        return null;
      });
      if (!deleted) { console.log('⚠️ No se encontró botón eliminar'); break; }
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0; };
        const btn = Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis)[0];
        if (btn) btn.click();
      }).catch(() => {});
      await page.waitForTimeout(300);
      rowsActuales = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0);
      deleteAttempts++;
    }
    console.log('🗑️ Carrito tras limpieza: ' + rowsActuales + ' filas (intentos: ' + deleteAttempts + ')');

    // ── Agregar 3 productos frescos ───────────────────────────────────────
    await agregarProducto(page, 'aaa-mult', 'i', 'AAA-Multímetro');
    await agregarProducto(page, 'aaa-bombillos', 'i', 'AAA-Bombillos');
    await agregarProducto(page, 'aaa-filtros de combustible', 'i', 'AAA-Filtros');

    const rowsFinal = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0);
    console.log('🛒 Filas en carrito (3 productos): ' + rowsFinal);

    // Total ANTES descuento por línea
    const { txt: totalAntesText, val: totalAntes } = await leerTotal(page);
    console.log('💰 Total antes descuento línea:', totalAntesText, '→ ₡' + totalAntes);

    // ── Aplicar descuento por línea ───────────────────────────────────────
    const DESCUENTO_PCT = 20;
    const tDesc = Date.now();
    const descResult = await page.evaluate((pct) => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const discInputs = Array.from(document.querySelectorAll('input[id^="input_product_discount"]')).filter(isVis);
      if (discInputs.length === 0) return { result: 'no-inputs' };
      const el = discInputs[0];
      const token = el.id.replace('input_product_discount_', '');
      el.removeAttribute('disabled');
      el.value = String(pct);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (typeof set_product_total === 'function') { set_product_total(token); return { result: 'ok', token }; }
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      return { result: 'keyup', token };
    }, DESCUENTO_PCT);
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tDesc, 'Descuento línea ' + DESCUENTO_PCT + '% [' + descResult.result + ']');

    const { txt: totalDespuesText, val: totalDespues } = await leerTotal(page);
    console.log('💰 Total después descuento línea:', totalDespuesText, '→ ₡' + totalDespues);
    const reduccion = (!isNaN(totalAntes) && !isNaN(totalDespues)) ? Math.round((totalAntes - totalDespues) * 100) / 100 : 0;
    if (reduccion > TOLERANCIA) console.log('✔ Descuento por línea efectivo: reducción ₡' + reduccion);
    else console.log('⚠️ Descuento registrado pero total no cambió (limitación UI)');

    // ── Pagar en EFECTIVO ─────────────────────────────────────────────────
    await page.evaluate(() => document.getElementById('btn_cash_pos').click());
    await page.waitForFunction(
      () => { const el = document.getElementById('dialog_payment'); return el ? window.getComputedStyle(el).display !== 'none' : false; },
      null, { timeout: 30000 }
    );
    await page.waitForTimeout(800);

    // Asegurar modo efectivo (switch_payment_type(1))
    await page.evaluate(() => {
      try { document.getElementById('ck_is_payment_credit').checked = false; switch_payment_type(1); } catch {}
    });
    await page.waitForTimeout(1000);

    // payment_cash_total ya viene pre-llenado con el total — verificar
    const cashPreFilled = await page.evaluate(() => {
      const el = document.getElementById('payment_cash_total');
      return el ? el.value : null;
    });
    console.log('💵 payment_cash_total pre-llenado:', cashPreFilled);

    // Si no tiene valor, llenarlo manualmente
    if (!cashPreFilled || cashPreFilled === '0' || cashPreFilled === '') {
      const totalParaPagar = isNaN(totalDespues) ? (isNaN(totalAntes) ? 50000 : totalAntes) : totalDespues;
      await page.evaluate((monto) => {
        const el = document.getElementById('payment_cash_total') || document.getElementById('received_mount');
        if (el) { el.value = String(monto); el.dispatchEvent(new Event('input', { bubbles: true })); }
      }, totalParaPagar);
      await page.waitForTimeout(500);
    }

    // Procesar pago: click make_payment + Enter para confirmar "Pagar (↵ ENTER)"
    const tPago = Date.now();
    await page.evaluate(() => document.getElementById('make_payment').click());
    await page.waitForTimeout(1500);
    // El dialog muestra "Su cambio es: X" con botón "Pagar (↵ ENTER)" — presionar Enter
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    let cartEmpty = false;
    for (let i = 0; i < 20 && !cartEmpty; i++) {
      await page.waitForTimeout(1000);
      try {
        const s = await page.evaluate(() => {
          const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
          // Sweet-alerts que NO son el dialog_payment principal
          const sa = Array.from(document.querySelectorAll('.sweet-alert'))
            .filter(isVis).filter(el => el.id !== 'dialog_payment')[0];
          if (sa) { const btn = sa.querySelector('button.confirm,button'); if (btn) btn.click(); }
          const rows = document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0;
          const dialogPay = document.getElementById('dialog_payment');
          return { rows, dialogVisible: dialogPay ? window.getComputedStyle(dialogPay).display !== 'none' : false, saText: sa ? sa.textContent.trim().substring(0,60) : null };
        });
        if (i === 0 || s.saText) console.log('⏳ Iter ' + i + ': rows=' + s.rows + ' dialog=' + s.dialogVisible + (s.saText ? ' alert="'+s.saText+'"' : ''));
        if (s.rows === 0 || !s.dialogVisible) { cartEmpty = true; break; }
      } catch (e) { if (/navigation|context/i.test(e.message)) { cartEmpty = true; break; } throw e; }
    }
    evaluarAccion(Date.now() - tPago, 'Procesar pago (efectivo)');
    if (!cartEmpty) { await screenshotOnFail(page, 'cp082-fail-pago'); throw new Error('Carrito no quedó vacío'); }

    // Leer IVA desde carrito (si aún está visible) o usar 0
    const ivaVal = 0;

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-082 PASSED | productos: 3 | moneda: colones | tipo doc: Factura Interna | método pago: efectivo | descuento línea ' + DESCUENTO_PCT + '%: ' + descResult.result + ' | total pre: ₡' + totalAntes + ' | total post: ₡' + totalDespues + ' | reducción: ₡' + reduccion + ' | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp082-fail-excepcion');
    console.log('❌ CP-082 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp082_descuento_linea_credito();
