const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const TOLERANCIA = 1;
const CLIENTE_ID = 12735; // "valentina cliente prueba" no existe literal en QA (hallazgo conocido, ver CP-034)

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
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

// Producto rápido vía CABYS (flujo consistentemente inestable — ver CP-051/075/118/119) con
// fallback a un producto del catálogo si CABYS no responde
async function agregarProductoRapidoOFallback(page, nombre, precio, cabysTermino, fallbackSrc) {
  try {
    const opened = await page.evaluate(() => {
      if (typeof showModalQuickProductPos === 'function') { showModalQuickProductPos(); return true; }
      return false;
    });
    if (opened) {
      await page.waitForTimeout(1200);
      const modalVisible = await page.evaluate(() => {
        const m = document.getElementById('dialog_quick_product_pos');
        return m ? window.getComputedStyle(m).display !== 'none' : false;
      });
      if (modalVisible) {
        await page.evaluate(({ n, p }) => {
          const setVal = (id, v) => { const el = document.getElementById(id); if (!el) return; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
          setVal('quick_product_name', n);
          setVal('quick_product_quantity', '1');
          setVal('quick_product_price', p);
        }, { n: nombre, p: String(precio) });
        await page.waitForTimeout(400);
        await page.evaluate((n) => validate_cabys_code(0, 6, n, 1), nombre);
        await page.waitForTimeout(1500);
        await page.evaluate((t) => {
          const i = document.getElementById('cabys_code_search');
          if (i) { i.value = t; i.dispatchEvent(new Event('input', { bubbles: true })); }
        }, cabysTermino);
        await page.evaluate(() => { const b = document.getElementById('btn_cabys_code_search'); if (b) b.click(); });
        await page.waitForTimeout(4000);
        const cabysSelected = await page.evaluate(() => {
          const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
          const row = Array.from(document.querySelectorAll('tr, li')).filter(isVis).find(el => el.onclick || el.querySelector('[onclick]'));
          if (!row) return false;
          (row.onclick ? row : row.querySelector('[onclick]')).click();
          return true;
        });
        if (cabysSelected) {
          await page.waitForTimeout(1200);
          const saveBtn = await page.evaluate(() => {
            const b = document.querySelector('.save_quick_product_pos, button[onclick*="quick_product_save"]');
            if (b) { b.click(); return true; }
            return false;
          });
          if (saveBtn) {
            await page.waitForTimeout(2000);
            const enCarrito = await page.evaluate((n) => (document.getElementById('tb_table_buy_list')||{textContent:''}).textContent.includes(n), nombre);
            if (enCarrito) return { ok: true, viaFallback: false, nombre };
          }
        }
      }
    }
  } catch {}
  console.log('⚠️ Producto rápido no disponible (CABYS inestable, mismo hallazgo que CP-051) — usando producto del catálogo como sustituto');
  const fallback = await page.evaluate((src) => {
    const box = Array.from(document.querySelectorAll('.product_box')).find(b => new RegExp(src,'i').test((b.textContent||'').replace(/\s+/g,' ')));
    if (!box) return false;
    (box.querySelector('.product_box_quantity_content') || box).click();
    return true;
  }, fallbackSrc);
  if (!fallback) return { ok: false, viaFallback: true, nombre: null };
  await page.waitForTimeout(1000);
  return { ok: true, viaFallback: true, nombre: fallbackSrc + ' (fallback catálogo)' };
}

async function cp126_facturar_sinpe_movil() {
  console.log('🔄 Ejecutando CP-126: Facturar producto con SINPE Móvil...');
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

    // ── PASO 1: Agregar productos (mezcla catálogo + producto rápido) ──
    const productos = [];
    const p1 = await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll('.product_box')).find(b => /aaa-mult[ií]metro automotriz digital/i.test((b.textContent||'').replace(/\s+/g,' ')));
      if (!t) return false;
      (t.querySelector('.product_box_quantity_content') || t).click(); return true;
    });
    if (p1) { productos.push('AAA-Multímetro (catálogo)'); await page.waitForTimeout(900); } else console.log('⚠️ No se encontró AAA-Multímetro');

    const p2 = await page.evaluate(() => {
      const t = Array.from(document.querySelectorAll('.product_box')).find(b => /aaa-bombillos/i.test((b.textContent||'').replace(/\s+/g,' ')));
      if (!t) return false;
      (t.querySelector('.product_box_quantity_content') || t).click(); return true;
    });
    if (p2) { productos.push('AAA-Bombillos (catálogo)'); await page.waitForTimeout(900); } else console.log('⚠️ No se encontró AAA-Bombillos');

    const rapido = await agregarProductoRapidoOFallback(page, 'Quick CP126 SINPE', 500, 'varios', 'aaa-filtros de combustible');
    if (rapido.ok) productos.push(rapido.nombre);
    console.log('🛍️ Productos en carrito:', JSON.stringify(productos));
    if (productos.length < 2) { await screenshotOnFail(page, 'cp126-fail-productos'); throw new Error('No se agregaron suficientes productos (' + productos.length + ')'); }

    // Asociar cliente de prueba
    const clienteAsociado = await page.evaluate((id) => { try { selectCustomerToPos(id); return document.getElementById('customer_select')?.value; } catch (e) { return null; } }, CLIENTE_ID);
    console.log('👤 Cliente asociado:', clienteAsociado);
    await page.waitForTimeout(800);

    // ── PASO 2: Abrir modal de pago ──
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
    if (isNaN(totalVal) || totalVal <= 0) { await screenshotOnFail(page, 'cp126-fail-total'); throw new Error('No se pudo leer un total válido en #total_sale_txt'); }

    // ── PASO 3: Desactivar efectivo y activar SINPE Móvil (is_payment_check) ──
    // Los checkboxes de método de pago usan un slider CSS fuera del viewport del modal —
    // no se puede hacer click directo con page.locator().click(), hay que usar page.evaluate()
    const tMetodo = Date.now();
    await page.evaluate((id) => { document.getElementById(id)?.click(); }, 'is_payment_cash');
    await page.waitForTimeout(600);
    await page.evaluate((id) => { document.getElementById(id)?.click(); }, 'is_payment_check');
    await page.waitForTimeout(600);
    evaluarAccion(Date.now() - tMetodo, 'Activar SINPE Móvil (is_payment_check)');

    const metodoState = await page.evaluate(() => ({
      cashChecked: document.getElementById('is_payment_cash')?.checked,
      checkChecked: document.getElementById('is_payment_check')?.checked
    }));
    console.log('💳 Estado de métodos de pago:', JSON.stringify(metodoState));
    if (!metodoState.checkChecked) { await screenshotOnFail(page, 'cp126-fail-metodo'); throw new Error('No se pudo activar SINPE Móvil (is_payment_check sigue desmarcado)'); }
    if (metodoState.cashChecked) { await screenshotOnFail(page, 'cp126-fail-efectivo-sigue-activo'); throw new Error('Efectivo (is_payment_cash) sigue marcado tras intentar desactivarlo'); }

    // Rellenar el monto EXACTO del total (SINPE no admite exceso, a diferencia de efectivo)
    await page.evaluate((monto) => {
      const el = document.getElementById('payment_check_total');
      if (el) { el.value = String(monto); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
    }, totalVal);
    await page.waitForTimeout(500);
    const montoSinpe = await page.evaluate(() => parseFloat(document.getElementById('payment_check_total')?.value || '0'));
    console.log('📱 Monto en payment_check_total:', montoSinpe);

    // ── PASO 4: Confirmar factura ──
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
    evaluarAccion(Date.now() - tFacturar, 'Procesar factura SINPE Móvil');
    console.log('✔ Factura confirmada (carrito vacío):', facturaConfirmada);

    // ── VALIDACIONES ──
    const v1 = productos.length >= 2;
    const v2 = !isNaN(totalVal) && totalVal > 0;
    const v3 = metodoState.checkChecked && !metodoState.cashChecked;
    const v4 = Math.abs(montoSinpe - totalVal) <= TOLERANCIA;
    const v5 = facturaConfirmada;

    console.log('\n📊 === VALIDACIONES CP-126 ===');
    console.log('  ≥2 productos en carrito:          ' + (v1 ? '✅' : '❌') + ' (' + productos.length + ')');
    console.log('  Total leído en #total_sale_txt:    ' + (v2 ? '✅' : '❌') + ' ' + totalTxt);
    console.log('  SINPE activo / efectivo inactivo:  ' + (v3 ? '✅' : '❌'));
    console.log('  Monto SINPE ≈ total ±1:            ' + (v4 ? '✅' : '❌') + ' (' + montoSinpe + ' vs ' + totalVal + ')');
    console.log('  Factura confirmada:                ' + (v5 ? '✅' : '❌'));

    if (!v1) throw new Error('No se agregaron suficientes productos');
    if (!v2) throw new Error('No se pudo leer el total de la factura');
    if (!v3) throw new Error('No se pudo activar correctamente el método SINPE Móvil');
    if (!v4) throw new Error('El monto en payment_check_total no coincide con el total ±' + TOLERANCIA);
    if (!v5) throw new Error('La factura con SINPE Móvil no se confirmó');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-126 PASSED | productos: ' + productos.join(' + ') + ' | total: ' + totalTxt + ' | método: SINPE Móvil (is_payment_check) | validaciones: 5/5 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp126-fail');
    console.log('❌ CP-126 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp126_facturar_sinpe_movil();
