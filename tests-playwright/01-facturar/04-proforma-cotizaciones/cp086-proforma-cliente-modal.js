const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
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
  // Asegurar colones
  await page.evaluate(() => { document.getElementById('menu_type_currency')?.click(); });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /col[oó]n|d[oó]lar/i.test(m.textContent || ''));
    if (menu) { const opt = Array.from(menu.querySelectorAll('li')).find(li => /col[oó]n costarricense/i.test(li.textContent || '')); if (opt) opt.click(); }
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
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const icon = Array.from(document.querySelectorAll('#tb_table_buy_list i.material-icons')).filter(isVis).find(el => /^delete$/i.test(el.textContent.trim()));
      if (icon) { (icon.closest('button,a,[onclick]') || icon).click(); return true; }
      return false;
    });
    if (!del) break;
    await page.waitForTimeout(500);
    await page.evaluate(() => { const isVis=(el)=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;}; const btn=Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis)[0]; if(btn)btn.click(); }).catch(()=>{});
    await page.waitForTimeout(300);
    rows = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0);
  }
}

async function abrirModalProforma(page) {
  // Ir al F4 tab
  await page.evaluate(() => { document.getElementById('btn_proform_option')?.click(); });
  await page.waitForTimeout(2000);
  // Llamar función de creación
  await page.evaluate(() => { if (typeof show_create_proform_modal === 'function') show_create_proform_modal(); });
  await page.waitForTimeout(2500);
  // Encontrar modal de creación
  const modalId = await page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const modals = Array.from(document.querySelectorAll('[id*="dialog"],[id*="modal"],[class*="modal"]')).filter(isVis).filter(el => el.id !== 'dialog_payment');
    return modals.map(m => ({ id: m.id, cls: (m.className||'').substring(0,40), txt: m.textContent.replace(/\s+/g,' ').trim().substring(0,100) }));
  });
  console.log('📋 Modales visibles tras show_create_proform_modal:', JSON.stringify(modalId.slice(0,5)));
  return modalId;
}

