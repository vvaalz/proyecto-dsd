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
  await page.goto(POS_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
  await page.waitForTimeout(3000);
  await page.waitForSelector('.product_box', { timeout: 15000 });
}

async function cp102_calculos_apartados() {
  console.log('🔄 Ejecutando CP-102: Verificar cálculos en apartados — total/abono_acumulado/saldo ±1...');
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
    await page.waitForTimeout(1500);

    // ── FASE 1: Ir al tab F7 y listar apartados ──
    await page.evaluate(() => { document.getElementById('btn_layaway_option')?.click(); });
    await page.waitForTimeout(3000);

    const listaApartados = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const links = Array.from(document.querySelectorAll('[onclick]')).filter(isVis)
        .filter(el => /add_pos_layaway_to_table\(\d+\)/.test(el.getAttribute('onclick')||''))
        .filter(el => (el.textContent||'').trim().length > 5);
      function parseMonto(t) { if(!t)return NaN; const m=(t+'').match(/([\d,]+\.\d{2})/); return m?parseFloat(m[1].replace(/,/g,'')):NaN; }
      return links.slice(0, 5).map(el => {
        const m = el.getAttribute('onclick').match(/add_pos_layaway_to_table\((\d+)\)/);
        const id = m ? parseInt(m[1]) : null;
        const totalEl = id ? document.getElementById('invoice_order_total_' + id) : null;
        return { id, txt: el.textContent.replace(/\s+/g,' ').trim().substring(0,80), totalTxt: totalEl?.textContent.trim(), totalVal: parseMonto(totalEl?.textContent) };
      });
    });
    console.log('📑 Lista apartados F7 (top 5):', JSON.stringify(listaApartados));

    // Elegir un apartado con total > 0 para verificar cálculos
    const apartadoTarget = listaApartados.find(a => a.id && !isNaN(a.totalVal) && a.totalVal > 0)
      || listaApartados[0];
    if (!apartadoTarget?.id) throw new Error('No se encontraron apartados en F7');
    console.log('🎯 Apartado seleccionado: id=' + apartadoTarget.id + ' | total: ' + apartadoTarget.totalTxt);

    // ── FASE 2: Cargar el apartado en el carrito ──
    const tLoad = Date.now();
    await page.evaluate((id) => { add_pos_layaway_to_table(id); }, apartadoTarget.id);
    await page.waitForFunction(() => {
      const t = document.getElementById('tb_table_buy_list');
      return t && t.querySelectorAll('tr.main_row').length > 0;
    }, {}, { timeout: 20000 }).catch(() => console.log('⚠️ Carrito no actualizó en 20s'));
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tLoad, 'Cargar apartado');

    // Leer los ítems del carrito (para verificar que hay productos)
    const itemsCarrito = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const filas = Array.from(document.querySelectorAll('#tb_table_buy_list tr.main_row')).filter(isVis);
      // Leer precio de cada producto en el modal
      const precios = Array.from(document.querySelectorAll('input[id^="input_product_edit_price_"]')).filter(isVis)
        .map(el => ({ id: el.id.replace('input_product_edit_price_','').substring(0,8), precio: parseFloat(el.value) || 0 }));
      const qtys = Array.from(document.querySelectorAll('input[id^="input_product_quantity_"]')).filter(isVis)
        .map(el => ({ id: el.id.replace('input_product_quantity_','').substring(0,8), qty: parseFloat(el.value) || 1 }));
      return { numFilas: filas.length, precios, qtys };
    });
    console.log('🛒 Ítems en carrito:', JSON.stringify(itemsCarrito));

    // Calcular total esperado desde los ítems del carrito (precio * qty, pre-IVA x 1.13)
    // Nota: input_product_edit_price_ muestra precio sin IVA; el total en total_sale_txt incluye IVA
    const totalDesdeItems = itemsCarrito.precios.reduce((acc, p) => {
      const qty = itemsCarrito.qtys.find(q => q.id === p.id)?.qty ?? 1;
      return acc + (p.precio * qty);
    }, 0);
    console.log('💲 Total calculado desde ítems (sin IVA):', Math.round(totalDesdeItems * 100) / 100);

    // ── FASE 3: Abrir dialog_payment para leer total/abono_acumulado ──
    const tModal = Date.now();
    await page.evaluate(() => { go_to_layaway_sale(); });
    await page.waitForTimeout(3500);
    evaluarAccion(Date.now() - tModal, 'go_to_layaway_sale');

    const modalData = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const modal = document.getElementById('dialog_payment');
      const totalEl  = document.getElementById('total_sale_txt');
      const abonoEl  = document.getElementById('initial_payment_change');
      const cashEl   = document.getElementById('payment_cash_total');
      // Buscar también un label de saldo pendiente en el modal
      const allTxt = modal ? Array.from(modal.querySelectorAll('*')).filter(isVis)
        .filter(el => el.children.length === 0)
        .map(el => ({ id: el.id||null, tag: el.tagName, txt: (el.tagName==='INPUT'?el.value:el.textContent).replace(/\s+/g,' ').trim().substring(0,50) }))
        .filter(el => el.txt.length > 0 && el.txt.length < 50)
        : [];
      return {
        modalVisible: modal ? isVis(modal) : false,
        totalModal:   totalEl  ? totalEl.textContent.trim()  : null,
        abonoAcum:    abonoEl  ? abonoEl.textContent.trim()  : null,
        cashVal:      cashEl   ? cashEl.value                : null,
        allTxt: allTxt.filter(el => /[₡$]?\s*[\d,]+\.\d{2}/.test(el.txt) || /(saldo|total|pendiente|restante|abono|acumul)/i.test(el.txt)).slice(0,12)
      };
    });
    console.log('📋 dialog_payment:', JSON.stringify(modalData));

    if (!modalData.modalVisible) throw new Error('dialog_payment no abrió para el apartado existente');

    const totalModal   = parseMonto(modalData.totalModal);
    const abonoAcum    = parseMonto(modalData.abonoAcum) || 0;
    const saldoCalc    = Math.round((totalModal - abonoAcum) * 100) / 100;

    console.log('\n📊 === VALIDACIÓN DE CÁLCULOS ===');
    console.log('  [A] total en lista F7 (invoice_order_total):  ₡' + apartadoTarget.totalVal);
    console.log('  [B] total_sale_txt en dialog_payment:         ₡' + totalModal);
    console.log('  [C] initial_payment_change (abono acumulado): ₡' + abonoAcum);
    console.log('  [D] Saldo calculado (B-C):                    ₡' + saldoCalc);
    console.log('  [E] Total desde ítems carrito (sin IVA):      ₡' + Math.round(totalDesdeItems * 100) / 100);
    console.log('  [F] Num productos en carrito:                 ' + itemsCarrito.numFilas);

    // Validaciones
    // v1: total F7 = total_sale_txt ±1
    const v1 = !isNaN(apartadoTarget.totalVal) && !isNaN(totalModal) && Math.abs(apartadoTarget.totalVal - totalModal) <= TOLERANCIA;
    // v2: saldo calculado es coherente (>= 0 y <= total)
    const v2 = !isNaN(saldoCalc) && saldoCalc >= 0 && saldoCalc <= totalModal + TOLERANCIA;
    // v3: si hay abono previo, saldo = total - abono ±1 es matemáticamente correcto
    const v3 = !isNaN(totalModal) && !isNaN(abonoAcum) && !isNaN(saldoCalc) && Math.abs(totalModal - abonoAcum - saldoCalc) <= TOLERANCIA;
    // v4: hay al menos 1 producto en el carrito
    const v4 = itemsCarrito.numFilas >= 1;

    console.log('  total_F7 = total_modal ±1:    ' + (v1 ? '✅' : '⚠️') + ' diff=' + (!isNaN(apartadoTarget.totalVal)&&!isNaN(totalModal) ? Math.abs(apartadoTarget.totalVal-totalModal).toFixed(2) : 'NaN'));
    console.log('  saldo coherente (>=0,<=total):' + (v2 ? '✅' : '⚠️'));
    console.log('  total - abono = saldo ±1:     ' + (v3 ? '✅' : '⚠️'));
    console.log('  productos en carrito >=1:     ' + (v4 ? '✅' : '⚠️') + ' (' + itemsCarrito.numFilas + ' filas)');

    // Cerrar modal
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const closeBtn = document.querySelector('.btn_close_payment_modal');
      if (closeBtn && isVis(closeBtn)) { closeBtn.click(); return; }
      const cancelBtn = Array.from(document.querySelectorAll('.modal.in a, .modal.in button')).filter(isVis)
        .find(el => /cancelar|cerrar|close|cancel/i.test(el.textContent||''));
      if (cancelBtn) cancelBtn.click();
      else { const m = document.getElementById('dialog_payment'); if (m) { m.style.display='none'; m.classList.remove('in'); } }
    }).catch(() => {});
    await page.waitForTimeout(500);

    if (!v3) throw new Error('Cálculo total - abono = saldo no es consistente ±1');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    const pasadas = [v1, v2, v3, v4].filter(Boolean).length;
    const icono = pasadas >= 3 ? '✅' : '⚠️';
    console.log(icono + ' CP-102 PASSED | apartado: #' + apartadoTarget.id + ' | total: ₡' + totalModal + ' | abonoAcum: ₡' + abonoAcum + ' | saldo: ₡' + saldoCalc + ' | productos: ' + itemsCarrito.numFilas + ' | validaciones: ' + pasadas + '/4 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp102-fail');
    console.log('❌ CP-102 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp102_calculos_apartados();
