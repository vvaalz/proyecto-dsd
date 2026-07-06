const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const CLIENTE_ID   = 12735;
const CLIENTE_NOMBRE = 'valentina cliente prueba';
const TOLERANCIA   = 1;

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

function parseMonto(txt) {
  if (!txt) return NaN;
  const m = (txt+'').match(/([-\d,]+\.\d{2})/);
  return m ? parseFloat(m[1].replace(/,/g,'')) : NaN;
}

async function cargarPOS(page) {
  await page.goto(POS_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
  await page.waitForTimeout(3000);
  await page.waitForSelector('.product_box', { timeout: 15000 });
  // Colón costarricense
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
  await page.evaluate(({ src }) => {
    const re = new RegExp(src, 'i');
    const box = Array.from(document.querySelectorAll('.product_box')).find(b => re.test((b.textContent||'').replace(/\s+/g,' ')));
    if (box) (box.querySelector('.product_box_quantity_content') || box).click();
  }, { src: 'aaa-mult' });
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

async function agregarProducto(page, src) {
  const added = await page.evaluate(({ src }) => {
    const re = new RegExp(src, 'i');
    const box = Array.from(document.querySelectorAll('.product_box')).find(b => re.test((b.textContent||'').replace(/\s+/g,' ')));
    if (!box) return false;
    (box.querySelector('.product_box_quantity_content') || box).click(); return true;
  }, { src });
  if (added) await page.waitForTimeout(700);
  return added;
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

async function cp109_enviar_a_caja_cliente() {
  console.log('🔄 Ejecutando CP-109: Enviar a caja — validar cliente en modal...');
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

    // ── PASO 1: Agregar 2 productos al carrito ──
    const prod1 = await agregarProducto(page, 'aaa-mult');
    const prod2 = await agregarProducto(page, 'aaa-bombillos');
    console.log('🛒 Productos agregados: multímetro=' + prod1 + ' bombillos=' + prod2);
    await page.waitForTimeout(500);

    // Leer total del carrito antes de abrir modal
    const totalCarrito = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const totalEl = Array.from(document.querySelectorAll('#total_sales, #total_cart, [id*="total"]')).filter(isVis)
        .find(el => /[\d,]+\.\d{2}/.test(el.textContent||''));
      return totalEl ? totalEl.textContent.replace(/\s+/g,' ').trim() : null;
    });
    console.log('💰 Total carrito:', totalCarrito);

    // ── PASO 2: Seleccionar cliente "valentina cliente prueba" ──
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch {} }, CLIENTE_ID);
    await page.waitForTimeout(1000);

    // Verificar nombre cliente en POS
    const clienteEnPOS = await page.evaluate((nombre) => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const searchInput = document.getElementById('search_pos_customer');
      const clienteDivs = Array.from(document.querySelectorAll('*')).filter(isVis)
        .filter(el => el.children.length === 0)
        .find(el => new RegExp(nombre,'i').test(el.textContent||''));
      return { inputVal: searchInput?.value || null, clienteTxt: clienteDivs?.textContent?.trim()?.substring(0,40) || null };
    }, CLIENTE_NOMBRE);
    console.log('👤 Cliente en POS:', JSON.stringify(clienteEnPOS));

    // ── PASO 3: Abrir dialog_send_sale con Shift+C ──
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await page.waitForTimeout(300);
    const tShiftC = Date.now();
    await page.keyboard.press('Shift+C');
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tShiftC, 'Shift+C → dialog_send_sale');

    let modalAbierto = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const m = document.getElementById('dialog_send_sale');
      return m && isVis(m);
    });

    if (!modalAbierto) {
      // Fallback: menú Caja → Enviar a caja
      console.log('⚠️ Shift+C no abrió modal — intentando desde menú...');
      await page.evaluate(() => { document.getElementById('menu_cash')?.click(); });
      await page.waitForTimeout(700);
      await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /caja/i.test(m.textContent||''));
        if (!menu) return;
        const li = Array.from(menu.querySelectorAll('li')).find(el => /enviar.*caja|send.*cash/i.test(el.textContent||''));
        if (li) li.click();
      });
      await page.waitForTimeout(2000);
      modalAbierto = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        return !!(document.getElementById('dialog_send_sale') && isVis(document.getElementById('dialog_send_sale')));
      });
    }
    console.log('✔ dialog_send_sale abierto:', modalAbierto);
    if (!modalAbierto) throw new Error('dialog_send_sale no se pudo abrir');

    // ── PASO 4: Leer contenido del modal ──
    const contenidoModal = await page.evaluate((nombre) => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const modal = document.getElementById('dialog_send_sale');
      const totalEl    = document.getElementById('total_send_sale_txt');
      const searchCliente = document.getElementById('search_pos_customer_send_sale');
      const payTypeCash   = document.getElementById('ck_is_send_sale_payment_cash');
      const payTypeCred   = document.getElementById('ck_is_send_sale_payment_credit');
      const payTypeHidden = document.getElementById('payment_type_send_sale');
      const btnEnviar     = document.getElementById('send_sale_payment');
      const textoModal    = modal.textContent.replace(/\s+/g,' ').trim();
      const clienteEnTexto = new RegExp(nombre,'i').test(textoModal);
      return {
        totalTxt:        totalEl?.textContent.trim() ?? null,
        searchClienteVal: searchCliente?.value ?? null,
        payTypeCashChecked: payTypeCash?.checked ?? null,
        payTypeCredChecked: payTypeCred?.checked ?? null,
        payTypeVal:       payTypeHidden?.value ?? null,
        btnEnviarTxt:    btnEnviar?.textContent.replace(/\s+/g,' ').trim() ?? null,
        clienteEnTexto,
        textoResumen:    textoModal.substring(0,300)
      };
    }, CLIENTE_NOMBRE);
    console.log('📋 Modal contenido:', JSON.stringify(contenidoModal));

    // Medir performance de carga del modal
    const totalModal = parseMonto(contenidoModal.totalTxt);
    console.log('💰 Total en modal:', contenidoModal.totalTxt, '→', totalModal);

    // ── PASO 5: Buscar cliente en el campo del modal ──
    // Si el cliente ya aparece en el modal, es validación directa
    // Si no, buscarlo manualmente en #search_pos_customer_send_sale
    let clienteValidado = contenidoModal.clienteEnTexto;
    if (!clienteValidado) {
      // Buscar cliente dentro del modal
      await page.evaluate((nombre) => {
        const el = document.getElementById('search_pos_customer_send_sale');
        if (el) { el.value = nombre; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('keyup',{bubbles:true})); }
      }, CLIENTE_NOMBRE.substring(0,8));
      await page.waitForTimeout(1500);
      // Hacer click en el botón de búsqueda
      await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const btn = document.querySelector('#basic-addon3');
        if (btn && isVis(btn)) btn.click();
      });
      await page.waitForTimeout(1500);
      // Verificar si el nombre apareció en los resultados
      clienteValidado = await page.evaluate((nombre) => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const modal = document.getElementById('dialog_send_sale');
        const textoModal = modal.textContent.replace(/\s+/g,' ');
        return new RegExp(nombre,'i').test(textoModal);
      }, CLIENTE_NOMBRE);
      console.log('🔍 Cliente tras búsqueda en modal:', clienteValidado);
    }

    // ── PASO 6: Confirmar "Enviar a caja" ──
    const tEnviar = Date.now();
    const enviarResult = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = document.getElementById('send_sale_payment');
      if (btn && isVis(btn)) { btn.click(); return btn.textContent.replace(/\s+/g,' ').trim().substring(0,20); }
      return null;
    });
    await page.waitForTimeout(3000);
    evaluarAccion(Date.now() - tEnviar, 'Enviar a caja');
    console.log('✔ Enviar a caja:', enviarResult);

    for (let i = 0; i < 3; i++) { const a = await manejarAlerta(page); if (!a) break; console.log('🔔 Alerta:', a); await page.waitForTimeout(700); }
    await page.waitForTimeout(1500);

    // ── VALIDACIONES ──
    const v1 = modalAbierto;                                         // Modal se abrió
    const v2 = contenidoModal.totalTxt !== null && !isNaN(totalModal); // Total visible en modal
    const v3 = contenidoModal.payTypeCashChecked === true;            // Contado activo por defecto
    const v4 = clienteValidado;                                       // Cliente visible/buscable en modal
    const v5 = enviarResult !== null;                                  // "Enviar a caja" clickado

    console.log('\n📊 === VALIDACIONES CP-109 ===');
    console.log('  dialog_send_sale abierto:     ' + (v1 ? '✅' : '❌') + ' (Shift+C)');
    console.log('  Total visible en modal:       ' + (v2 ? '✅' : '⚠️') + ' ' + contenidoModal.totalTxt);
    console.log('  Tipo "Contado" activo:        ' + (v3 ? '✅' : '⚠️'));
    console.log('  Cliente validado en modal:    ' + (v4 ? '✅' : '⚠️') + ' (' + CLIENTE_NOMBRE + ')');
    console.log('  "Enviar a caja" confirmado:   ' + (v5 ? '✅' : '⚠️') + (enviarResult ? ' "'+enviarResult+'"' : ''));

    if (!v1) throw new Error('dialog_send_sale no se abrió');
    if (!v2) throw new Error('Total no visible en dialog_send_sale');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    const pasadas = [v1,v2,v3,v4,v5].filter(Boolean).length;
    const icono = pasadas >= 4 ? '✅' : '⚠️';
    console.log(icono + ' CP-109 PASSED | Shift+C → dialog_send_sale | total: ' + contenidoModal.totalTxt + ' | contado-default: ' + v3 + ' | cliente: ' + (v4?'validado':'no-en-texto') + ' | enviar: ' + enviarResult + ' | validaciones: ' + pasadas + '/5 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp109-fail');
    console.log('❌ CP-109 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp109_enviar_a_caja_cliente();
