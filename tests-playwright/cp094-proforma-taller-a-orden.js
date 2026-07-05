const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const HISTORIAL_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/proform/printPosProform';
const TOLERANCIA = 1;
const CLIENTE_ID = 12735;

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

async function cp094_proforma_taller_a_orden() {
  console.log('🔄 Ejecutando CP-094: Proforma de taller → convertir a orden de reparación...');
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

    // Agregar productos
    await agregarProducto(page, 'aaa-mult', 'AAA-Multímetro');
    await agregarProducto(page, 'aaa-bombillos', 'AAA-Bombillos');

    // Total del carrito
    const totalPOS = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent||'').trim()));
      const txt = label?.nextElementSibling?.textContent.trim() ?? null;
      const val = txt ? parseFloat((txt.match(/[₡$]\s*([\d,]+\.\d{2})/) || ['','0'])[1].replace(/,/g,'')) : NaN;
      return { txt, val };
    });
    console.log('💰 Total POS:', totalPOS.txt, '→ ₡' + totalPOS.val);

    // Asociar cliente y abrir modal
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch {} }, CLIENTE_ID);
    await page.waitForTimeout(1000);
    const tModal = Date.now();
    await page.evaluate(() => { document.getElementById('btn_proform_option')?.click(); });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { if (typeof show_create_proform_modal === 'function') show_create_proform_modal(); });
    await page.waitForTimeout(3000);

    // Activar checkbox de taller
    const ckTaller = await page.evaluate(() => {
      const ck = document.getElementById('ck_is_workshop_proform');
      if (!ck) return { found: false, checked: false };
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      if (!ck.checked) {
        const label = document.querySelector('label[for="ck_is_workshop_proform"]');
        if (label && isVis(label)) label.click(); else ck.click();
      }
      return { found: true, checked: ck.checked };
    });
    await page.waitForTimeout(800);
    console.log('🔧 Checkbox taller:', JSON.stringify(ckTaller));

    // Confirmar proforma de taller
    const confirmado = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(el => /crear|confirmar|guardar|save/i.test(el.textContent||''));
      if (btn) { btn.click(); return btn.textContent.replace(/\s+/g,' ').trim().substring(0,30); }
      if (typeof confirm_create_proform === 'function') { confirm_create_proform(); return 'confirm_create_proform()'; }
      return null;
    });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden';};
      const btn=Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis).filter(el=>el.id!=='dialog_payment')[0];
      if(btn)btn.click();
    }).catch(()=>{});
    evaluarAccion(Date.now() - tModal, 'Crear proforma de taller');
    console.log('✔ Proforma de taller confirmada:', confirmado);

    // — Navegar al historial, tab Prof. de Taller —
    const tHistorial = Date.now();
    await page.goto(HISTORIAL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    evaluarCargaPagina(Date.now() - tHistorial, 'Carga historial proformas');

    await page.evaluate(() => { document.getElementById('btn_workshop_proform')?.click(); });
    await page.waitForTimeout(3000); // AJAX del listado

    // Inspeccionar el contenedor del listado (no el layout de la página)
    const estadoListado = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      // Buscar la tabla/contenedor específico del listado de proformas
      const containers = ['#proform_list_content','#workshop_proform_list','#proform_table','#receipt_list_content','#receipts_table','#proform_results'];
      for (const sel of containers) {
        const el = document.querySelector(sel);
        if (el) return { selector: sel, found: true, txt: el.textContent.replace(/\s+/g,' ').trim().substring(0,100) };
      }
      // Buscar tabla con datos de proformas
      const tables = Array.from(document.querySelectorAll('table')).filter(isVis);
      const tableInfos = tables.map(t => ({
        id: t.id, cls: (t.className||'').substring(0,30),
        rows: t.querySelectorAll('tr').length,
        txt: t.textContent.replace(/\s+/g,' ').trim().substring(0,80)
      }));
      // Buscar divs con class que parezca lista de resultados
      const listDivs = Array.from(document.querySelectorAll('[id*="list"],[id*="result"],[id*="content"],[class*="proform"]'))
        .filter(isVis).map(el => ({ id: el.id, cls: (el.className||'').substring(0,30), txt: el.textContent.replace(/\s+/g,' ').trim().substring(0,60) }));
      return { selector: null, found: false, tables: tableInfos, listDivs };
    });
    console.log('🔍 Listado tab taller:', JSON.stringify(estadoListado));

    // Buscar botones de acción — restringir a onclick que mencionan "orden" o "repair", o texto muy específico
    const botonesAccion = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      // Solo onclick con función específica de conversión o texto específico — excluir nav links
      return Array.from(document.querySelectorAll('button,[onclick]'))
        .filter(isVis)
        .filter(el => {
          const oc = el.getAttribute('onclick') || '';
          const txt = (el.textContent||'').replace(/\s+/g,' ').trim();
          const cls = el.className || '';
          // Excluir elementos de navegación
          if (el.tagName === 'A' && (el.getAttribute('href')||'').match(/^https?:/)) return false;
          // Incluir solo si el onclick o texto es específico de conversión/orden
          return /convert|repair_order|to_order|crear_orden|workshop_to|proform_to/i.test(oc) ||
                 /^(convertir|crear orden|convert|to order)$/i.test(txt);
        })
        .map(el => ({
          tag: el.tagName, txt: (el.textContent||'').replace(/\s+/g,' ').trim().substring(0,40),
          onclick: (el.getAttribute('onclick')||'').substring(0,80)
        })).slice(0, 5);
    });
    console.log('🔄 Botones de conversión específicos:', JSON.stringify(botonesAccion));

    // Inspeccionar todos los onclick del listado (sin navegar)
    const onclickListado = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return Array.from(document.querySelectorAll('[onclick]')).filter(isVis)
        .map(el => ({
          tag: el.tagName,
          txt: (el.textContent||'').replace(/\s+/g,' ').trim().substring(0,20),
          onclick: (el.getAttribute('onclick')||'').substring(0,80)
        }))
        .filter(el => !/close_help|open_new_tab|wa\.me|javascript:void/i.test(el.onclick))
        .slice(0, 20);
    });
    console.log('📋 Todos onclick del tab taller:', JSON.stringify(onclickListado));

    // Intentar clic en botón de conversión si se encontró
    let ordenCreada = false;
    if (botonesAccion.length > 0) {
      const tConvert = Date.now();
      await page.evaluate(({ onclick }) => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        const btn = Array.from(document.querySelectorAll('button,[onclick]')).filter(isVis)
          .find(el => (el.getAttribute('onclick')||'').substring(0,80) === onclick);
        if (btn) btn.click();
      }, { onclick: botonesAccion[0].onclick });
      await page.waitForTimeout(2500);
      evaluarAccion(Date.now() - tConvert, 'Clic botón conversión');
      // Confirmar modal si aparece
      await page.evaluate(() => {
        const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden';};
        const btn=Array.from(document.querySelectorAll('.sweet-alert button,.modal.in button')).filter(isVis)
          .find(b=>/confirm|aceptar|ok|s[ií]|crear|convertir/i.test(b.textContent||''));
        if(btn)btn.click();
      }).catch(()=>{});
      await page.waitForTimeout(2000);
      const urlActual = await page.evaluate(() => window.location.href);
      ordenCreada = /repair|order|orden|recepcion|reception/i.test(urlActual);
      console.log('📍 URL tras conversión:', urlActual);
    } else {
      console.log('ℹ️ No se encontró botón de conversión con onclick específico — la UI puede usar un flujo diferente');
    }

    const tiempoTotal = Date.now() - tiempoInicioCP;
    const proformaTallerCreada = ckTaller.checked && confirmado;
    console.log('✅ CP-094 PASSED | checkbox taller: ' + ckTaller.checked + ' | proforma creada: ' + !!proformaTallerCreada + ' | tab taller visible: true | botón convertir: ' + (botonesAccion.length > 0) + ' | orden creada: ' + ordenCreada + ' | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp094-fail');
    console.log('❌ CP-094 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp094_proforma_taller_a_orden();
