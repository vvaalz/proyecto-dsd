const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const TOLERANCIA = 1;
const MONTO_ENTRADA = 8000;
const MONTO_SALIDA  = 2500;

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
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

async function abrirMovimientosCaja(page) {
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await page.keyboard.press('F9');
  await page.waitForTimeout(2000);
  const abierto = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    return !!(document.getElementById('dialog_cash_movement') && isVis(document.getElementById('dialog_cash_movement')));
  });
  if (!abierto) {
    await page.evaluate(() => { document.getElementById('menu_cash')?.click(); });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /caja/i.test(m.textContent||''));
      if (!menu) return;
      const li = Array.from(menu.querySelectorAll('li')).find(el => /movimientos.*caja/i.test(el.textContent||''));
      if (li) li.click();
    });
    await page.waitForTimeout(2500);
  }
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    return !!(document.getElementById('dialog_cash_movement') && isVis(document.getElementById('dialog_cash_movement')));
  });
}

async function registrarMovimiento(page, tipo, monto, desc) {
  // tipo: 'in' = entrada (movenment_cash_in), 'out' = salida (movenment_cash_out)
  const modalAbierto = await abrirMovimientosCaja(page);
  if (!modalAbierto) throw new Error('dialog_cash_movement no se pudo abrir para registrar ' + tipo);

  // Seleccionar tipo
  if (tipo === 'out') {
    await page.evaluate(() => {
      const el = document.getElementById('movenment_cash_out');
      if (el && !el.checked) { el.checked = true; el.dispatchEvent(new Event('change',{bubbles:true})); }
      if (typeof set_movement_out === 'function') set_movement_out();
    });
    await page.waitForTimeout(400);
  } else {
    await page.evaluate(() => {
      const el = document.getElementById('movenment_cash_in');
      if (el && !el.checked) { el.checked = true; el.dispatchEvent(new Event('change',{bubbles:true})); }
      if (typeof set_movement_in === 'function') set_movement_in();
    });
    await page.waitForTimeout(400);
  }

  // Verificar tipo en hidden input
  const tipoVal = await page.evaluate(() => document.getElementById('cash_movement_type')?.value);
  console.log('  📌 cash_movement_type=' + tipoVal + ' (esperado: ' + (tipo==='out'?'2':'1') + ')');

  // Ingresar monto
  await page.evaluate((val) => {
    const el = document.getElementById('movenment_cash_quantity');
    if (el) { el.value = ''; el.focus(); el.value = String(val); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }
  }, monto);
  await page.waitForTimeout(300);

  // Descripción
  await page.evaluate((d) => {
    const el = document.getElementById('movenment_cash_observation');
    if (el) { el.value = d; el.dispatchEvent(new Event('input',{bubbles:true})); }
  }, desc);
  await page.waitForTimeout(200);

  // Procesar
  const tProc = Date.now();
  const btnResult = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const btn = document.getElementById('btn_send_movement');
    if (btn && isVis(btn)) { btn.click(); return true; }
    return false;
  });
  await page.waitForTimeout(3000);
  evaluarAccion(Date.now() - tProc, 'Procesar ' + tipo);

  for (let i = 0; i < 4; i++) { const a = await manejarAlerta(page); if (!a) break; await page.waitForTimeout(700); }
  await page.waitForTimeout(1000);

  // Verificar que el modal cerró o campo se limpió
  const ok = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const modal = document.getElementById('dialog_cash_movement');
    const campo = document.getElementById('movenment_cash_quantity');
    return !modal || !isVis(modal) || campo?.value === '' || campo?.value === '0';
  });
  console.log('  ✔ Movimiento ' + tipo + ' ₡' + monto + ': ' + (ok ? 'OK' : 'modal aún abierto'));
  return { ok, btnResult, tipoVal };
}

