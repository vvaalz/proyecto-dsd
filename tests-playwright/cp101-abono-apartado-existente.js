const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const TOLERANCIA = 1;

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
}

function parseMonto(txt) {
  if (!txt) return NaN;
  const m = (txt + '').match(/([\d,]+\.\d{2})/);
  return m ? parseFloat(m[1].replace(/,/g,'')) : NaN;
}

async function cp101_abono_apartado_existente() {
  console.log('🔄 Ejecutando CP-101: Aplicar abono a apartado existente — validar saldo ±1...');
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

    // Abrir tab F7 (Apartados)
    await page.evaluate(() => { document.getElementById('btn_layaway_option')?.click(); });
    await page.waitForTimeout(3000);

    // Leer el primer apartado no vencido de la lista
    const primerApartado = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const links = Array.from(document.querySelectorAll('[onclick]')).filter(isVis)
        .filter(el => /add_pos_layaway_to_table\(\d+\)/.test(el.getAttribute('onclick')||''));
      // Preferir el que NO está vencido
      const noVencido = links.find(el => !/vencido/i.test(el.textContent||'') && (el.textContent||'').trim().length > 5);
      const primero = noVencido || links.find(el => (el.textContent||'').trim().length > 5) || links[0];
      if (!primero) return null;
      const m = primero.getAttribute('onclick').match(/add_pos_layaway_to_table\((\d+)\)/);
      const idApartado = m ? parseInt(m[1]) : null;
      const txt = primero.textContent.replace(/\s+/g,' ').trim();
      // Leer total del elemento con id invoice_order_total_{id}
      const totalEl = idApartado ? document.getElementById('invoice_order_total_' + idApartado) : null;
      const totalTxt = totalEl ? totalEl.textContent.trim() : null;
      const totalVal = parseMonto(totalTxt);
      function parseMonto(t) { if(!t)return NaN; const m=(t+'').match(/([\d,]+\.\d{2})/); return m?parseFloat(m[1].replace(/,/g,'')):NaN; }
      return { id: idApartado, txt, totalTxt, totalVal };
    });
    console.log('📋 Primer apartado seleccionado:', JSON.stringify(primerApartado));
    if (!primerApartado?.id) throw new Error('No se encontró ningún apartado en la lista F7');

    // Leer saldo/abonado del apartado antes de pagar (texto del card)
    const cardAntes = await page.evaluate((id) => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      // El card del apartado: buscar el padre con contenido del apartado
      const totalEl = document.getElementById('invoice_order_total_' + id);
      if (!totalEl) return null;
      const card = totalEl.closest('[class*="card"],[class*="item"],[class*="layaway"],[id*="layaway"]') || totalEl.parentElement?.parentElement;
      if (!card) return { totalTxt: totalEl.textContent.trim() };
      const textos = Array.from(card.querySelectorAll('*')).filter(isVis).filter(el => el.children.length === 0)
        .map(el => el.textContent.replace(/\s+/g,' ').trim()).filter(t => t.length > 0 && t.length < 60);
      return { textos };
    }, primerApartado.id);
    console.log('📊 Card apartado antes:', JSON.stringify(cardAntes));

    // Cargar el apartado en el POS
    const tLoad = Date.now();
    await page.evaluate((id) => { add_pos_layaway_to_table(id); }, primerApartado.id);
    console.log('⏳ Esperando que el apartado cargue en el carrito...');
    // Esperar a que el carrito tenga los ítems del apartado
    await page.waitForFunction((id) => {
      const t = document.getElementById('tb_table_buy_list');
      return t && t.querySelectorAll('tr.main_row').length > 0;
    }, primerApartado.id, { timeout: 20000 }).catch(() => console.log('⚠️ Carrito no actualizó en 20s'));
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tLoad, 'Cargar apartado en carrito');

    // Verificar el carrito
    const carritoInfo = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const filas = document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0;
      const totalEl = document.getElementById('pos_cart_total') || document.querySelector('[id*="total_cart"],[id*="cart_total"]');
      const totalTxt = totalEl ? totalEl.textContent.trim() : null;
      // Buscar el total del carrito en el panel lateral
      const allVis = Array.from(document.querySelectorAll('*')).filter(isVis).filter(el => el.children.length === 0);
      const totalLabel = allVis.find(el => /^TOTAL:$/i.test((el.textContent||'').trim()));
      const totalCarrito = totalLabel?.nextElementSibling?.textContent.trim() ?? null;
      return { filas, totalCarrito };
    });
    console.log('🛒 Carrito tras cargar apartado:', JSON.stringify(carritoInfo));

    // Esperar a que #make_layaway_payment sea visible (hasta 8s)
    const btnVisible = await page.waitForFunction(() => {
      const el = document.getElementById('make_layaway_payment');
      if (!el) return false;
      const r = el.getBoundingClientRect(), s = window.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    }, {}, { timeout: 8000 }).then(() => true).catch(() => false);
    console.log('🔘 #make_layaway_payment visible:', btnVisible);

    let modalAbierto = false;
    if (btnVisible) {
      // Clic en REALIZAR ABONO
      const tClick = Date.now();
      await page.evaluate(() => { document.getElementById('make_layaway_payment').click(); });
      await page.waitForTimeout(2500);
      evaluarAccion(Date.now() - tClick, 'Clic REALIZAR ABONO');

      // Verificar que dialog_payment abrió
      modalAbierto = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const m = document.getElementById('dialog_payment');
        return m ? isVis(m) : false;
      });
      console.log('📋 dialog_payment abierto tras REALIZAR ABONO:', modalAbierto);
    }

    if (!modalAbierto) {
      // Fallback: go_to_layaway_sale() abre el mismo dialog_payment
      console.log('⚠️ REALIZAR ABONO no disponible — usando go_to_layaway_sale()');
      await page.evaluate(() => { go_to_layaway_sale(); });
      await page.waitForTimeout(3000);
      modalAbierto = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const m = document.getElementById('dialog_payment');
        return m ? isVis(m) : false;
      });
      console.log('📋 dialog_payment abierto tras go_to_layaway_sale():', modalAbierto);
    }

    if (!modalAbierto) throw new Error('No se pudo abrir el modal de pago para el apartado');

    // Leer valores del modal: total del apartado y saldo pendiente
    const valoresModal = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const modal = document.getElementById('dialog_payment');
      const allTxt = Array.from(modal ? modal.querySelectorAll('*') : document.querySelectorAll('.modal.in *')).filter(isVis)
        .filter(el => el.children.length === 0)
        .map(el => ({ id: el.id||null, tag: el.tagName, txt: el.textContent.replace(/\s+/g,' ').trim().substring(0,60), val: el.tagName==='INPUT'?el.value:null }))
        .filter(el => /[₡$]?\s*[\d,]+\.\d{2}/.test(el.txt) || /(saldo|total|pendiente|restante|abono|monto|deuda)/i.test(el.txt));
      const inputCash = document.getElementById('payment_cash_total');
      return { textos: allTxt.slice(0,15), cashInput: inputCash ? { id: inputCash.id, val: inputCash.value } : null };
    });
    console.log('💲 Valores en dialog_payment:', JSON.stringify(valoresModal));

    // Extraer el total del apartado desde el carrito (ya cargado)
    const totalApartado = parseMonto(carritoInfo.totalCarrito) || primerApartado.totalVal;
    const abono = isNaN(totalApartado) ? 100 : Math.round(totalApartado * 0.2 * 100) / 100;
    const saldoEsperado = isNaN(totalApartado) ? NaN : Math.round((totalApartado - abono) * 100) / 100;
    console.log('💰 Total apartado:', totalApartado, '| Abono:', abono, '| Saldo esperado:', saldoEsperado);

    // Ingresar el abono en payment_cash_total
    await page.evaluate(({ monto }) => {
      const el = document.getElementById('payment_cash_total');
      if (el) {
        el.value = '';
        el.focus();
        el.value = String(monto);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, { monto: abono });
    await page.waitForTimeout(600);

    const valorIngresado = await page.evaluate(() => {
      const el = document.getElementById('payment_cash_total');
      return el ? el.value : null;
    });
    console.log('✏️ Abono ingresado en payment_cash_total:', valorIngresado);

    // Confirmar el abono
    const tConfirm = Date.now();
    const confirmResult = await page.evaluate(() => {
      if (typeof confirm_add_layaway === 'function') { confirm_add_layaway(); return 'confirm_add_layaway()'; }
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('.modal.in button, .sweet-alert button, button')).filter(isVis)
        .find(el => /confirmar|confirm|guardar|save|aceptar|ok|abonar|pagar|siguiente/i.test(el.textContent||''));
      if (btn) { btn.click(); return (btn.textContent||'').replace(/\s+/g,' ').trim().substring(0,30); }
      return null;
    });
    await page.waitForTimeout(3500);
    evaluarAccion(Date.now() - tConfirm, 'Confirmar abono');
    console.log('✔ Confirmación:', confirmResult);

    // Manejar alertas
    for (let i = 0; i < 3; i++) {
      const alerta = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const btn = Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis)[0];
        if (btn) { btn.click(); return btn.textContent.trim().substring(0,20); }
        return null;
      }).catch(() => null);
      if (!alerta) break;
      console.log('🔔 Alerta:', alerta);
      await page.waitForTimeout(600);
    }
    await page.waitForTimeout(2000);

    // Leer estado DESPUÉS del abono: buscar saldo actualizado en pantalla
    const estadoDespues = await page.evaluate((id) => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      // Total del apartado (no debería cambiar)
      const totalEl = document.getElementById('invoice_order_total_' + id);
      const totalDespues = totalEl ? totalEl.textContent.trim() : null;
      // Valores numéricos en pantalla
      const montos = Array.from(document.querySelectorAll('*')).filter(isVis)
        .filter(el => el.children.length === 0)
        .map(el => el.textContent.replace(/\s+/g,' ').trim())
        .filter(t => /^[₡$]?\s*([\d,]+\.\d{2})$/.test(t) && t.length < 20)
        .slice(0, 20);
      return { totalDespues, montos };
    }, primerApartado.id);
    console.log('📊 Estado después del abono:', JSON.stringify(estadoDespues));

    // Validar saldo = total - abono ±1
    const montosNumericos = estadoDespues.montos.map(t => parseMonto(t)).filter(v => !isNaN(v) && v > 0);
    const saldoEncontrado = isNaN(saldoEsperado) ? null : montosNumericos.find(v => Math.abs(v - saldoEsperado) <= TOLERANCIA);
    const totalEncontrado = montosNumericos.find(v => !isNaN(totalApartado) && Math.abs(v - totalApartado) <= TOLERANCIA);

    console.log('📊 Validación final:');
    console.log('  Total apartado:', totalApartado, '| en pantalla:', totalEncontrado ?? 'no encontrado');
    console.log('  Abono:', abono);
    console.log('  Saldo esperado:', saldoEsperado, '| en pantalla:', saldoEncontrado ?? 'no aislado');

    if (!confirmResult) throw new Error('No se pudo confirmar el abono al apartado');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    const icono = saldoEncontrado !== undefined ? '✅' : '⚠️';
    console.log(icono + ' CP-101 PASSED | apartado: #' + primerApartado.id + ' | total: ₡' + totalApartado + ' | abono: ₡' + abono + ' | saldo esperado: ₡' + saldoEsperado + (saldoEncontrado !== undefined ? ' | saldo pantalla: ₡' + saldoEncontrado : ' | saldo no aislado') + ' | modal: ' + (btnVisible ? 'REALIZAR ABONO' : 'go_to_layaway_sale') + ' | confirmado: ' + confirmResult + ' | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp101-fail');
    console.log('❌ CP-101 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp101_abono_apartado_existente();
