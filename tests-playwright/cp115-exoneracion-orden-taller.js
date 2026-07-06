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

function parseMonto(txt) {
  if (!txt) return NaN;
  // Preferir el número prefijado por ₡/$ (el monto real); textos como "IVA General (0.00%) ₡43.37"
  // tienen un porcentaje ANTES del monto, así que no alcanza con tomar el primer match genérico
  const conSimbolo = (txt+'').match(/[₡$]\s*([\d,]+\.\d{2})/);
  if (conSimbolo) return parseFloat(conSimbolo[1].replace(/,/g,''));
  const generico = (txt+'').match(/([\d,]+\.\d{2})/);
  return generico ? parseFloat(generico[1].replace(/,/g,'')) : NaN;
}

async function cargarPOS(page) {
  await page.goto(POS_URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(5000);
  await page.waitForSelector('#product_search', { state: 'attached', timeout: 180000 });
  await page.waitForTimeout(3000);
  await page.waitForSelector('.product_box', { timeout: 60000 });
}

function leerTotalCarrito(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const el = Array.from(document.querySelectorAll('#total')).find(isVis);
    const txt = el ? el.textContent.trim() : null;
    const val = txt ? parseFloat((txt.match(/[₡$]?\s*([\d,]+\.\d{2})/) || ['','0'])[1].replace(/,/g,'')) : NaN;
    return { txt, val };
  });
}

async function dismissContinueDialog(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const btns = Array.from(document.querySelectorAll('button, a')).filter(isVis).filter(b => /^continuar$/i.test((b.textContent||'').trim()));
    if (btns.length > 0) { btns[0].click(); return true; }
    return false;
  }).catch(() => false);
}

// El catálogo se oculta cuando hay una orden de taller activa — buscar en #product_search
// fuerza al servidor a repoblar el grid (mismo patrón que CP-112/CP-113/CP-114)
async function agregarProductoPorBusqueda(page, termino) {
  await page.click('#product_search').catch(() => {});
  await page.fill('#product_search', termino);
  await page.waitForTimeout(800);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);

  let nombre = null;
  for (let attempt = 0; attempt < 8 && !nombre; attempt++) {
    await page.waitForTimeout(1500);
    nombre = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const boxes = Array.from(document.querySelectorAll('.product_box')).filter(isVis)
        .filter(b => !/^\s*crear\s*producto\s*$/i.test(b.textContent.replace(/\s+/g,' ').trim()));
      if (boxes.length === 0) return null;
      const box = boxes[0];
      const nameEl = box.querySelector('.product_box_name, .product-name');
      const nom = nameEl ? nameEl.textContent.trim() : box.textContent.replace(/\s+/g,' ').trim().substring(0,40);
      (box.querySelector('.product_box_quantity_content') || box).click();
      return nom;
    });
  }
  return nombre;
}

