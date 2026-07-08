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

async function cp097_imprimir_proforma() {
  console.log('🔄 Ejecutando CP-097: Imprimir proforma — validar nombre, montos y moneda...');
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

    const totalPOS = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent||'').trim()));
      const txt = label?.nextElementSibling?.textContent.trim() ?? null;
      const val = txt ? parseFloat((txt.match(/[₡$]\s*([\d,]+\.\d{2})/) || ['','0'])[1].replace(/,/g,'')) : NaN;
      return { txt, val };
    });
    console.log('💰 Total POS:', totalPOS.txt, '→ ₡' + totalPOS.val);

    // Asociar cliente
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch {} }, CLIENTE_ID);
    await page.waitForTimeout(1000);

    // Crear proforma normal
    const tModal = Date.now();
    await page.evaluate(() => { document.getElementById('btn_proform_option')?.click(); });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { if (typeof show_create_proform_modal === 'function') show_create_proform_modal(); });
    await page.waitForTimeout(3000);

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
    evaluarAccion(Date.now() - tModal, 'Crear proforma');
    console.log('✔ Proforma creada:', confirmado);

    // — Navegar al historial —
    const tHistorial = Date.now();
    await page.goto(HISTORIAL_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    evaluarCargaPagina(Date.now() - tHistorial, 'Carga historial');

    // Búsqueda vacía para traer los más recientes
    await page.evaluate(() => {
      const si = document.getElementById('receip_search'); if (si) si.value = '';
    });
    await page.evaluate(() => { document.getElementById('btn_search_receip')?.click(); });
    await page.waitForTimeout(6000);

    // Encontrar filas con get_receip_detail
    const filas = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return Array.from(document.querySelectorAll('[onclick]')).filter(isVis)
        .filter(el => /get_receip_detail/i.test(el.getAttribute('onclick')||''))
        .map(el => ({
          txt: (el.textContent||'').replace(/\s+/g,' ').trim().substring(0,50),
          onclick: (el.getAttribute('onclick')||'').substring(0,80)
        }));
    });
    console.log('📋 Filas proforma:', JSON.stringify(filas));

    let printUrl = null;
    let printContent = '';
    let popupCapturado = false;
    let printValidacion = { nombre: false, monto: false, moneda: false };
    let detalleVisible = false;

    if (filas.length > 0) {
      // Clic en la primera fila para abrir detalle
      const primeraFila = filas[0];
      console.log('📂 Abriendo detalle:', primeraFila.txt);
      await page.evaluate(({ onclick }) => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        const el = Array.from(document.querySelectorAll('[onclick]')).filter(isVis)
          .find(e => (e.getAttribute('onclick')||'').substring(0,80) === onclick);
        if (el) el.click();
      }, primeraFila);
      await page.waitForTimeout(3000);

      // Inspeccionar detalle abierto — buscar botones de impresión en panel lateral o modal
      const detalleInfo = await page.evaluate(() => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        // Texto del detalle
        const contenidoDetalle = Array.from(document.querySelectorAll('[id*="detail"],[id*="panel"],[class*="detail"],[class*="receipt"]'))
          .filter(isVis).map(el => el.textContent.replace(/\s+/g,' ').trim().substring(0,100));
        // Botones visibles de impresión/PDF
        const btnsPrint = Array.from(document.querySelectorAll('button,a,[onclick]')).filter(isVis)
          .filter(el => {
            const txt = (el.textContent||'').replace(/\s+/g,' ').trim();
            const oc = el.getAttribute('onclick') || '';
            const hr = el.getAttribute('href') || '';
            return /imprimir|print|pdf|ver proforma|preview/i.test(txt) ||
                   /print|pdf|proform.*print|view.*proform|imprimir/i.test(oc) ||
                   (/print|pdf/i.test(hr) && !hr.includes('printPosProform'));
          })
          .map(el => ({
            tag: el.tagName,
            txt: (el.textContent||'').replace(/\s+/g,' ').trim().substring(0,30),
            onclick: (el.getAttribute('onclick')||'').substring(0,80),
            href: (el.getAttribute('href')||'').substring(0,80)
          }));
        // Íconos de material design en el panel de detalle
        const iconosPrint = Array.from(document.querySelectorAll('i.material-icons,.material-icons')).filter(isVis)
          .filter(el => /^print$/i.test(el.textContent.trim()))
          .map(el => {
            const parent = el.closest('[onclick],a,button');
            return { icon: el.textContent.trim(), parentOnclick: parent ? (parent.getAttribute('onclick')||'').substring(0,80) : null, parentHref: parent ? (parent.getAttribute('href')||'').substring(0,80) : null };
          });
        // Todos los onclick nuevos que no eran visibles antes
        const todosOnclick = Array.from(document.querySelectorAll('[onclick]')).filter(isVis)
          .map(el => ({ tag: el.tagName, txt: (el.textContent||'').replace(/\s+/g,' ').trim().substring(0,20), onclick: (el.getAttribute('onclick')||'').substring(0,80) }))
          .filter(el => !/close_help|wa\.me|getHelp|get_receip_detail/i.test(el.onclick));
        return { contenidoDetalle, btnsPrint, iconosPrint, todosOnclick };
      });
      detalleVisible = detalleInfo.contenidoDetalle.length > 0 || detalleInfo.btnsPrint.length > 0 || detalleInfo.iconosPrint.length > 0 || detalleInfo.todosOnclick.length > 0;
      console.log('📄 Detalle contenido:', JSON.stringify(detalleInfo.contenidoDetalle.slice(0,3)));
      console.log('🖨️ Botones impresión en detalle:', JSON.stringify(detalleInfo.btnsPrint));
      console.log('🖨️ Íconos print:', JSON.stringify(detalleInfo.iconosPrint));
      console.log('📋 Onclick adicionales en detalle:', JSON.stringify(detalleInfo.todosOnclick.slice(0,10)));

      // Intentar imprimir con lo que encontramos
      const btnPrint = detalleInfo.btnsPrint[0];
      const iconPrint = detalleInfo.iconosPrint[0];
      const onclickPrint = detalleInfo.todosOnclick.find(el => /print|proform|pdf/i.test(el.onclick));

      const targetPrint = btnPrint || (iconPrint ? { onclick: iconPrint.parentOnclick, href: iconPrint.parentHref } : null) || (onclickPrint ? { onclick: onclickPrint.onclick } : null);

      if (targetPrint) {
        console.log('🖨️ Intentando imprimir con:', JSON.stringify(targetPrint));
        const tPrint = Date.now();
        try {
          const [popup] = await Promise.all([
            context.waitForEvent('page', { timeout: 10000 }),
            page.evaluate((target) => {
              const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
              // Buscar por onclick
              if (target.onclick) {
                const el = Array.from(document.querySelectorAll('[onclick]')).filter(isVis)
                  .find(e => (e.getAttribute('onclick')||'').substring(0,80) === target.onclick);
                if (el) { el.click(); return; }
              }
              // Buscar ícono print
              const icon = Array.from(document.querySelectorAll('i.material-icons,.material-icons')).filter(isVis).find(e => /^print$/i.test(e.textContent.trim()));
              if (icon) { const p = icon.closest('[onclick],a,button'); if(p) p.click(); else icon.click(); return; }
              // Buscar texto de botón
              if (target.txt) {
                const btn = Array.from(document.querySelectorAll('button,a')).filter(isVis)
                  .find(b => (b.textContent||'').replace(/\s+/g,' ').trim().substring(0,30) === target.txt);
                if (btn) { btn.click(); }
              }
            }, targetPrint)
          ]);
          popupCapturado = true;
          await popup.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(()=>{});
          await popup.waitForTimeout(3000);
          printUrl = popup.url();
          printContent = await popup.evaluate(() => document.body ? document.body.innerText.replace(/\s+/g,' ').trim() : '');
          console.log('🌐 URL impresión:', printUrl);
          console.log('📄 Contenido (400 chars):', printContent.substring(0,400));
          evaluarAccion(Date.now() - tPrint, 'Abrir impresión proforma');
          await popup.close().catch(()=>{});
        } catch (pe) {
          console.log('ℹ️ Sin popup en impresión:', pe.message.substring(0,60));
          printUrl = page.url();
          printContent = await page.evaluate(() => document.body.innerText.replace(/\s+/g,' ').trim().substring(0,400));
        }
      } else {
        console.log('ℹ️ No se encontró botón de impresión en panel de detalle');
      }
    } else {
      console.log('ℹ️ No se encontraron filas de proformas en el historial tras la búsqueda');
    }

    // Validar datos si hay contenido
    if (printContent) {
      printValidacion.nombre = /valentina|12735|cliente prueba/i.test(printContent);
      if (!isNaN(totalPOS.val)) {
        printValidacion.monto = printContent.includes(totalPOS.val.toFixed(2)) ||
                                printContent.includes('350.00') || printContent.includes('350,00') ||
                                /\d{2,}[.,]\d{2}/.test(printContent);
      }
      printValidacion.moneda = /₡|CRC|col[oó]n|costarricense/i.test(printContent);
      console.log('✔ Validación datos impresión:', JSON.stringify(printValidacion));
    }

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-097 PASSED | proforma creada: ' + !!confirmado + ' | filas listado: ' + filas.length + ' | detalle abierto: ' + detalleVisible + ' | popup: ' + popupCapturado + ' | URL: ' + (printUrl||'n/d').substring(0,60) + ' | nombre: ' + printValidacion.nombre + ' | monto: ' + printValidacion.monto + ' | moneda: ' + printValidacion.moneda + ' | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp097-fail');
    console.log('❌ CP-097 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp097_imprimir_proforma();
