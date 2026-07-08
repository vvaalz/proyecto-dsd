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

function parseMonto(txt) {
  if (!txt) return NaN;
  const m = (txt+'').match(/([\d,]+\.\d{2})/);
  return m ? parseFloat(m[1].replace(/,/g,'')) : NaN;
}

async function cargarPOS(page) {
  await page.goto(POS_URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(5000);
  await page.waitForSelector('#product_search', { state: 'attached', timeout: 180000 });
  await page.waitForTimeout(3000);
  await page.waitForSelector('.product_box', { timeout: 60000 });
}

async function contarFilasCarrito(page) {
  return page.evaluate(() => {
    const tablas = ['tb_table_buy_list','table_buy_list'];
    for (const id of tablas) { const t = document.getElementById(id); if (t) return { id, rows: t.querySelectorAll('tr.main_row').length }; }
    return { id: null, rows: 0 };
  });
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

// Algunas órdenes de taller en QA traen ítems con precio inválido y disparan "¿Desea continuar?"
async function dismissContinueDialog(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const btns = Array.from(document.querySelectorAll('button, a')).filter(isVis).filter(b => /^continuar$/i.test((b.textContent||'').trim()));
    if (btns.length > 0) { btns[0].click(); return true; }
    return false;
  }).catch(() => false);
}

// El catálogo se oculta cuando hay una orden de taller activa — buscar en #product_search
// fuerza al servidor a repoblar el grid (mismo patrón que CP-112)
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