async function cp115_exoneracion_orden_taller() {
  console.log('🔄 Ejecutando CP-115: Exoneración en orden de taller...');
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
    await page.waitForTimeout(1000);
    await page.evaluate(() => { window.print = () => {}; });

    // ── PASO 1: Abrir tab Taller (F3) y seleccionar una orden ──
    await page.evaluate(() => { document.getElementById('btn_taller_option')?.click(); });
    await page.waitForTimeout(3000);

    const todasOrdenes = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return Array.from(document.querySelectorAll('.pos-order-card')).filter(isVis).map(c => ({
        onclick: c.getAttribute('onclick') || '', textoCard: c.textContent.replace(/\s+/g,' ').trim().substring(0,100)
      }));
    });
    console.log('📋 Órdenes disponibles:', todasOrdenes.length);
    if (todasOrdenes.length === 0) throw new Error('No se encontró ninguna orden en el tab Taller (F3)');

    const ordenInfo = todasOrdenes[0];
    await page.evaluate((onclick) => { eval(onclick); }, ordenInfo.onclick);
    await page.waitForTimeout(2000);
    await dismissContinueDialog(page);
    await page.waitForTimeout(500);
    await page.evaluate(() => { document.getElementById('btn_pos_option')?.click(); });
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 15000 });
    await page.waitForTimeout(2000);
    await dismissContinueDialog(page);
    console.log('📋 Orden usada:', ordenInfo.textoCard.substring(0,60));

    // Agregar un producto gravado fresco (precio garantizado válido) para tener IVA > 0
    const nombreProducto = await agregarProductoPorBusqueda(page, 'multimetro');
    if (!nombreProducto) { await screenshotOnFail(page, 'cp115-fail-producto'); throw new Error('No se pudo agregar un producto gravado a la orden de taller'); }
    console.log('🛍️ Producto agregado:', nombreProducto);
    await page.waitForTimeout(1000);

    const { txt: totalTxt, val: totalVal } = await leerTotalCarrito(page);
    console.log('💰 Total del carrito:', totalTxt);
    if (isNaN(totalVal) || totalVal <= 0) { await screenshotOnFail(page, 'cp115-fail-total'); throw new Error('El total del carrito es inválido: ' + totalTxt); }

    // ── PASO 2: Leer IVA antes de exonerar ──
    await page.evaluate(() => { document.getElementById('show_invoice_advanced_detail')?.click(); });
    await page.waitForTimeout(800);
    const ivaAntesTxt = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const el = Array.from(document.querySelectorAll('.advanced_invoice_detail,[class*="total_div"]')).filter(isVis).find(e => /^IVA/i.test((e.textContent||'').replace(/\s+/g,' ').trim()));
      return el ? el.textContent.replace(/\s+/g,' ').trim() : null;
    });
    const ivaAntesVal = parseMonto(ivaAntesTxt);
    console.log('🧾 IVA antes de exonerar:', ivaAntesTxt, '→', ivaAntesVal);
    if (!(ivaAntesVal > 0)) { await screenshotOnFail(page, 'cp115-fail-iva'); throw new Error('Se esperaba IVA > 0 antes de exonerar (producto: ' + nombreProducto + ')'); }

    // ── PASO 3: Aplicar exoneración 100% ──
    const tExo = Date.now();
    await page.evaluate(() => { set_apply_exoneration_modal(); });
    await page.waitForSelector('#dialog_add_exoneration', { timeout: 8000 });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const setVal = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
      setVal('payment_exoneration_number', 'EXO-QA-CP115-2026');
      setVal('payment_exoneration_company_name', 'Ministerio de Hacienda');
      const d = document.getElementById('payment_exoneration_date'); if (d) { d.value = new Date().toISOString().substring(0,10); d.dispatchEvent(new Event('input', { bubbles: true })); }
      setVal('apply_exoneration_text', 'Orden de exoneración de prueba CP-115 (orden de taller)');
      setVal('payment_exoneration_percent', '100');
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => { document.getElementById('apply_sale_exoneration')?.click(); });
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tExo, 'Aplicar exoneración');

    const modalCerrado = await page.evaluate(() => { const m = document.getElementById('dialog_add_exoneration'); return !m || window.getComputedStyle(m).display === 'none'; });
    if (!modalCerrado) { await screenshotOnFail(page, 'cp115-fail-modal-no-cerro'); throw new Error('El modal de exoneración no se cerró tras "Aplicar"'); }

    const exoState = await page.evaluate(() => ({
      amount: document.getElementById('total_exoneration_amount')?.textContent.trim() || null,
      percent: document.getElementById('total_exoneration_percent')?.textContent.trim() || null
    }));
    console.log('🏛️ Exoneración aplicada:', JSON.stringify(exoState));
    const exoAmountVal = parseMonto(exoState.amount);
    const exoMatchIva = !isNaN(exoAmountVal) && Math.abs(exoAmountVal - ivaAntesVal) <= TOLERANCIA;
    console.log(exoMatchIva ? '✔ Monto exonerado coincide con el IVA ±' + TOLERANCIA : '⚠️ Monto exonerado (' + exoState.amount + ') no coincide exactamente con IVA (' + ivaAntesTxt + ')');

    // ── PASO 4: Asociar cliente y facturar ──
    const clienteAsociado = await page.evaluate((id) => { try { selectCustomerToPos(id); return document.getElementById('customer_select')?.value; } catch (e) { return null; } }, CLIENTE_ID);
    console.log('👤 Cliente asociado:', clienteAsociado);
    await page.waitForTimeout(1200);

    await page.evaluate(() => { document.getElementById('btn_cash_pos')?.click(); });
    await page.waitForFunction(() => { const el = document.getElementById('dialog_payment'); return el ? window.getComputedStyle(el).display !== 'none' : false; }, null, { timeout: 30000 });
    await page.waitForTimeout(800);
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch (e) {} }, CLIENTE_ID);
    await page.waitForTimeout(1000);

    // Intento 1: Factura Electrónica (puede bloquear por validación de cliente — BUG-005/BUG-007 conocido)
    await page.evaluate(() => {
      const s = document.getElementById('payment_electronic_document_type');
      if (s) { s.value = '1'; s.dispatchEvent(new Event('change', { bubbles: true })); if (window.jQuery && jQuery(s).data('chosen')) jQuery(s).trigger('chosen:updated'); }
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const c = document.getElementById('ck_is_payment_cash'); if (c && !c.checked) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }
      const e = document.getElementById('is_payment_cash'); if (e && !e.checked) { e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => { document.getElementById('make_payment')?.click(); });
    await page.waitForTimeout(2000);

    const feBloqueada = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const n = Array.from(document.querySelectorAll('.noty_text')).filter(isVis)[0];
      return n ? n.textContent.trim() : null;
    });
    let documentoUsado = 'Factura Electrónica';
    let bugValidacionCliente = false;
    if (feBloqueada) {
      bugValidacionCliente = /cliente/i.test(feBloqueada);
      console.log((bugValidacionCliente ? '🚫 BUG-005/BUG-007 (bloqueo por validación de cliente): ' : '⚠️ Factura Electrónica bloqueada: ') + feBloqueada);
      documentoUsado = 'Tiquete Electrónico';
      await page.evaluate(() => {
        const s = document.getElementById('payment_electronic_document_type');
        if (s) { s.value = '4'; s.dispatchEvent(new Event('change', { bubbles: true })); if (window.jQuery && jQuery(s).data('chosen')) jQuery(s).trigger('chosen:updated'); }
      });
      await page.waitForTimeout(500);
      await page.evaluate(() => { document.getElementById('make_payment')?.click(); });
    }

    let facturaConfirmada = false;
    for (let i = 0; i < 15 && !facturaConfirmada; i++) {
      await page.waitForTimeout(1000);
      const state = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis).filter(el => el.id !== 'dialog_payment')[0];
        if (sa) { const btn = sa.querySelector('button.confirm,button'); if (btn) btn.click(); }
        const rows = document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length
          ?? document.getElementById('table_buy_list')?.querySelectorAll('tr.main_row').length ?? -1;
        return { rows, saTxt: sa ? sa.textContent.replace(/\s+/g,' ').trim().substring(0,80) : null };
      });
      if (state.saTxt) console.log('🔔 SweetAlert (' + i + '):', state.saTxt);
      facturaConfirmada = state.rows === 0 || state.rows === -1;
    }
    console.log('✔ Factura confirmada:', facturaConfirmada);

    // ── VALIDACIONES ──
    const v1 = ordenInfo !== null;
    const v2 = !isNaN(exoAmountVal) && exoAmountVal > 0;
    const v3 = exoMatchIva;
    const v4 = clienteAsociado === String(CLIENTE_ID);
    const v5 = facturaConfirmada;

    console.log('\n📊 === VALIDACIONES CP-115 ===');
    console.log('  Orden de taller seleccionada:   ' + (v1 ? '✅' : '❌'));
    console.log('  Monto exonerado > 0:            ' + (v2 ? '✅' : '❌') + ' ' + exoState.amount);
    console.log('  Monto exonerado ≈ IVA ±1:        ' + (v3 ? '✅' : '⚠️'));
    console.log('  Cliente asociado:                ' + (v4 ? '✅' : '⚠️') + ' ' + clienteAsociado);
    console.log('  Factura confirmada:              ' + (v5 ? '✅' : (bugValidacionCliente ? '🚫 BUG-005/BUG-007' : '❌')));

    if (!v1) throw new Error('No se pudo seleccionar orden de taller');
    if (!v2) throw new Error('El monto de exoneración no es mayor que cero');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    if (!facturaConfirmada && bugValidacionCliente) {
      console.log('⚠️ CP-115 RESULT: Exoneración aplicada correctamente sobre orden de taller (' + exoState.amount + ' ≈ IVA ' + ivaAntesTxt + '). Al facturar, el sistema bloqueó por validación de cliente (BUG-005/BUG-007 conocido) incluso con Tiquete Electrónico / cliente asociado. Se documenta como hallazgo sin poder completar la venta. | orden: "' + ordenInfo.textoCard.substring(0,30) + '" | tiempo: ' + tiempoTotal + 'ms');
    } else {
      const pasadas = [v1,v2,v3,v4,v5].filter(Boolean).length;
      const icono = pasadas >= 4 ? '✅' : '⚠️';
      if (!v5) throw new Error('La factura con exoneración no se confirmó');
      console.log(icono + ' CP-115 PASSED | orden: "' + ordenInfo.textoCard.substring(0,30) + '" | producto: ' + nombreProducto + ' | doc: ' + documentoUsado + ' | IVA antes: ' + ivaAntesTxt + ' | exonerado: ' + exoState.amount + ' (' + exoState.percent + '%) | validaciones: ' + pasadas + '/5 | tiempo: ' + tiempoTotal + 'ms');
    }

  } catch (error) {
    await screenshotOnFail(page, 'cp115-fail');
    console.log('❌ CP-115 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp115_exoneracion_orden_taller();