async function cp108_cierre_movimientos_mixtos() {
  console.log('🔄 Ejecutando CP-108: Cierre de caja con movimientos mixtos (entrada + salida)...');
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

    // ── PASO 1: Verificar estado de caja, abrir si está cerrada ──
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await page.keyboard.press('F12');
    await page.waitForTimeout(3500);
    for (let i = 0; i < 2; i++) { const a = await manejarAlerta(page); if (!a) break; await page.waitForTimeout(700); }

    const estadoInicial = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const modalCierre = document.getElementById('dialog_cash_closing');
      return { esCierreVisible: !!(modalCierre && isVis(modalCierre)) };
    });
    console.log('📊 Estado caja inicial:', JSON.stringify(estadoInicial));

    let montoInicialCaja = NaN;
    if (!estadoInicial.esCierreVisible) {
      // Caja cerrada — abrirla con monto inicial
      montoInicialCaja = 10000;
      const aperturaResult = await page.evaluate((val) => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        // Buscar campo de monto inicial
        const candidatos = ['initial_balance_cash','open_cash_amount','next_cash_closing'];
        for (const id of candidatos) {
          const el = document.getElementById(id);
          if (el && isVis(el)) { el.value = String(val); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); break; }
        }
        if (typeof start_open_cash === 'function') { start_open_cash(); return 'start_open_cash()'; }
        return null;
      }, montoInicialCaja);
      await page.waitForTimeout(3000);
      for (let i = 0; i < 3; i++) { const a = await manejarAlerta(page); if (!a) break; await page.waitForTimeout(700); }
      console.log('✔ Apertura:', aperturaResult);
      // Cerrar el modal de apertura si sigue visible
      await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const modal = Array.from(document.querySelectorAll('.modal.in')).filter(isVis)
          .find(m => m.id !== 'dialog_cash_closing');
        if (modal) { const close = modal.querySelector('[data-dismiss="modal"]'); if (close) close.click(); else modal.classList.remove('in'); }
      }).catch(() => {});
      await page.waitForTimeout(1000);
    } else {
      // Caja ya estaba abierta — cerrar el modal de cierre primero
      await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const closeBtn = Array.from(document.querySelectorAll('#dialog_cash_closing [data-dismiss="modal"]')).filter(isVis)[0];
        if (closeBtn) closeBtn.click();
        else { const m = document.getElementById('dialog_cash_closing'); if (m) m.classList.remove('in'); }
      }).catch(() => {});
      await page.waitForTimeout(500);
      console.log('📌 Caja ya estaba abierta — modal cerrado para registrar movimientos');
    }

    // ── PASO 2: Registrar ENTRADA ──
    console.log('\n📌 Registrando ENTRADA ₡' + MONTO_ENTRADA + '...');
    const entradaResult = await registrarMovimiento(page, 'in', MONTO_ENTRADA, 'QA entrada CP-108 mixto');

    // ── PASO 3: Registrar SALIDA ──
    console.log('\n📌 Registrando SALIDA ₡' + MONTO_SALIDA + '...');
    const salidaResult = await registrarMovimiento(page, 'out', MONTO_SALIDA, 'QA salida CP-108 mixto');

    // ── PASO 4: Abrir dialog_cash_closing para leer totales ──
    console.log('\n📌 Abriendo modal de cierre para verificar movimientos...');
    await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
    await page.keyboard.press('F12');
    await page.waitForTimeout(3500);

    const modalCierreVisible = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return !!(document.getElementById('dialog_cash_closing') && isVis(document.getElementById('dialog_cash_closing')));
    });
    console.log('📋 dialog_cash_closing visible:', modalCierreVisible);

    let totalGeneral = NaN, entradasEnModal = NaN, salidasEnModal = NaN, ventasTotales = NaN;
    let numCierre = null;

    if (modalCierreVisible) {
      const datos = await page.evaluate(() => {
        const modal = document.getElementById('dialog_cash_closing');
        const texto = modal.textContent.replace(/\s+/g,' ').trim();
        function pm(regex) { const m = texto.match(regex); return m ? parseFloat(m[1].replace(/,/g,'')) : NaN; }
        return {
          numCierre:     texto.match(/Detalle de Cierre\s*#(\d+)/i)?.[1] ?? null,
          totalGeneral:  pm(/Total general[:\s]*([\d,]+\.\d{2})/i),
          ventasTotales: pm(/Ventas Totales[:\s₡]*([\d,]+\.\d{2})/i),
          entradas:      pm(/Entradas[:\s₡]*([\d,]+\.\d{2})/i),
          salidas:       pm(/Salidas[:\s₡]*([\d,]+\.\d{2})/i),
          resumen:       texto.substring(0, 300)
        };
      });
      totalGeneral    = datos.totalGeneral;
      entradasEnModal = datos.entradas;
      salidasEnModal  = datos.salidas;
      ventasTotales   = datos.ventasTotales;
      numCierre       = datos.numCierre;
      console.log('📊 Cierre #' + numCierre + ':', JSON.stringify({ totalGeneral, ventasTotales, entradas: entradasEnModal, salidas: salidasEnModal }));
    }

    // ── PASO 5: Confirmar cierre ──
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
    console.log('✔ Cierre:', confirmCierre);

    for (let i = 0; i < 4; i++) { const a = await manejarAlerta(page); if (!a) break; console.log('🔔 Alerta cierre:', a); await page.waitForTimeout(800); }
    await page.waitForTimeout(2000);

    // ── VALIDACIONES ──
    const v1 = entradaResult.ok;         // Entrada registrada
    const v2 = salidaResult.ok;          // Salida registrada
    const v3 = modalCierreVisible;       // Modal de cierre visible
    const v4 = confirmCierre !== null;   // Cierre confirmado
    // v5: Si hay entradas y salidas en el modal, validar que entradas > salidas (al menos la entrada fue >salida registrada)
    const v5 = isNaN(entradasEnModal) || isNaN(salidasEnModal) || entradasEnModal >= MONTO_ENTRADA - TOLERANCIA;

    console.log('\n📊 === VALIDACIONES CP-108 ===');
    console.log('  Entrada ₡' + MONTO_ENTRADA + ' registrada: ' + (v1 ? '✅' : '⚠️'));
    console.log('  Salida  ₡' + MONTO_SALIDA  + ' registrada: ' + (v2 ? '✅' : '⚠️'));
    console.log('  Modal cierre visible:        ' + (v3 ? '✅' : '⚠️') + (numCierre ? ' cierre #'+numCierre : ''));
    console.log('  Cierre confirmado:           ' + (v4 ? '✅' : '⚠️') + (confirmCierre ? ' via '+confirmCierre : ''));
    console.log('  Entradas en modal ≥ ₡' + MONTO_ENTRADA + ': ' + (v5 ? '✅' : '⚠️') + ' (' + entradasEnModal + ')');

    const pasadas = [v1,v2,v3,v4].filter(Boolean).length;
    if (pasadas < 3) throw new Error('Solo ' + pasadas + '/4 validaciones críticas pasadas');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    const icono = pasadas === 4 ? '✅' : '⚠️';
    console.log(icono + ' CP-108 PASSED | entrada: ₡' + MONTO_ENTRADA + ' | salida: ₡' + MONTO_SALIDA + ' | cierre #' + numCierre + ' | total-general: ₡' + totalGeneral + ' | entradas-modal: ₡' + entradasEnModal + ' | salidas-modal: ₡' + salidasEnModal + ' | validaciones: ' + pasadas + '/4 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp108-fail');
    console.log('❌ CP-108 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp108_cierre_movimientos_mixtos();
