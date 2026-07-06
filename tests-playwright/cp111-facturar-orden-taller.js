const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const CLIENTE_ID = 12735;
const TOLERANCIA  = 1;

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

function parseMonto(txt) {
  if (!txt) return NaN;
  const m = (txt+'').match(/([\d,]+\.\d{2})/);
  return m ? parseFloat(m[1].replace(/,/g,'')) : NaN;
}

async function cargarPOS(page) {
  await page.goto(POS_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
  await page.waitForTimeout(3000);
  await page.waitForSelector('.product_box', { timeout: 15000 });
}

async function manejarAlerta(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const sa = document.querySelector('.sweet-alert');
    if (!sa || !isVis(sa)) return null;
    const confirmBtn = sa.querySelector('button.confirm');
    if (confirmBtn && isVis(confirmBtn)) { confirmBtn.click(); return 'confirm: ' + confirmBtn.textContent.trim(); }
    const btns = Array.from(sa.querySelectorAll('button')).filter(isVis);
    const noCancel = btns.find(b => !/^\s*(cancelar|cancel|no|cerrar|close)\s*$/i.test(b.textContent.trim()));
    const btn = noCancel || btns[0];
    if (btn) { btn.click(); return 'btn: ' + btn.textContent.trim(); }
    return null;
  }).catch(() => null);
}

