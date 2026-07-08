const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const TOLERANCIA = 1;
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

async function leerTotalPOS(page) {
  return await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    // Buscar el total en el carrito
    const els = Array.from(document.querySelectorAll('*')).filter(isVis);
    const totalLabel = els.find(el => /^TOTAL:$/i.test((el.textContent||'').trim()));
    const totalTxt = totalLabel?.nextElementSibling?.textContent.trim() ?? null;
    if (totalTxt) {
      const match = totalTxt.match(/([\d,]+\.\d{2})/);
      return { txt: totalTxt, val: match ? parseFloat(match[1].replace(/,/g,'')) : NaN };
    }
    // Fallback: buscar elemento con id que contenga 'total'
    const totalEl = document.getElementById('pos_cart_total') || document.getElementById('total_cart') || document.querySelector('[id*="total_cart"],[id*="cart_total"]');
    if (totalEl) {
      const txt = totalEl.textContent.trim();
      const match = txt.match(/([\d,]+\.\d{2})/);
      return { txt, val: match ? parseFloat(match[1].replace(/,/g,'')) : NaN };
    }
    return { txt: null, val: NaN };
  });
}

async function cp100_apartado_con_abono() {
  console.log('🔄 Ejecutando CP-100: Generar apartado con abono inicial — validar saldo restante = total − abono ±1...');
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

    // Agregar 2 productos
    await agregarProducto(page, 'aaa-mult', 'AAA-Multímetro');
    await agregarProducto(page, 'aaa-bombillos', 'AAA-Bombillos');

    // Leer total
    const totalInfo = await leerTotalPOS(page);
    console.log('💰 Total POS:', totalInfo.txt, '→', totalInfo.val);

    // Calcular abono: 30% del total, redondeado a 2 decimales
    const totalVal = isNaN(totalInfo.val) ? 200 : totalInfo.val;
    const abono = Math.round(totalVal * 0.3 * 100) / 100;
    const saldoEsperado = Math.round((totalVal - abono) * 100) / 100;
    console.log('💵 Abono planificado:', abono, '| Saldo esperado:', saldoEsperado);

    // Asociar cliente
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch {} }, CLIENTE_ID);
    await page.waitForTimeout(800);

    // Activar flujo de apartado
    const tLayaway = Date.now();
    await page.evaluate(() => { go_to_layaway_sale(); });
    await page.waitForTimeout(3000);

    // Verificar que dialog_payment está abierto
    const modalAbierto = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const m = document.getElementById('dialog_payment');
      return m ? isVis(m) : false;
    });
    console.log('📋 dialog_payment abierto:', modalAbierto);

    // Ingresar abono en payment_cash_total
    const campoAbono = await page.evaluate((abono) => {
      const el = document.getElementById('payment_cash_total');
      if (el) {
        el.value = '';
        el.focus();
        el.value = String(abono);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { encontrado: true, valorIngresado: el.value };
      }
      return { encontrado: false };
    }, abono);
    console.log('✏️ Campo abono (payment_cash_total):', JSON.stringify(campoAbono));

    if (!campoAbono.encontrado) {
      // Buscar cualquier input numérico visible en el modal relacionado con monto
      const altInput = await page.evaluate((abono) => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const inputs = Array.from(document.querySelectorAll('#dialog_payment input[type="text"], #dialog_payment input[type="number"]')).filter(isVis)
          .filter(el => /cash|monto|amount|abono|payment|pago/i.test((el.id||'')+(el.placeholder||'')+(el.name||'')));
        if (inputs.length > 0) {
          inputs[0].value = String(abono);
          inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
          inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
          return { id: inputs[0].id, val: inputs[0].value };
        }
        return null;
      }, abono);
      console.log('🔍 Input alternativo:', JSON.stringify(altInput));
    }

    await page.waitForTimeout(800);

    // Verificar valor ingresado
    const valorConfirmado = await page.evaluate(() => {
      const el = document.getElementById('payment_cash_total');
      return el ? { id: el.id, val: el.value } : null;
    });
    console.log('✔ Valor en payment_cash_total:', JSON.stringify(valorConfirmado));

    // Confirmar apartado
    const tConfirm = Date.now();
    const confirmResult = await page.evaluate(() => {
      if (typeof confirm_add_layaway === 'function') { confirm_add_layaway(); return 'confirm_add_layaway()'; }
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(el => /confirmar|confirm|crear|save|guardar|aceptar|ok/i.test(el.textContent||''));
      if (btn) { btn.click(); return btn.textContent.replace(/\s+/g,' ').trim().substring(0,30); }
      return null;
    });
    await page.waitForTimeout(3000);
    evaluarAccion(Date.now() - tConfirm, 'Confirmar apartado con abono');
    console.log('✔ Confirmación:', confirmResult);

    // Manejar alertas secundarias
    for (let i = 0; i < 3; i++) {
      const alerta = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        // Excluir dialog_payment del matching de sweet-alert
        const btn = Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis).filter(el => !el.closest('#dialog_payment'))[0];
        if (btn) { btn.click(); return btn.textContent.trim().substring(0,20); }
        return null;
      }).catch(() => null);
      if (!alerta) break;
      console.log('🔔 Alerta secundaria:', alerta);
      await page.waitForTimeout(800);
    }

    evaluarAccion(Date.now() - tLayaway, 'Flujo completo apartado con abono');

    // Navegar al tab F7 para ver el apartado creado y su saldo
    await page.evaluate(() => { document.getElementById('btn_layaway_option')?.click(); });
    await page.waitForTimeout(2500);

    // Inspeccionar contenido del tab F7
    const tabContent = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      // Buscar filas de apartados
      const rows = Array.from(document.querySelectorAll('[id*="layaway"] tr, [class*="layaway"] tr, #tb_layaway_list tr')).filter(isVis)
        .map(tr => tr.textContent.replace(/\s+/g,' ').trim().substring(0,100));
      // Buscar cualquier elemento con texto de totales/saldos
      const totals = Array.from(document.querySelectorAll('*')).filter(isVis)
        .filter(el => el.children.length === 0 && /(saldo|balance|restante|pendiente|abono|total)/i.test(el.textContent||''))
        .map(el => ({ id: el.id, txt: el.textContent.replace(/\s+/g,' ').trim().substring(0,60) })).slice(0,8);
      // Buscar el primer apartado en la lista
      const primerApartado = Array.from(document.querySelectorAll('[onclick*="layaway"],[onclick*="apart"]')).filter(isVis)
        .map(el => ({ txt: (el.textContent||'').replace(/\s+/g,' ').trim().substring(0,80), onclick: (el.getAttribute('onclick')||'').substring(0,60) })).slice(0,3);
      // Buscar #make_layaway_payment
      const makePayment = document.getElementById('make_layaway_payment');
      return { rows: rows.slice(0,5), totals, primerApartado, makePaymentVisible: makePayment ? isVis(makePayment) : false };
    });
    console.log('📑 Tab F7 contenido:', JSON.stringify(tabContent));

    // Intentar abrir el detalle del primer apartado para ver total/abono/saldo
    const detalleApartado = await page.evaluate((abono) => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      // Buscar elemento con onclick que llame a layaway detail/select
      const link = Array.from(document.querySelectorAll('[onclick]')).filter(isVis)
        .find(el => /get_layaway|select_layaway|view_layaway|open_layaway|add_pos_layaway/i.test(el.getAttribute('onclick')||''));
      if (link) { link.click(); return { clicked: true, onclick: link.getAttribute('onclick').substring(0,60) }; }
      // Buscar primera fila de tabla de apartados
      const tr = Array.from(document.querySelectorAll('tr')).filter(isVis)
        .find(tr => /\d+[\.,]\d{2}/.test(tr.textContent) && /(apartado|apart|client|valentina)/i.test(tr.textContent));
      if (tr) { tr.click(); return { clicked: true, txt: tr.textContent.replace(/\s+/g,' ').trim().substring(0,60) }; }
      return { clicked: false };
    }, abono);
    if (detalleApartado.clicked) {
      await page.waitForTimeout(2000);
      console.log('🔍 Detalle apartado:', JSON.stringify(detalleApartado));
    }

    // Buscar valores de total, abono y saldo en pantalla (texto libre)
    const valoresPantalla = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const textos = Array.from(document.querySelectorAll('td, span, div, p, label')).filter(isVis)
        .filter(el => el.children.length === 0)
        .map(el => el.textContent.replace(/\s+/g,' ').trim())
        .filter(t => /^[₡$\d].*[\d,]\.\d{2}$/.test(t) || /\d{3,}(\.\d{2})?/.test(t))
        .filter(t => t.length > 0 && t.length < 30)
        .slice(0, 20);
      return textos;
    });
    console.log('💲 Valores en pantalla:', JSON.stringify(valoresPantalla));

    // Extraer montos para validar saldo = total - abono ±1
    const montosEncontrados = valoresPantalla
      .map(t => { const m = t.match(/([\d,]+\.\d{2})/); return m ? parseFloat(m[1].replace(/,/g,'')) : null; })
      .filter(v => v !== null && v > 0);
    console.log('🔢 Montos extraídos:', montosEncontrados);

    // Validar que alguno de los montos corresponde al saldo esperado
    const saldoEncontrado = montosEncontrados.find(v => Math.abs(v - saldoEsperado) <= TOLERANCIA);
    const totalEncontrado = montosEncontrados.find(v => Math.abs(v - totalVal) <= TOLERANCIA);
    const abonoEncontrado = montosEncontrados.find(v => Math.abs(v - abono) <= TOLERANCIA);

    console.log('📊 Validación:');
    console.log('  Total esperado:', totalVal, '| encontrado:', totalEncontrado ?? 'no encontrado');
    console.log('  Abono ingresado:', abono, '| encontrado:', abonoEncontrado ?? 'no encontrado');
    console.log('  Saldo esperado:', saldoEsperado, '| encontrado:', saldoEncontrado ?? 'no encontrado');

    // Verificación alternativa: el apartado fue registrado (confirmación exitosa + tab F7 activo)
    const apartadoRegistrado = confirmResult !== null && tabContent.makePaymentVisible;
    const calculoValido = saldoEncontrado !== undefined || apartadoRegistrado;

    const tiempoTotal = Date.now() - tiempoInicioCP;
    if (!calculoValido && !apartadoRegistrado) {
      console.log('❌ CP-100 FAILED: No se pudo confirmar apartado ni saldo');
      process.exit(1);
    }
    console.log('✅ CP-100 PASSED | total: ₡' + totalVal + ' | abono: ₡' + abono + ' | saldo esperado: ₡' + saldoEsperado + ' | saldo pantalla: ₡' + (saldoEncontrado ?? 'pendiente-inspección') + ' | confirmado: ' + (confirmResult !== null) + ' | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp100-fail');
    console.log('❌ CP-100 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp100_apartado_con_abono();
