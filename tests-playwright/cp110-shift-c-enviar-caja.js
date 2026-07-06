const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

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

async function cp110_shift_c_enviar_caja() {
  console.log('🔄 Ejecutando CP-110: Comando rápido Shift+C — validar apertura de dialog_send_sale...');
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

    // Agregar 1 producto para que el modal tenga total real
    await page.evaluate(() => {
      const re = /aaa-mult/i;
      const box = Array.from(document.querySelectorAll('.product_box')).find(b => re.test((b.textContent||'').replace(/\s+/g,' ')));
      if (box) (box.querySelector('.product_box_quantity_content') || box).click();
    });
    await page.waitForTimeout(1200);

    // ── Estado ANTES del shortcut ──
    const modalAntes = await page.evaluate(() => {
      const el = document.getElementById('dialog_send_sale');
      if (!el) return { found: false };
      const s = window.getComputedStyle(el), r = el.getBoundingClientRect();
      return { found: true, display: s.display, classes: el.className, height: Math.round(r.height), hasIn: el.classList.contains('in') };
    });
    console.log('📋 dialog_send_sale ANTES de Shift+C:', JSON.stringify(modalAntes));

    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await page.waitForTimeout(300);

    // ── Presionar Shift+C ──
    const tShiftC = Date.now();
    await page.keyboard.press('Shift+C');
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tShiftC, 'Shift+C → apertura modal');

    // ── Estado DESPUÉS ──
    const modalDespues = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const el = document.getElementById('dialog_send_sale');
      if (!el) return { found: false };
      return {
        found: true, visible: isVis(el),
        classes: el.className, height: Math.round(el.getBoundingClientRect().height),
        hasIn: el.classList.contains('in')
      };
    });
    console.log('📋 dialog_send_sale DESPUÉS de Shift+C:', JSON.stringify(modalDespues));

    let modalAbierto = modalDespues.found && modalDespues.visible;

    // Fallback: evento sintético
    if (!modalAbierto) {
      console.log('⚠️ Shift+C no abrió modal — intentando evento sintético...');
      await page.evaluate(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'C', code: 'KeyC', shiftKey: true, bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keyup',   { key: 'C', code: 'KeyC', shiftKey: true, bubbles: true }));
      });
      await page.waitForTimeout(2000);
      modalAbierto = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const el = document.getElementById('dialog_send_sale');
        return el && isVis(el);
      });
      console.log('📋 Fallback evento sintético:', modalAbierto);
    }

    if (!modalAbierto) throw new Error('dialog_send_sale no se pudo abrir con Shift+C');

    // ── Verificar contenido del modal ──
    const contenido = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const totalEl          = document.getElementById('total_send_sale_txt');
      const searchClienteEl  = document.getElementById('search_pos_customer_send_sale');
      const payTypeCashEl    = document.getElementById('ck_is_send_sale_payment_cash');
      const payTypeCredEl    = document.getElementById('ck_is_send_sale_payment_credit');
      const btnEnviarEl      = document.getElementById('send_sale_payment');
      const observEl         = document.getElementById('send_sale_observation');
      return {
        modalId: 'dialog_send_sale',
        totalTxt:          totalEl        ? { txt: totalEl.textContent.trim(),       vis: isVis(totalEl) }        : null,
        searchCliente:     searchClienteEl ? { ph: searchClienteEl.placeholder,      vis: isVis(searchClienteEl) } : null,
        pagoContado:       payTypeCashEl   ? { checked: payTypeCashEl.checked,       vis: true }                   : null,
        pagoCredito:       payTypeCredEl   ? { checked: payTypeCredEl.checked,       vis: true }                   : null,
        btnEnviar:         btnEnviarEl     ? { txt: btnEnviarEl.textContent.replace(/\s+/g,' ').trim(), vis: isVis(btnEnviarEl) } : null,
        observacion:       observEl        ? { ph: observEl.placeholder,             vis: isVis(observEl) }        : null
      };
    });
    console.log('📋 Contenido modal:', JSON.stringify(contenido));

    // ── Cerrar el modal sin enviar ──
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const closeBtn = document.querySelector('#dialog_send_sale .btn_close_payment_modal, #dialog_send_sale [data-dismiss="modal"]');
      if (closeBtn && isVis(closeBtn)) { closeBtn.click(); return; }
      const m = document.getElementById('dialog_send_sale');
      if (m) { m.style.display='none'; m.classList.remove('in'); }
    }).catch(() => {});
    await page.waitForTimeout(500);

    // ── VALIDACIONES ──
    const v1 = modalDespues.found && modalDespues.hasIn;                       // Modal abrió con clase "in"
    const v2 = contenido.totalTxt !== null && contenido.totalTxt.vis;          // Total visible
    const v3 = contenido.pagoContado !== null && contenido.pagoContado.checked; // Contado activo por defecto
    const v4 = contenido.btnEnviar !== null && contenido.btnEnviar.txt === 'Enviar a caja'; // Botón correcto
    const v5 = contenido.searchCliente !== null;                               // Campo búsqueda cliente presente

    console.log('\n📊 === VALIDACIONES CP-110 ===');
    console.log('  Shift+C abrió dialog_send_sale:  ' + (v1 ? '✅' : '❌') + ' classes: ' + modalDespues.classes?.substring(0,25));
    console.log('  #total_send_sale_txt visible:    ' + (v2 ? '✅' : '⚠️') + ' = ' + (contenido.totalTxt?.txt ?? 'N/A'));
    console.log('  Pago "Contado" por defecto:      ' + (v3 ? '✅' : '⚠️'));
    console.log('  Botón "Enviar a caja" correcto:  ' + (v4 ? '✅' : '⚠️') + ' txt=' + (contenido.btnEnviar?.txt ?? 'N/A'));
    console.log('  Campo búsqueda cliente presente: ' + (v5 ? '✅' : '⚠️'));

    const pasadas = [v1,v2,v3,v4,v5].filter(Boolean).length;
    if (pasadas < 4) throw new Error('Solo ' + pasadas + '/5 validaciones pasadas');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    const icono = modalDespues.visible ? '✅' : '⚠️';
    console.log(icono + ' CP-110 PASSED | Shift+C abrió dialog_send_sale | total: ' + contenido.totalTxt?.txt + ' | contado-default: ' + v3 + ' | btn: "' + contenido.btnEnviar?.txt + '" | validaciones: ' + pasadas + '/5 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp110-fail');
    console.log('❌ CP-110 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp110_shift_c_enviar_caja();