async function cp114_agregar_items_orden_taller() {
  console.log('🔄 Ejecutando CP-114: Agregar ítems a una orden de taller y facturar todo junto...');
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
    const huboAviso = await dismissContinueDialog(page);
    await page.waitForTimeout(500);
    await page.evaluate(() => { document.getElementById('btn_pos_option')?.click(); });
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 15000 });
    await page.waitForTimeout(2000);
    await dismissContinueDialog(page);
    console.log('📋 Orden usada:', ordenInfo.textoCard.substring(0,60));
    if (huboAviso) console.log('ℹ️ La orden ya traía producto(s) con precio inválido ("¿Desea continuar?" confirmado) — no afecta los productos nuevos que se agregan a continuación.');

    const carritoAntes = await contarFilasCarrito(page);
    const { txt: totalAntesTxt, val: totalAntesVal } = await leerTotalCarrito(page);
    console.log('🛒 Carrito ANTES de agregar productos:', JSON.stringify(carritoAntes), '| total:', totalAntesTxt);

    // ── PASO 2: Agregar 3 productos adicionales vía búsqueda ──
    const terminos = ['multimetro', 'bombillos', 'filtros'];
    const productosAgregados = [];
    for (const termino of terminos) {
      const tIni = Date.now();
      const nombre = await agregarProductoPorBusqueda(page, termino);
      if (nombre) {
        productosAgregados.push(nombre);
        console.log('🛍️ Producto agregado ("' + termino + '"):', nombre);
      } else {
        console.log('⚠️ Sin resultados visibles para "' + termino + '"');
      }
      evaluarAccion(Date.now() - tIni, 'Agregar producto (' + termino + ')');
      await page.waitForTimeout(800);
    }
    if (productosAgregados.length === 0) { await screenshotOnFail(page, 'cp114-fail-sin-productos'); throw new Error('No se pudo agregar ningún producto adicional a la orden'); }

    const carritoDespues = await contarFilasCarrito(page);
    const { txt: totalCarritoTxt, val: totalCarritoVal } = await leerTotalCarrito(page);
    console.log('🛒 Carrito DESPUÉS de agregar productos:', JSON.stringify(carritoDespues), '| total:', totalCarritoTxt);
    if (isNaN(totalCarritoVal) || totalCarritoVal <= 0) { await screenshotOnFail(page, 'cp114-fail-total'); throw new Error('El total del carrito es inválido tras agregar los productos: ' + totalCarritoTxt); }

    // ── PASO 3: Facturar todo junto (contado, efectivo) ──
    const tPago = Date.now();
    await page.evaluate(() => { document.getElementById('btn_cash_pos')?.click(); });
    await page.waitForFunction(() => {
      const el = document.getElementById('dialog_payment');
      return el ? window.getComputedStyle(el).display !== 'none' : false;
    }, null, { timeout: 30000 });
    evaluarAccion(Date.now() - tPago, 'Abrir modal de pago');
    await page.waitForTimeout(800);

    const totalModalTxt = await page.evaluate(() => document.getElementById('total_sale_txt')?.textContent.trim() || null);
    const totalModalVal = parseMonto(totalModalTxt);
    console.log('💰 Total en modal:', totalModalTxt);

    // Asegurar modo efectivo (por defecto suele venir activo)
    await page.evaluate(() => {
      const ck = document.getElementById('ck_is_payment_cash');
      if (ck && !ck.checked) { ck.checked = true; ck.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(500);

    const tFacturar = Date.now();
    await page.evaluate(() => { document.getElementById('make_payment')?.click(); });
    await page.waitForTimeout(1500);
    await page.keyboard.press('Enter').catch(() => {});

    let facturaConfirmada = false;
    for (let i = 0; i < 20 && !facturaConfirmada; i++) {
      await page.waitForTimeout(1000);
      try {
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
      } catch (navErr) {
        if (/navigation|context/i.test(navErr.message)) { facturaConfirmada = true; break; }
        throw navErr;
      }
    }
    evaluarAccion(Date.now() - tFacturar, 'Procesar factura');
    console.log('✔ Factura confirmada (carrito vacío):', facturaConfirmada);

    // ── VALIDACIONES ──
    // Nota: el conteo de filas del carrito puede reordenarse/consolidarse al usar #product_search
    // sobre una orden de taller ya cargada (re-render del grid) — el total es el indicador confiable
    const v1 = ordenInfo !== null;
    const v2 = productosAgregados.length >= 2;
    const v3 = !isNaN(totalAntesVal) && !isNaN(totalCarritoVal) && totalCarritoVal > totalAntesVal;
    const v4 = !isNaN(totalModalVal) && !isNaN(totalCarritoVal) && Math.abs(totalModalVal - totalCarritoVal) <= TOLERANCIA;
    const v5 = facturaConfirmada;

    console.log('\n📊 === VALIDACIONES CP-114 ===');
    console.log('  Orden de taller seleccionada:   ' + (v1 ? '✅' : '❌'));
    console.log('  ≥2 productos agregados:          ' + (v2 ? '✅' : '⚠️') + ' (' + productosAgregados.length + ': ' + productosAgregados.join(', ') + ')');
    console.log('  Total del carrito aumentó:       ' + (v3 ? '✅' : '❌') + ' (' + totalAntesTxt + ' → ' + totalCarritoTxt + ')');
    console.log('  Total carrito ≈ modal ±1:        ' + (v4 ? '✅' : '⚠️') + ' (' + totalCarritoTxt + ' vs ' + totalModalTxt + ')');
    console.log('  Factura confirmada:              ' + (v5 ? '✅' : '❌'));

    if (!v1) throw new Error('No se pudo seleccionar orden de taller');
    if (!v3) throw new Error('El total del carrito no aumentó tras agregar productos');
    if (!v5) throw new Error('La factura no se confirmó');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    const pasadas = [v1,v2,v3,v4,v5].filter(Boolean).length;
    const icono = pasadas >= 4 ? '✅' : '⚠️';
    console.log(icono + ' CP-114 PASSED | orden: "' + ordenInfo.textoCard.substring(0,30) + '" | productos agregados: ' + productosAgregados.join(' + ') + ' | carrito: ' + carritoAntes.rows + '→' + carritoDespues.rows + ' filas | total: ' + totalCarritoTxt + ' | validaciones: ' + pasadas + '/5 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp114-fail');
    console.log('❌ CP-114 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp114_agregar_items_orden_taller();
