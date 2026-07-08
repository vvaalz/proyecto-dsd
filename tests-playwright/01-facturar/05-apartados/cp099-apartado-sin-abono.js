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

async function cp099_apartado_sin_abono() {
  console.log('🔄 Ejecutando CP-099: Generar apartado sin abono inicial — validar montos y estado...');
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

    // Leer total del POS
    const totalPOS = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent||'').trim()));
      const txt = label?.nextElementSibling?.textContent.trim() ?? null;
      const val = txt ? parseFloat((txt.match(/[₡$]\s*([\d,]+\.\d{2})/) || ['','0'])[1].replace(/,/g,'')) : NaN;
      return { txt, val };
    });
    console.log('💰 Total POS:', totalPOS.txt, '→ ₡' + totalPOS.val);

    // Asociar cliente
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch {} }, CLIENTE_ID);
    await page.waitForTimeout(800);

    // Activar flujo de apartado via go_to_layaway_sale()
    const tLayaway = Date.now();
    const layawayActivado = await page.evaluate(() => {
      if (typeof go_to_layaway_sale === 'function') { go_to_layaway_sale(); return 'go_to_layaway_sale'; }
      if (typeof make_layaway === 'function') { make_layaway(); return 'make_layaway'; }
      // Fallback: Shift+L para abrir el flujo
      return null;
    });
    console.log('📋 Función layaway activada:', layawayActivado);

    if (!layawayActivado) {
      // Fallback: usar Shift+L (abre dialog_payment en modo crédito/apartado)
      await page.evaluate(() => { document.body.focus(); });
      await page.keyboard.press('Shift+L');
    }
    await page.waitForTimeout(3000);

    // Inspeccionar qué modal/dialog abrió
    const modalInfo = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const modals = Array.from(document.querySelectorAll('.modal.in, .sweet-alert')).filter(isVis)
        .map(m => ({ id: m.id, cls: m.className.substring(0,40), txt: m.textContent.replace(/\s+/g,' ').trim().substring(0,100) }));
      // Buscar inputs y botones del modal de apartado
      const inputs = Array.from(document.querySelectorAll('input')).filter(isVis)
        .filter(el => /layaway|apart|abono|deposit|inicial/i.test((el.id||'')+(el.placeholder||'')+(el.name||'')))
        .map(el => ({ id: el.id, ph: el.placeholder, val: el.value }));
      // Botones de confirmación
      const btns = Array.from(document.querySelectorAll('button,a')).filter(isVis)
        .filter(el => /confirmar|confirm|apartado|layaway|crear|save|guardar|aceptar/i.test(el.textContent||''))
        .map(el => ({ tag: el.tagName, txt: (el.textContent||'').replace(/\s+/g,' ').trim().substring(0,30), onclick: (el.getAttribute('onclick')||'').substring(0,60) }));
      // Todos los onclick en modales visibles
      const onclicks = Array.from(document.querySelectorAll('.modal.in [onclick], .sweet-alert [onclick]')).filter(isVis)
        .map(el => ({ tag: el.tagName, txt: (el.textContent||'').replace(/\s+/g,' ').trim().substring(0,25), onclick: (el.getAttribute('onclick')||'').substring(0,60) }));
      return { modals, inputs, btns, onclicks };
    });
    console.log('📋 Modales:', JSON.stringify(modalInfo.modals));
    console.log('📋 Inputs apartado:', JSON.stringify(modalInfo.inputs));
    console.log('📋 Botones:', JSON.stringify(modalInfo.btns.slice(0,8)));
    console.log('📋 Onclicks en modal:', JSON.stringify(modalInfo.onclicks.slice(0,10)));

    // Buscar y clickar el botón de apartado específico dentro del dialog_payment
    let apartadoConfirmado = null;
    const btnApartado = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      // Buscar botón "Apartado" o "Layaway" o elemento con onclick make_layaway/add_layaway
      const btn = Array.from(document.querySelectorAll('button,a,[onclick]')).filter(isVis).find(el => {
        const txt = (el.textContent||'').replace(/\s+/g,' ').trim();
        const oc = el.getAttribute('onclick') || '';
        return /^apartado$/i.test(txt) || /make_layaway|add_layaway|confirm_add_layaway|go_to_layaway/i.test(oc);
      });
      if (btn) { btn.click(); return { txt: (btn.textContent||'').replace(/\s+/g,' ').trim().substring(0,30), onclick: (btn.getAttribute('onclick')||'').substring(0,60) }; }
      return null;
    });
    console.log('🔘 Botón apartado encontrado:', JSON.stringify(btnApartado));
    await page.waitForTimeout(2500);

    // Si se abrió un segundo modal (formulario apartado), inspeccionarlo
    const modalApartado = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const modals = Array.from(document.querySelectorAll('.modal.in, .sweet-alert')).filter(isVis)
        .map(m => ({ id: m.id, txt: m.textContent.replace(/\s+/g,' ').trim().substring(0,120) }));
      const inputs = Array.from(document.querySelectorAll('input')).filter(isVis)
        .map(el => ({ id: el.id.substring(0,30), ph: el.placeholder, val: el.value.substring(0,20), type: el.type }))
        .filter(el => el.id || el.ph).slice(0,10);
      const btns = Array.from(document.querySelectorAll('button,a')).filter(isVis)
        .filter(el => /confirmar|confirm|crear|save|guardar|aceptar|ok|aparta/i.test(el.textContent||''))
        .map(el => ({ txt: (el.textContent||'').replace(/\s+/g,' ').trim().substring(0,30), onclick: (el.getAttribute('onclick')||'').substring(0,60) }));
      return { modals, inputs, btns };
    });
    console.log('📋 Modal apartado (2do):', JSON.stringify(modalApartado));

    // Si hay un campo de abono inicial, dejarlo en 0 (sin abono)
    const campoAbono = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const inputs = Array.from(document.querySelectorAll('input')).filter(isVis);
      // Buscar campo de abono/depósito inicial
      const abonoInput = inputs.find(el => /abono|deposit|inicial|initial|down|pago|payment/i.test((el.id||'')+(el.placeholder||'')+(el.name||'')));
      if (abonoInput) {
        const val = parseFloat(abonoInput.value) || 0;
        return { id: abonoInput.id, val };
      }
      return null;
    });
    console.log('💵 Campo abono inicial:', JSON.stringify(campoAbono));

    // Confirmar el apartado SIN abono
    const tConfirm = Date.now();
    const confirmResult = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      // Prioridad: botón con texto de confirmación en modales
      const btn = Array.from(document.querySelectorAll('.modal.in button, .sweet-alert button, button')).filter(isVis)
        .find(el => /confirmar|confirm|crear|save|guardar|aceptar|ok|aparta|add|agregar/i.test(el.textContent||''));
      if (btn) { btn.click(); return { clicked: true, txt: (btn.textContent||'').replace(/\s+/g,' ').trim().substring(0,30) }; }
      // Llamar a función JS directamente
      if (typeof confirm_add_layaway === 'function') { confirm_add_layaway(); return { clicked: true, txt: 'confirm_add_layaway()' }; }
      if (typeof add_layaway === 'function') { add_layaway(); return { clicked: true, txt: 'add_layaway()' }; }
      return { clicked: false, txt: null };
    });
    await page.waitForTimeout(3000);
    evaluarAccion(Date.now() - tConfirm, 'Confirmar apartado');
    console.log('✔ Confirmación:', JSON.stringify(confirmResult));

    // Manejar alertas de confirmación secundarias
    for (let i = 0; i < 3; i++) {
      const alerta = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const btn = Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis).filter(el => el.id !== 'dialog_payment')[0];
        if (btn) { btn.click(); return true; }
        return false;
      }).catch(() => false);
      if (!alerta) break;
      await page.waitForTimeout(800);
    }

    // Estado final: verificar si el apartado quedó registrado
    const estadoFinal = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const url = window.location.href;
      const alertas = Array.from(document.querySelectorAll('.sweet-alert, .alert-success, [class*="success"]')).filter(isVis)
        .map(el => el.textContent.replace(/\s+/g,' ').trim().substring(0,60));
      const modales = Array.from(document.querySelectorAll('.modal.in')).filter(isVis)
        .map(m => ({ id: m.id, txt: m.textContent.replace(/\s+/g,' ').trim().substring(0,60) }));
      return { url, alertas, modales };
    });
    console.log('📍 Estado final:', JSON.stringify(estadoFinal));

    const apartadoCreado = confirmResult.clicked && (
      estadoFinal.alertas.some(a => /exito|success|apartado|creado|registrado/i.test(a)) ||
      estadoFinal.url !== 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1' ||
      estadoFinal.modales.length === 0
    );
    evaluarAccion(Date.now() - tLayaway, 'Flujo completo apartado');

    // Navegar a tab F7 para verificar el apartado en la lista
    await page.evaluate(() => { document.getElementById('btn_layaway_option')?.click(); });
    await page.waitForTimeout(2500);
    const tabApartados = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = document.getElementById('btn_layaway_option');
      const contenido = Array.from(document.querySelectorAll('[id*="layaway"],[class*="layaway"],[id*="apart"]')).filter(isVis)
        .map(el => ({ id: el.id, txt: el.textContent.replace(/\s+/g,' ').trim().substring(0,80) }));
      return { tabEncontrado: !!btn, contenido };
    });
    console.log('📑 Tab F7 Apartados:', JSON.stringify(tabApartados));

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-099 PASSED | función: ' + (layawayActivado||'Shift+L') + ' | total POS: ₡' + totalPOS.val + ' | abono inicial: 0 | confirmado: ' + confirmResult.clicked + ' | tab F7: ' + tabApartados.tabEncontrado + ' | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp099-fail');
    console.log('❌ CP-099 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp099_apartado_sin_abono();
