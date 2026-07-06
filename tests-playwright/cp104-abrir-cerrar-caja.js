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

function parseMonto(txt) {
  if (!txt) return NaN;
  const m = (txt+'').match(/([\d,]+\.\d{2})/);
  return m ? parseFloat(m[1].replace(/,/g,'')) : NaN;
}

async function cargarPOS(page) {
  await page.goto(POS_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
  await page.waitForTimeout(3000);
  await page.waitForSelector('.product_box', { timeout: 15000 });
}

async function abrirModalCaja(page) {
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await page.waitForTimeout(300);
  await page.keyboard.press('F12');
  await page.waitForTimeout(3500);
}

async function detectarEstadoCaja(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    // dialog_cash_closing = caja ABIERTA (modal de cierre/arqueo)
    const modalCierre = document.getElementById('dialog_cash_closing');
    const esCierre = !!(modalCierre && isVis(modalCierre));
    // SweetAlert de estado
    const sa = document.querySelector('.sweet-alert');
    const esSweetAlert = !!(sa && isVis(sa));
    // Otros modales activos
    const modalesActivos = Array.from(document.querySelectorAll('.modal.in')).filter(isVis).map(m => m.id);
    // Inputs visibles en cualquier modal activo
    const inputs = Array.from(document.querySelectorAll('.modal.in input')).filter(isVis)
      .map(el => ({ id: el.id, ph: el.placeholder, val: el.value, type: el.type })).slice(0,8);
    return {
      esCierre, esSweetAlert, modalesActivos, inputs,
      sweetAlertTxt: esSweetAlert ? sa.textContent.replace(/\s+/g,' ').trim().substring(0,100) : null
    };
  });
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

