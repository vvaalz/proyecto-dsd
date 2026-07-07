const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const TOLERANCIA = 1;
const CLIENTE_ID = 12735; // "valentina cliente prueba" no existe literal en QA (hallazgo conocido, ver CP-034)

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

function parseMonto(txt) {
  if (!txt) return NaN;
  const conSimbolo = (txt+'').match(/[₡$]\s*([\d,]+\.\d{2})/);
  if (conSimbolo) return parseFloat(conSimbolo[1].replace(/,/g,''));
  const generico = (txt+'').match(/([\d,]+\.\d{2})/);
  return generico ? parseFloat(generico[1].replace(/,/g,'')) : NaN;
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

async function cp127_facturar_transaccion_bancaria() {
  console.log('🔄 Ejecutando CP-127: Facturar producto con transacción bancaria...');
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
    await page.evaluate(() => { window.print = () => {}; }); // interceptar ventana de impresión

    // ── Rotar moneda a Dólar Americano (CP-126 usó colones) ──
    const tMoneda = Date.now();
    await page.evaluate(() => { document.getElementById('menu_type_currency')?.click(); });
    await page.waitForTimeout(700);
    const dolarSeleccionado = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /d[oó]lar/i.test(m.textContent || ''));
      if (!menu) return false;
      const opt = Array.from(menu.querySelectorAll('li')).find(li => /d[oó]lar americano/i.test(li.textContent || ''));
      if (!opt) return false;
      opt.click(); return true;
    });
    await page.waitForTimeout(800);
    evaluarAccion(Date.now() - tMoneda, 'Cambiar a Dólar Americano');
    console.log('💵 Moneda:', dolarSeleccionado ? 'Dólar Americano' : 'no se pudo cambiar (continúa en colones)');

    // ── Agregar 3 productos distintos ──
    const productos = [];
    if (await agregarProducto(page, 'aaa-mult', 'AAA-Multímetro')) productos.push('AAA-Multímetro');
    if (await agregarProducto(page, 'aaa-bombillos', 'AAA-Bombillos')) productos.push('AAA-Bombillos');
    if (await agregarProducto(page, 'aaa-filtros de combustible', 'AAA-Filtros')) productos.push('AAA-Filtros');
    console.log('🛍️ Productos en carrito:', JSON.stringify(productos));
    if (productos.length < 2) { await screenshotOnFail(page, 'cp127-fail-productos'); throw new Error('No se agregaron suficientes productos (' + productos.length + ')'); }

    // Asociar cliente de prueba
    const clienteAsociado = await page.evaluate((id) => { try { selectCustomerToPos(id); return document.getElementById('customer_select')?.value; } catch (e) { return null; } }, CLIENTE_ID);
    console.log('👤 Cliente asociado:', clienteAsociado);
    await page.waitForTimeout(800);

    // ── Abrir modal de pago ──
    const tModal = Date.now();
    await page.evaluate(() => { document.getElementById('btn_cash_pos')?.click(); });
    // #payment_cash_total es señal más confiable que #total_sale_txt (que puede estar hidden
    // durante el render inicial del modal)
    await page.waitForFunction(() => {
      const el = document.getElementById('payment_cash_total');
      return el && el.value && parseFloat(el.value) > 0;
    }, null, { timeout: 30000 });
    evaluarAccion(Date.now() - tModal, 'Abrir modal de pago');
    await page.waitForTimeout(600);

    // Leer el total de la factura desde #total_sale_txt
    const totalTxt = await page.evaluate(() => document.getElementById('total_sale_txt')?.textContent.trim() || null);
    const totalVal = parseMonto(totalTxt);
    console.log('💰 Total de la factura (#total_sale_txt):', totalTxt, '→', totalVal);
    if (isNaN(totalVal) || totalVal <= 0) { await screenshotOnFail(page, 'cp127-fail-total'); throw new Error('No se pudo leer un total válido en #total_sale_txt'); }

    // ── Desactivar efectivo y activar transacción bancaria (is_payment_transaction) ──
    // Los checkboxes de método de pago usan un slider CSS fuera del viewport del modal —
    // no se puede hacer click directo con page.locator().click(), hay que usar page.evaluate()
    const tMetodo = Date.now();
    await page.evaluate((id) => { document.getElementById(id)?.click(); }, 'is_payment_cash');
    await page.waitForTimeout(600);
    await page.evaluate((id) => { document.getElementById(id)?.click(); }, 'is_payment_transaction');
    await page.waitForTimeout(600);
    evaluarAccion(Date.now() - tMetodo, 'Activar transacción bancaria (is_payment_transaction)');

    const metodoState = await page.evaluate(() => ({
      cashChecked: document.getElementById('is_payment_cash')?.checked,
      transactionChecked: document.getElementById('is_payment_transaction')?.checked
    }));
    console.log('💳 Estado de métodos de pago:', JSON.stringify(metodoState));
    if (!metodoState.transactionChecked) { await screenshotOnFail(page, 'cp127-fail-metodo'); throw new Error('No se pudo activar transacción bancaria (is_payment_transaction sigue desmarcado)'); }
    if (metodoState.cashChecked) { await screenshotOnFail(page, 'cp127-fail-efectivo-sigue-activo'); throw new Error('Efectivo (is_payment_cash) sigue marcado tras intentar desactivarlo'); }

    // Rellenar el monto EXACTO del total (transacción bancaria no admite exceso, a diferencia de efectivo)
    await page.evaluate((monto) => {
      const el = document.getElementById('payment_transaction_total');
      if (el) { el.value = String(monto); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    }, totalVal);
    await page.waitForTimeout(500);
    const montoTransaccion = await page.evaluate(() => parseFloat(document.getElementById('payment_transaction_total')?.value || '0'));
    console.log('🏦 Monto en payment_transaction_total:', montoTransaccion);

    // ── Confirmar factura ──
    const tFacturar = Date.now();
    await page.evaluate(() => { document.getElementById('make_payment')?.click(); });
    await page.waitForTimeout(1500);
    await page.keyboard.press('Enter').catch(() => {});
    await page.waitForTimeout(1000);

    let facturaConfirmada = false;
    for (let i = 0; i < 15 && !facturaConfirmada; i++) {
      await page.waitForTimeout(1000);
      const state = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis).filter(el => el.id !== 'dialog_payment')[0];
        if (sa) { const btn = sa.querySelector('button.confirm,button'); if (btn) btn.click(); }
        const tabla = document.getElementById('tb_table_buy_list');
        const rowsNow = tabla ? tabla.querySelectorAll('tr.main_row').length : 0;
        return { rowsNow, saTxt: sa ? sa.textContent.replace(/\s+/g,' ').trim().substring(0,80) : null };
      });
      if (state.saTxt) console.log('🔔 SweetAlert (' + i + '):', state.saTxt);
      facturaConfirmada = state.rowsNow === 0;
    }
    evaluarAccion(Date.now() - tFacturar, 'Procesar factura transacción bancaria');
    console.log('✔ Factura confirmada (carrito vacío):', facturaConfirmada);

    // ── VALIDACIONES ──
    const v1 = productos.length >= 2;
    const v2 = !isNaN(totalVal) && totalVal > 0;
    const v3 = metodoState.transactionChecked && !metodoState.cashChecked;
    const v4 = Math.abs(montoTransaccion - totalVal) <= TOLERANCIA;
    const v5 = facturaConfirmada;

    console.log('\n📊 === VALIDACIONES CP-127 ===');
    console.log('  ≥2 productos en carrito:              ' + (v1 ? '✅' : '❌') + ' (' + productos.length + ')');
    console.log('  Total leído en #total_sale_txt:        ' + (v2 ? '✅' : '❌') + ' ' + totalTxt);
    console.log('  Transacción activa / efectivo inactivo:' + (v3 ? '✅' : '❌'));
    console.log('  Monto transacción ≈ total ±1:          ' + (v4 ? '✅' : '❌') + ' (' + montoTransaccion + ' vs ' + totalVal + ')');
    console.log('  Factura confirmada:                    ' + (v5 ? '✅' : '❌'));

    if (!v1) throw new Error('No se agregaron suficientes productos');
    if (!v2) throw new Error('No se pudo leer el total de la factura');
    if (!v3) throw new Error('No se pudo activar correctamente el método transacción bancaria');
    if (!v4) throw new Error('El monto en payment_transaction_total no coincide con el total ±' + TOLERANCIA);
    if (!v5) throw new Error('La factura con transacción bancaria no se confirmó');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-127 PASSED | moneda: ' + (dolarSeleccionado ? 'dólares' : 'colones') + ' | productos: ' + productos.join(' + ') + ' | total: ' + totalTxt + ' | método: transacción bancaria (is_payment_transaction) | validaciones: 5/5 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp127-fail');
    console.log('❌ CP-127 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp127_facturar_transaccion_bancaria();
