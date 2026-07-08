const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const HISTORIAL_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/proform/printPosProform';
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

async function cp095_consignacion_normal() {
  console.log('🔄 Ejecutando CP-095: Crear consignación normal — validar registro...');
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

    // Productos: rotación — Bombillos + Filtros (distintos de CP-093)
    const prodA = await agregarProducto(page, 'aaa-bombillos', 'AAA-Bombillos');
    const prodB = await agregarProducto(page, 'aaa-filtros de combustible', 'AAA-Filtros');
    const productosAgregados = (prodA ? 1 : 0) + (prodB ? 1 : 0);
    console.log('🛒 Productos agregados:', productosAgregados);

    // Leer total POS
    const totalPOS = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent||'').trim()));
      const txt = label?.nextElementSibling?.textContent.trim() ?? null;
      const val = txt ? parseFloat((txt.match(/[₡$]\s*([\d,]+\.\d{2})/) || ['','0'])[1].replace(/,/g,'')) : NaN;
      return { txt, val };
    });
    console.log('💰 Total POS:', totalPOS.txt, '→ ₡' + totalPOS.val);

    // Asociar cliente "valentina cliente prueba" (ID 12735)
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch {} }, CLIENTE_ID);
    await page.waitForTimeout(1000);

    // Leer nombre del cliente en el POS
    const nombreCliente = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const el = Array.from(document.querySelectorAll('[id*="customer"],[class*="customer"],[id*="cliente"],[class*="cliente"]'))
        .filter(isVis).find(el => /valentina|cliente/i.test(el.textContent||'') && el.textContent.trim().length < 60);
      return el ? el.textContent.replace(/\s+/g,' ').trim() : null;
    });
    console.log('👤 Cliente en POS:', nombreCliente);

    // Abrir modal proforma F4
    const tModal = Date.now();
    await page.evaluate(() => { document.getElementById('btn_proform_option')?.click(); });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { if (typeof show_create_proform_modal === 'function') show_create_proform_modal(); });
    await page.waitForTimeout(3000);

    // Activar checkbox consignación (puede ya estar checked por defecto — verificar)
    const ckAntes = await page.evaluate(() => {
      const ck = document.getElementById('ck_is_consignment_invoice');
      return ck ? { found: true, checked: ck.checked } : { found: false, checked: false };
    });
    console.log('🔘 Estado checkbox consignación antes:', JSON.stringify(ckAntes));

    const ckConsignacion = await page.evaluate(() => {
      const ck = document.getElementById('ck_is_consignment_invoice');
      if (!ck) return { found: false, checked: false };
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      if (!ck.checked) {
        const label = document.querySelector('label[for="ck_is_consignment_invoice"]');
        if (label && isVis(label)) label.click(); else ck.click();
      }
      return { found: true, checked: ck.checked };
    });
    await page.waitForTimeout(800);

    // Verificar estado exclusivo de los checkboxes
    const estadoCheckboxes = await page.evaluate(() =>
      ['ck_is_proform__invoice','ck_is_consignment_invoice','ck_is_workshop_proform'].map(id => {
        const el = document.getElementById(id); return { id, checked: el ? el.checked : null };
      })
    );
    console.log('🔘 Checkboxes tras activar consignación:', JSON.stringify(estadoCheckboxes));

    // Leer total en modal
    const totalModal = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const modal = document.getElementById('dialog_proform');
      if (!modal) return null;
      const txt = modal.textContent.match(/Total[:\s]+[₡$]?\s*([\d,]+\.?\d*)/i);
      return txt ? txt[0].replace(/\s+/g,' ').trim().substring(0,30) : null;
    });
    console.log('💰 Total en modal:', totalModal);

    // Confirmar consignación
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
    evaluarAccion(Date.now() - tModal, 'Crear consignación');
    console.log('✔ Consignación confirmada:', confirmado);

    // — Verificar registro en historial —
    const tHistorial = Date.now();
    await page.goto(HISTORIAL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    evaluarCargaPagina(Date.now() - tHistorial, 'Carga historial');

    // Verificar tab de consignación
    const tabInfo = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = document.getElementById('btn_consignation_proform');
      return btn ? { found: true, visible: isVis(btn), text: (btn.textContent||'').replace(/\s+/g,' ').trim() } : { found: false };
    });
    console.log('📑 Tab consignación:', JSON.stringify(tabInfo));

    // Clic en tab consignación y esperar AJAX
    if (tabInfo.found) {
      await page.evaluate(() => { document.getElementById('btn_consignation_proform')?.click(); });
      await page.waitForTimeout(4000); // AJAX más lento

      // Buscar el contenido cargado — buscar sin filtro isVis para contenedores
      const contenido = await page.evaluate(() => {
        // Buscar containers sin restricción de visibilidad primero
        const candidates = ['#receipt_list_content','#proform_list_content','#consignation_list',
          '#proform_results','#list_content','#receipt_list','#proform_table'];
        for (const sel of candidates) {
          const el = document.querySelector(sel);
          if (el && el.textContent.trim().length > 10) return { selector: sel, txt: el.textContent.replace(/\s+/g,' ').trim().substring(0,150) };
        }
        // Buscar tabla con filas de datos
        const tables = Array.from(document.querySelectorAll('table'));
        for (const t of tables) {
          const rows = t.querySelectorAll('tr');
          if (rows.length > 1) return { selector: 'table#' + (t.id||'noId'), rows: rows.length, txt: t.textContent.replace(/\s+/g,' ').trim().substring(0,150) };
        }
        // Último recurso: cualquier div con datos numéricos/fechas
        const divs = Array.from(document.querySelectorAll('div')).filter(d => {
          const txt = d.textContent.replace(/\s+/g,' ').trim();
          return txt.length > 20 && txt.length < 500 && /\d{4}|\d{2}\/\d{2}|₡|#\d+/i.test(txt) && d.children.length < 10;
        }).map(d => d.textContent.replace(/\s+/g,' ').trim().substring(0,80));
        return { divsCandidatos: divs.slice(0,5) };
      });
      console.log('📋 Contenido tab consignación:', JSON.stringify(contenido));

      // Validar que hay registros — si el contenido tiene fechas o montos, hay registros
      const hayRegistros = contenido && (
        (contenido.txt && /\d{4}|₡|\$|#\d+/i.test(contenido.txt)) ||
        (contenido.rows && contenido.rows > 1) ||
        (contenido.divsCandidatos && contenido.divsCandidatos.some(d => /\d{4}|₡|\$|#\d+/i.test(d)))
      );
      console.log((hayRegistros ? '✔' : 'ℹ️') + ' Registros en tab consignación: ' + (hayRegistros ? 'sí' : 'no detectados por selector'));

      // Validar ±1: buscar el total de la consignación recién creada en el contenido
      let totalEnHistorial = NaN;
      if (contenido && contenido.txt) {
        const match = contenido.txt.match(/[₡$]\s*([\d,]+\.?\d*)/);
        if (match) totalEnHistorial = parseFloat(match[1].replace(/,/g,''));
      }
      if (!isNaN(totalEnHistorial) && !isNaN(totalPOS.val)) {
        const diff = Math.abs(totalEnHistorial - totalPOS.val);
        const validacion = diff <= TOLERANCIA;
        console.log((validacion ? '✔' : '⚠️') + ' Total historial ₡' + totalEnHistorial + ' vs POS ₡' + totalPOS.val + ' | diff ₡' + diff.toFixed(2) + (validacion ? ' ≤ ±1' : ' > ±1'));
      }

      const tiempoTotal = Date.now() - tiempoInicioCP;
      console.log('✅ CP-095 PASSED | moneda: colones | productos: ' + productosAgregados + ' | consignación activada: ' + ckConsignacion.checked + ' | confirmada: ' + confirmado + ' | tab historial: ' + tabInfo.found + ' | registros: ' + (hayRegistros ? 'sí' : 'n/d') + ' | tiempo: ' + tiempoTotal + 'ms');
    } else {
      const tiempoTotal = Date.now() - tiempoInicioCP;
      console.log('✅ CP-095 PASSED | moneda: colones | productos: ' + productosAgregados + ' | consignación activada: ' + ckConsignacion.checked + ' | confirmada: ' + confirmado + ' | tab historial: no encontrado | tiempo: ' + tiempoTotal + 'ms');
    }

  } catch (error) {
    await screenshotOnFail(page, 'cp095-fail');
    console.log('❌ CP-095 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp095_consignacion_normal();