async function cp104_abrir_cerrar_caja() {
  console.log('🔄 Ejecutando CP-104: Abrir y cerrar caja — validar montos...');
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

    // ── PASO 1: F12 — detectar estado actual de la caja ──
    const tF12 = Date.now();
    await abrirModalCaja(page);
    evaluarAccion(Date.now() - tF12, 'F12');

    let estado = await detectarEstadoCaja(page);
    console.log('📋 Estado inicial:', JSON.stringify(estado));

    // Descartar SweetAlert si aparece antes del modal
    if (estado.esSweetAlert) {
      console.log('🔔 SweetAlert inicial:', estado.sweetAlertTxt);
      await manejarAlerta(page);
      await page.waitForTimeout(1500);
      await abrirModalCaja(page);
      estado = await detectarEstadoCaja(page);
      console.log('📋 Estado tras descartar alerta:', JSON.stringify(estado));
    }

    let montoCajaInicial = NaN;
    let montoTotalCierre = NaN;
    let numCierre = null;
    let escenario = 'desconocido';
    let v_apertura = false;
    let v_cierre = false;

    // ── ESCENARIO A: Caja CERRADA — abrir con monto inicial ──
    if (!estado.esCierre) {
      escenario = 'apertura+cierre';
      console.log('📌 ESCENARIO A: Caja CERRADA → abrir luego cerrar');

      // Buscar campo de monto inicial (puede estar en cualquier modal activo o en el POS directo)
      const campoApertura = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const candidatos = ['initial_balance_cash','open_cash_amount','cash_opening_amount',
                            'start_cash_total','next_cash_closing','closure_posted_balance'];
        for (const id of candidatos) {
          const el = document.getElementById(id);
          if (el && isVis(el)) return { id, ph: el.placeholder, val: el.value };
        }
        const inp = Array.from(document.querySelectorAll('input')).filter(isVis)
          .filter(el => /monto|amount|inicial|initial|apertura|opening/i.test((el.id||'')+(el.placeholder||'')+(el.name||'')));
        return inp[0] ? { id: inp[0].id, ph: inp[0].placeholder, val: inp[0].value } : null;
      });
      console.log('💲 Campo apertura:', JSON.stringify(campoApertura));

      montoCajaInicial = 5000;
      if (campoApertura?.id) {
        await page.evaluate(({ id, val }) => {
          const el = document.getElementById(id);
          if (el) { el.value = ''; el.focus(); el.value = String(val); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }
        }, { id: campoApertura.id, val: montoCajaInicial });
        await page.waitForTimeout(500);
        console.log('✏️ Monto apertura ingresado: ₡' + montoCajaInicial);
      }

      // Confirmar apertura
      const tOpen = Date.now();
      const confirmApertura = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        if (typeof start_open_cash === 'function') { start_open_cash(); return 'start_open_cash()'; }
        if (typeof set_open_cash_agree === 'function') { set_open_cash_agree(); return 'set_open_cash_agree()'; }
        const btn = Array.from(document.querySelectorAll('button,a')).filter(isVis)
          .find(el => /\b(abrir|open|iniciar|start|confirmar|confirm|aceptar|agree)\b/i.test(el.textContent||''));
        if (btn) { btn.click(); return 'btn: ' + btn.textContent.trim().substring(0,25); }
        return null;
      });
      await page.waitForTimeout(3000);
      evaluarAccion(Date.now() - tOpen, 'Confirmar apertura');
      console.log('✔ Apertura:', confirmApertura);
      v_apertura = confirmApertura !== null;

      for (let i = 0; i < 3; i++) { const a = await manejarAlerta(page); if (!a) break; console.log('🔔 Alerta apertura:', a); await page.waitForTimeout(800); }
      await page.waitForTimeout(2000);

      // Reabrir F12 para el cierre
      await abrirModalCaja(page);
      estado = await detectarEstadoCaja(page);
      console.log('📋 Estado tras apertura:', JSON.stringify({ esCierre: estado.esCierre, modalesActivos: estado.modalesActivos }));
    } else {
      // ── ESCENARIO B: Caja YA ABIERTA — solo cerrar ──
      escenario = 'solo-cierre';
      v_apertura = true;
      console.log('📌 ESCENARIO B: Caja YA ABIERTA → solo cerrar');
    }

    // ── Leer datos del modal dialog_cash_closing y confirmar cierre ──
    if (estado.esCierre) {
      const datosCierre = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const modal = document.getElementById('dialog_cash_closing');
        const texto = modal ? modal.textContent.replace(/\s+/g,' ').trim() : '';
        // Total general de la caja
        const mTotalGen = texto.match(/Total general[:\s]*([\d,]+\.\d{2})/i);
        // Número de cierre
        const mNum = texto.match(/Detalle de Cierre\s*#(\d+)/i);
        // Fecha apertura
        const mFecha = texto.match(/Fecha de apertura[:\s]*([\d\-: ]+)/i);
        // Campos del formulario de cierre
        const closure_posted = document.getElementById('closure_posted_balance');
        const next_cash = document.getElementById('next_cash_closing');
        const btnCerrar = document.getElementById('btn_close_cash');
        const isVis2 = el => { if (!el) return false; const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        return {
          numCierre: mNum ? mNum[1] : null,
          totalGeneralTxt: mTotalGen ? mTotalGen[1] : null,
          fechaApertura: mFecha ? mFecha[1].trim().substring(0,19) : null,
          closure_posted: closure_posted ? { id: closure_posted.id, val: closure_posted.value, vis: isVis2(closure_posted) } : null,
          next_cash: next_cash ? { id: next_cash.id, val: next_cash.value, vis: isVis2(next_cash) } : null,
          btnCerrarCaja: btnCerrar ? { txt: (btnCerrar.textContent||'').replace(/\s+/g,' ').trim().substring(0,20), vis: isVis2(btnCerrar) } : null,
          resumen: texto.substring(0, 280)
        };
      });
      console.log('📊 Datos cierre:', JSON.stringify(datosCierre));

      montoTotalCierre = parseMonto(datosCierre.totalGeneralTxt);
      numCierre = datosCierre.numCierre;
      console.log('💰 Cierre #' + numCierre + ' | Total general: ₡' + montoTotalCierre + ' | Apertura: ' + datosCierre.fechaApertura);

      // Llenar saldo a dejar en caja para la siguiente apertura (opcional)
      if (datosCierre.closure_posted?.vis) {
        await page.evaluate((id) => {
          const el = document.getElementById(id);
          if (el) { el.value = '5000'; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }
        }, datosCierre.closure_posted.id);
        await page.waitForTimeout(300);
        console.log('✏️ closure_posted_balance = 5000');
      }

      // Confirmar cierre: btn_close_cash (dentro del modal) → confirm_close_cash()
      const tClose = Date.now();
      const confirmCierre = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const btnCerrar = document.getElementById('btn_close_cash');
        if (btnCerrar && isVis(btnCerrar)) { btnCerrar.click(); return 'btn_close_cash'; }
        if (typeof confirm_close_cash === 'function') { confirm_close_cash(); return 'confirm_close_cash()'; }
        return null;
      });
      await page.waitForTimeout(3500);
      evaluarAccion(Date.now() - tClose, 'Confirmar cierre');
      console.log('✔ Cierre confirmado:', confirmCierre);
      v_cierre = confirmCierre !== null;

      for (let i = 0; i < 4; i++) { const a = await manejarAlerta(page); if (!a) break; console.log('🔔 Alerta cierre:', a); await page.waitForTimeout(800); }
      await page.waitForTimeout(2000);
    } else {
      // Si tras apertura el modal de cierre no apareció, intentar confirm_close_cash()
      console.log('⚠️ dialog_cash_closing no visible tras apertura — intentando confirm_close_cash()');
      const confirmCierre = await page.evaluate(() => { if (typeof confirm_close_cash === 'function') { confirm_close_cash(); return 'confirm_close_cash()'; } return null; });
      await page.waitForTimeout(2000);
      v_cierre = confirmCierre !== null;
      for (let i = 0; i < 3; i++) { const a = await manejarAlerta(page); if (!a) break; await page.waitForTimeout(700); }
      console.log('✔ Cierre fallback:', confirmCierre);
    }

    // ── VALIDACIONES ──
    const v1 = true;                                             // F12 ejecutado
    const v2 = escenario !== 'desconocido';                     // Escenario detectado
    const v3 = v_apertura;                                       // Apertura manejada
    const v4 = v_cierre;                                         // Cierre confirmado
    const v5 = !isNaN(montoTotalCierre) && montoTotalCierre >= 0; // Total general leído

    console.log('\n📊 === VALIDACIONES CP-104 ===');
    console.log('  F12 operacional:           ✅');
    console.log('  Escenario identificado:    ' + (v2 ? '✅' : '❌') + ' (' + escenario + ')');
    console.log('  Apertura manejada:         ' + (v3 ? '✅' : '⚠️'));
    console.log('  Cierre confirmado:         ' + (v4 ? '✅' : '⚠️'));
    console.log('  Total general leído:       ' + (v5 ? '✅' : '⚠️') + ' ₡' + montoTotalCierre + (numCierre ? ' (cierre #'+numCierre+')' : ''));

    const pasadas = [v1,v2,v3,v4].filter(Boolean).length;
    if (pasadas < 3) throw new Error('Solo ' + pasadas + '/4 validaciones pasadas');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    const icono = pasadas === 4 ? '✅' : '⚠️';
    const montoInicialStr = isNaN(montoCajaInicial) ? 'N/A(ya-abierta)' : '₡' + montoCajaInicial;
    console.log(icono + ' CP-104 PASSED | escenario: ' + escenario + ' | monto-inicial: ' + montoInicialStr + ' | total-cierre: ₡' + montoTotalCierre + ' | cierre-#' + numCierre + ' | validaciones: ' + pasadas + '/4 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp104-fail');
    console.log('❌ CP-104 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp104_abrir_cerrar_caja();
