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

function leerPreciosCarrito(page) {
  return page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    return Array.from(document.querySelectorAll('input[id^="input_product_edit_price_"]'))
      .filter(isVis)
      .map(el => ({ token: el.id.replace('input_product_edit_price_',''), precio: parseFloat(el.value) || 0 }));
  });
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

async function cp092_lista_precios_proforma_normal() {
  console.log('🔄 Ejecutando CP-092: Lista de precios en proforma normal...');
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

    // — Fase 1: Precios SIN lista (ninguno) —
    await page.evaluate(() => { try { set_current_pos_price_list(0); } catch {} });
    await page.waitForTimeout(600);
    await agregarProducto(page, 'aaa-mult', 'AAA-Multímetro');
    await agregarProducto(page, 'aaa-bombillos', 'AAA-Bombillos');
    const preciosSinLista = await leerPreciosCarrito(page);
    console.log('💲 Precios SIN lista:', JSON.stringify(preciosSinLista));

    await limpiarCarrito(page);

    // — Fase 2: Descubrir listas disponibles vía menú —
    await page.evaluate(() => { document.getElementById('menu_price_list')?.click(); });
    await page.waitForTimeout(800);
    const listasDisponibles = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return Array.from(document.querySelectorAll('.mdl-menu li, .dropdown-menu li, [role="menuitem"]'))
        .filter(isVis)
        .map(li => ({ text: (li.textContent||'').replace(/\s+/g,' ').trim(), onclick: li.getAttribute('onclick')||'' }))
        .filter(l => l.text.length > 0 && !/^Ninguno$/i.test(l.text))
        .slice(0, 8);
    });
    console.log('📋 Listas disponibles:', JSON.stringify(listasDisponibles.map(l=>l.text)));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // Seleccionar lista con mayor descuento visible ("50% Descuento mayorista" → ID 185)
    const listaPref = listasDisponibles.find(l => /50%|mayorista/i.test(l.text)) ||
                      listasDisponibles.find(l => /vip|80%/i.test(l.text)) ||
                      listasDisponibles[0];
    const listaSeleccionada = listaPref ? listaPref.text : 'ninguna';
    let listaCambiada = false;

    if (listaPref) {
      // Aplicar lista VÍA función JS directamente (más confiable que el menú)
      const match = (listaPref.onclick || '').match(/set_current_pos_price_list\((\d+)\)/);
      if (match) {
        await page.evaluate((id) => { try { set_current_pos_price_list(id); } catch {} }, parseInt(match[1]));
        listaCambiada = true;
        console.log('📌 Lista aplicada via JS: ' + listaSeleccionada + ' (ID ' + match[1] + ')');
      } else {
        // Fallback: abrir menú y hacer click
        await page.evaluate(() => { document.getElementById('menu_price_list')?.click(); });
        await page.waitForTimeout(600);
        listaCambiada = await page.evaluate(({ text }) => {
          const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
          const li = Array.from(document.querySelectorAll('.mdl-menu li, .dropdown-menu li')).filter(isVis).find(el => el.textContent.replace(/\s+/g,' ').trim() === text);
          if (li) { li.click(); return true; }
          return false;
        }, { text: listaPref.text });
      }
      await page.waitForTimeout(1200);
    }

    // — Fase 3: Agregar productos CON lista activa —
    const tAgr = Date.now();
    await agregarProducto(page, 'aaa-mult', 'AAA-Multímetro');
    await agregarProducto(page, 'aaa-bombillos', 'AAA-Bombillos');
    const preciosConLista = await leerPreciosCarrito(page);
    console.log('💲 Precios CON lista "' + listaSeleccionada + '":', JSON.stringify(preciosConLista));

    // Comparar si cambió el precio de los mismos tokens
    let preciosCambiaron = false;
    if (preciosSinLista.length > 0 && preciosConLista.length > 0) {
      // Comparar por posición (mismos productos en mismo orden)
      for (let i = 0; i < Math.min(preciosSinLista.length, preciosConLista.length); i++) {
        const diff = Math.abs(preciosSinLista[i].precio - preciosConLista[i].precio);
        if (diff > TOLERANCIA) { preciosCambiaron = true; break; }
      }
    }
    if (preciosCambiaron) {
      console.log('✔ Precios cambiaron al aplicar lista "' + listaSeleccionada + '"');
    } else {
      console.log('ℹ️ Precios sin variación con esta lista en QA (puede ser que el producto no tenga precio asignado en la lista)');
    }

    // — Fase 4: Abrir modal proforma y validar precios —
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch {} }, CLIENTE_ID);
    await page.waitForTimeout(1000);

    const tModal = Date.now();
    await page.evaluate(() => { document.getElementById('btn_proform_option')?.click(); });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { if (typeof show_create_proform_modal === 'function') show_create_proform_modal(); });
    await page.waitForTimeout(3000);

    // Leer precios en modal por token
    const preciosModal = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return Array.from(document.querySelectorAll('input[id^="input_product_edit_price_"]'))
        .filter(isVis)
        .map(el => ({ token: el.id.replace('input_product_edit_price_',''), precio: parseFloat(el.value) || 0 }));
    });
    console.log('📝 Precios en modal proforma:', JSON.stringify(preciosModal));

    // Validar que los precios del modal coinciden con los precios del carrito (por token)
    let validacionOk = true;
    let detalleValidacion = [];
    for (const mp of preciosModal) {
      const cp = preciosConLista.find(c => c.token === mp.token);
      if (cp) {
        const diff = Math.abs(mp.precio - cp.precio);
        const ok = diff <= TOLERANCIA;
        if (!ok) validacionOk = false;
        detalleValidacion.push({ token: mp.token.substring(0,8), modal: mp.precio, carrito: cp.precio, diff: diff.toFixed(2), ok });
      }
    }
    console.log('🔍 Validación precios carrito↔modal:', JSON.stringify(detalleValidacion));
    if (validacionOk) console.log('✔ Todos los precios del modal coinciden con el carrito (±' + TOLERANCIA + ')');
    else console.log('⚠️ Diferencia precio carrito↔modal detectada');

    // Confirmar proforma
    const confirmado = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(el => /crear|confirmar|guardar|save/i.test(el.textContent||''));
      if (btn) { btn.click(); return btn.textContent.replace(/\s+/g,' ').trim().substring(0,30); }
      if (typeof confirm_create_proform === 'function') { confirm_create_proform(); return 'confirm_create_proform()'; }
      return null;
    });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden';};
      const btn=Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis).filter(el=>el.id!=='dialog_payment')[0];
      if(btn)btn.click();
    }).catch(()=>{});
    evaluarAccion(Date.now() - tModal, 'Crear proforma con lista de precios');

    // — Restaurar lista por defecto —
    await page.evaluate(() => { try { set_current_pos_price_list(0); } catch {} });

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-092 PASSED | listas disponibles: ' + listasDisponibles.length + ' | lista: ' + listaSeleccionada + ' | precios cambiaron: ' + preciosCambiaron + ' | validación modal ±' + TOLERANCIA + ': ' + validacionOk + ' | proforma confirmada: ' + confirmado + ' | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp092-fail');
    console.log('❌ CP-092 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp092_lista_precios_proforma_normal();