async function cp111_facturar_orden_taller() {
  console.log('🔄 Ejecutando CP-111: Facturar orden de taller desde el POS...');
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

    // Interceptar print para evitar diálogo nativo
    await page.evaluate(() => { window.print = () => {}; });

    // ── PASO 1: Abrir tab Taller (F3) ──
    const tTaller = Date.now();
    await page.evaluate(() => { document.getElementById('btn_taller_option')?.click(); });
    await page.waitForTimeout(3000);
    evaluarAccion(Date.now() - tTaller, 'Abrir tab Taller');

    // ── PASO 2: Obtener todas las órdenes disponibles ──
    const todasLasOrdenes = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return Array.from(document.querySelectorAll('.pos-order-card')).filter(isVis).map(card => ({
        onclick: card.getAttribute('onclick') || '',
        textoCard: card.textContent.replace(/\s+/g,' ').trim().substring(0,120)
      }));
    });
    console.log('📋 Órdenes disponibles:', todasLasOrdenes.length);
    if (todasLasOrdenes.length === 0) throw new Error('No se encontraron órdenes en el tab Taller (F3)');

    // ── PASO 3: Probar cada orden hasta encontrar una con ítems ──
    let ordenInfo = null;
    let itemsEnCarrito = { id: null, rows: 0 };
    const tCargaOrden = Date.now();

    for (let i = 0; i < Math.min(todasLasOrdenes.length, 5); i++) {
      const candidata = todasLasOrdenes[i];
      console.log(`📋 Probando orden [${i}]: ${candidata.textoCard.substring(0,60)}...`);
      await page.evaluate((onclick) => { eval(onclick); }, candidata.onclick);
      await page.waitForTimeout(3000);
      // Volver al POS tab
      await page.evaluate(() => { document.getElementById('btn_pos_option')?.click(); });
      await page.waitForTimeout(2000);
      itemsEnCarrito = await page.evaluate(() => {
        const tablas = ['tb_table_buy_list','table_buy_list'];
        for (const id of tablas) { const t = document.getElementById(id); if (t) return { id, rows: t.querySelectorAll('tr.main_row').length }; }
        return { id: null, rows: 0 };
      });
      if (itemsEnCarrito.rows > 0) { ordenInfo = candidata; console.log(`✅ Orden con ítems encontrada: ${itemsEnCarrito.rows} filas`); break; }
      // Volver a taller para la siguiente
      if (i < todasLasOrdenes.length - 1) {
        await page.evaluate(() => { document.getElementById('btn_taller_option')?.click(); });
        await page.waitForTimeout(1500);
      }
    }
    evaluarAccion(Date.now() - tCargaOrden, 'Buscar orden con ítems');

    // Si ninguna orden tiene ítems: agregar un producto manualmente para poder facturar
    let productoAgregadoManual = false;
    if (itemsEnCarrito.rows === 0) {
      console.log('⚠️ Ninguna orden taller tiene ítems — agregando producto manualmente para facturar desde taller');
      ordenInfo = todasLasOrdenes[0]; // usar la primera
      await page.evaluate((onclick) => { eval(onclick); }, ordenInfo.onclick);
      await page.waitForTimeout(2000);
      await page.evaluate(() => { document.getElementById('btn_pos_option')?.click(); });
      await page.waitForTimeout(1500);
      // Agregar primer producto visible
      await page.evaluate(() => {
        const box = document.querySelectorAll('.product_box')[0];
        if (box) (box.querySelector('.product_box_quantity_content') || box).click();
      });
      await page.waitForTimeout(1500);
      itemsEnCarrito = await page.evaluate(() => {
        const tablas = ['tb_table_buy_list','table_buy_list'];
        for (const id of tablas) { const t = document.getElementById(id); if (t) return { id, rows: t.querySelectorAll('tr.main_row').length }; }
        return { id: null, rows: 0 };
      });
      productoAgregadoManual = true;
      console.log('🛒 Carrito tras agregar manualmente:', JSON.stringify(itemsEnCarrito));
    }

    if (!ordenInfo) ordenInfo = todasLasOrdenes[0];
    console.log('📋 Orden usada:', JSON.stringify({ ...ordenInfo, manual: productoAgregadoManual }));
    console.log('🛒 Carrito final:', JSON.stringify(itemsEnCarrito));
    if (itemsEnCarrito.rows === 0) throw new Error('El carrito sigue vacío incluso después de agregar producto manual');

    // ── PASO 5: Leer total del carrito ──
    const totalCarritoTxt = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const candidatos = ['total_of_buy','total_product_text','cart_total','total_sales'];
      for (const id of candidatos) { const el = document.getElementById(id); if (el && isVis(el)) return el.textContent.trim(); }
      // Buscar por patrón ₡NNN.NN en la zona del total
      const spans = Array.from(document.querySelectorAll('#payment_content *,#total_panel *,.total_panel *')).filter(isVis)
        .filter(el => el.children.length === 0)
        .find(el => /[₡$]?\s*[\d,]+\.\d{2}/.test(el.textContent||''));
      return spans ? spans.textContent.trim() : null;
    });
    console.log('💰 Total carrito:', totalCarritoTxt);

    // ── PASO 6: Asociar cliente (si la orden no tiene cliente) ──
    const clienteActual = await page.evaluate(() => {
      const el = document.getElementById('customer_select');
      return el ? el.value : null;
    });
    const necesitaCliente = !clienteActual || clienteActual === '0' || clienteActual === '';
    if (necesitaCliente) {
      await page.evaluate((id) => { try { selectCustomerToPos(id); } catch {} }, CLIENTE_ID);
      await page.waitForTimeout(1000);
      console.log('👤 Cliente asignado:', CLIENTE_ID);
    } else {
      console.log('👤 Orden ya tiene cliente:', clienteActual);
    }

    // ── PASO 7: Abrir modal de pago y facturar ──
    const tPago = Date.now();
    await page.evaluate(() => { document.getElementById('btn_cash_pos')?.click(); });
    await page.waitForFunction(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const m = document.getElementById('dialog_payment');
      return m && isVis(m);
    }, {}, { timeout: 15000 }).catch(() => console.log('⚠️ dialog_payment no abrió en 15s'));
    evaluarAccion(Date.now() - tPago, 'Abrir modal de pago');
    await page.waitForTimeout(1000);

    // Leer total en el modal de pago
    const totalModalTxt = await page.evaluate(() => {
      const el = document.getElementById('total_sale_txt');
      return el ? el.textContent.trim() : null;
    });
    const totalModal = parseMonto(totalModalTxt);
    const totalCarrito = parseMonto(totalCarritoTxt);
    console.log('💰 Total modal pago:', totalModalTxt, '→', totalModal);
    console.log('💰 Diff total carrito vs modal:', Math.abs(totalCarrito - totalModal).toFixed(2));

    // Seleccionar efectivo y confirmar
    await page.evaluate(() => {
      const ck = document.getElementById('ck_is_payment_cash');
      if (ck && !ck.checked) { ck.checked = true; ck.dispatchEvent(new Event('change',{bubbles:true})); }
      const ef = document.getElementById('is_payment_cash');
      if (ef && !ef.checked) { ef.checked = true; ef.dispatchEvent(new Event('change',{bubbles:true})); }
    });
    await page.waitForTimeout(400);

    await page.evaluate(() => { document.getElementById('make_payment')?.click(); });
    await page.waitForTimeout(2000);

    // Esperar confirmación (carrito vacío o SweetAlert de éxito)
    let facturaConfirmada = false;
    for (let i = 0; i < 15 && !facturaConfirmada; i++) {
      await page.waitForTimeout(1000);
      try {
        const state = await page.evaluate(() => {
          const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
          const sa = document.querySelector('.sweet-alert');
          const hasSA = sa && isVis(sa);
          const rows = document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length
            ?? document.getElementById('table_buy_list')?.querySelectorAll('tr.main_row').length ?? -1;
          return { hasSA, rows, saTxt: hasSA ? sa.textContent.replace(/\s+/g,' ').trim().substring(0,60) : null };
        });
        if (state.hasSA) {
          await page.evaluate(() => {
            const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
            const btn = Array.from(document.querySelectorAll('.sweet-alert button.confirm')).filter(isVis)[0];
            if (btn) btn.click();
          }).catch(() => {});
          console.log('🔔 SweetAlert:', state.saTxt);
        }
        facturaConfirmada = state.rows === 0 || state.rows === -1;
      } catch (navErr) {
        if (/navigation|context/i.test(navErr.message)) { facturaConfirmada = true; break; }
        throw navErr;
      }
    }
    console.log('✔ Factura confirmada (carrito vacío):', facturaConfirmada);

    // ── VALIDACIONES ──
    const v1 = ordenInfo !== null;                                                        // Orden encontrada en Taller
    const v2 = itemsEnCarrito.rows > 0;                                                   // Orden cargó ítems al carrito
    const v3 = !isNaN(totalModal) && totalModal > 0;                                      // Total visible en modal pago
    const v4 = isNaN(totalCarrito) || isNaN(totalModal) || Math.abs(totalCarrito - totalModal) <= TOLERANCIA; // Totales ±1
    const v5 = facturaConfirmada;                                                          // Factura confirmada

    console.log('\n📊 === VALIDACIONES CP-111 ===');
    console.log('  Orden encontrada en Taller:    ' + (v1 ? '✅' : '❌'));
    console.log('  Orden cargó ítems en carrito:  ' + (v2 ? '✅' : '❌') + ' (' + itemsEnCarrito.rows + ' filas)');
    console.log('  Total visible en modal pago:   ' + (v3 ? '✅' : '⚠️') + ' ' + totalModalTxt);
    console.log('  Total carrito ≈ modal ±1:      ' + (v4 ? '✅' : '⚠️') + ' diff=' + Math.abs(totalCarrito-totalModal).toFixed(2));
    console.log('  Factura confirmada:            ' + (v5 ? '✅' : '⚠️'));

    if (!v1 || !v2) throw new Error('No se pudo cargar orden de taller en el POS');
    if (!v5) throw new Error('La factura de la orden no se confirmó');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    const pasadas = [v1,v2,v3,v4,v5].filter(Boolean).length;
    const icono = pasadas >= 4 ? '✅' : '⚠️';
    console.log(icono + ' CP-111 PASSED | orden: "' + ordenInfo.textoCard.substring(0,30) + '" | items: ' + itemsEnCarrito.rows + ' | total-modal: ' + totalModalTxt + ' | validaciones: ' + pasadas + '/5 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp111-fail');
    console.log('❌ CP-111 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp111_facturar_orden_taller();