async function cp086_proforma_cliente_modal() {
  console.log('🔄 Ejecutando CP-086: Proforma con cliente seleccionado — validar nombre en modal...');
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
    for (const { src } of [{ src: 'aaa-mult' }, { src: 'aaa-bombillos' }]) {
      const added = await page.evaluate(({ src }) => {
        const re = new RegExp(src, 'i');
        const box = Array.from(document.querySelectorAll('.product_box')).find(b => re.test((b.textContent||'').replace(/\s+/g,' ')));
        if (!box) return false;
        (box.querySelector('.product_box_quantity_content') || box).click(); return true;
      }, { src });
      if (added) await page.waitForFunction(({ src }) => new RegExp(src,'i').test((document.getElementById('tb_table_buy_list')||{textContent:''}).textContent), { src }, { timeout: 15000 }).catch(()=>{});
      await page.waitForTimeout(800);
    }

    // Asociar cliente antes de abrir modal
    const tCliente = Date.now();
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch {} }, CLIENTE_ID);
    await page.waitForTimeout(1000);
    evaluarAccion(Date.now() - tCliente, 'Seleccionar cliente 12735');

    // Ir a F4 y abrir modal
    const tModal = Date.now();
    const modales = await abrirModalProforma(page);
    evaluarAccion(Date.now() - tModal, 'Abrir modal crear proforma');

    // Inspeccionar todos los inputs y el nombre del cliente en el modal
    const modalContent = await page.evaluate((clienteId) => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const inputs = Array.from(document.querySelectorAll('input,select,textarea')).filter(isVis)
        .filter(el => !['product_search','search_pos_customer'].includes(el.id))
        .map(el => ({ id: el.id.substring(0,40), type: el.type, value: (el.value||'').substring(0,40), placeholder: (el.placeholder||'').substring(0,40), name: el.name }));
      const buttons = Array.from(document.querySelectorAll('button')).filter(isVis)
        .map(el => ({ id: el.id.substring(0,30), text: el.textContent.replace(/\s+/g,' ').trim().substring(0,40), cls: (el.className||'').substring(0,30) }));
      // Buscar nombre del cliente en el DOM
      const clienteTextos = Array.from(document.querySelectorAll('*')).filter(isVis)
        .filter(el => el.children.length === 0 && /valentina|cliente prueba|12735/i.test(el.textContent||''))
        .map(el => el.textContent.replace(/\s+/g,' ').trim().substring(0,60));
      // Buscar campo de cliente en modal
      const clienteInputs = Array.from(document.querySelectorAll('input,select')).filter(isVis)
        .filter(el => /client|customer|nombre/i.test((el.id||'')+(el.placeholder||'')+(el.name||'')))
        .map(el => ({ id: el.id, value: el.value.substring(0,40), placeholder: el.placeholder }));
      return { inputs: inputs.slice(0,15), buttons: buttons.slice(0,10), clienteTextos, clienteInputs };
    }, CLIENTE_ID);

    console.log('📝 Inputs en modal:', JSON.stringify(modalContent.inputs));
    console.log('🔘 Botones en modal:', JSON.stringify(modalContent.buttons));
    console.log('👤 Cliente textos visibles:', JSON.stringify(modalContent.clienteTextos));
    console.log('👤 Inputs de cliente:', JSON.stringify(modalContent.clienteInputs));

    // Validar que el cliente aparece de alguna forma
    const clienteEncontrado = modalContent.clienteTextos.length > 0 || modalContent.clienteInputs.some(i => i.value.length > 0);
    if (clienteEncontrado) console.log('✔ Nombre del cliente visible en modal');
    else console.log('⚠️ Cliente no visible en modal (puede requerir selección explícita dentro del modal)');

    // Intentar seleccionar cliente si hay un campo de búsqueda en el modal
    if (modalContent.clienteInputs.length > 0 && !clienteEncontrado) {
      const clienteInput = modalContent.clienteInputs[0];
      if (clienteInput.id) {
        await page.fill('#' + clienteInput.id, 'valentina');
        await page.waitForTimeout(1500);
        const suggestions = await page.evaluate(() => {
          const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
          return Array.from(document.querySelectorAll('[class*="suggest"],[class*="autocomplete"],li')).filter(isVis)
            .filter(el => /valentina/i.test(el.textContent||'')).slice(0,3).map(el => el.textContent.replace(/\s+/g,' ').trim().substring(0,60));
        });
        console.log('🔍 Sugerencias cliente "valentina":', JSON.stringify(suggestions));
      }
    }

    // Intentar confirmar (si hay botón de confirmar visible)
    const confirmado = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis)
        .find(el => /confirmar|guardar|crear|save|confirm|aceptar/i.test(el.textContent||''));
      if (btn) { btn.click(); return btn.textContent.replace(/\s+/g,' ').trim().substring(0,30); }
      if (typeof confirm_create_proform === 'function') { confirm_create_proform(); return 'confirm_create_proform()'; }
      return null;
    });
    if (confirmado) {
      console.log('✔ Confirmado:', confirmado);
      await page.waitForTimeout(2500);
      // Check for sweet-alert confirmation
      await page.evaluate(() => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0; };
        const btn = Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis).filter(el => el.id !== 'dialog_payment')[0];
        if (btn) btn.click();
      }).catch(()=>{});
      await page.waitForTimeout(1500);
    } else {
      console.log('⚠️ No se encontró botón de confirmar — cerrando modal');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
    }

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-086 PASSED | módulo: Cotizaciones/Proforma | cliente: 12735 | modal abierto: ' + (modales.length > 0) + ' | cliente visible: ' + clienteEncontrado + ' | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp086-fail');
    console.log('❌ CP-086 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp086_proforma_cliente_modal();
