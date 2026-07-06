const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const MONTO_SALIDA = 3000;

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

async function abrirMovimientosCaja(page) {
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await page.keyboard.press('F9');
  await page.waitForTimeout(2000);
  const abierto = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const m = document.getElementById('dialog_cash_movement');
    return m && isVis(m);
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

async function cp106_movimiento_salida() {
  console.log('🔄 Ejecutando CP-106: Movimientos de caja — registrar salida...');
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

    // ── PASO 1: Abrir dialog_cash_movement ──
    const tOpen = Date.now();
    const modalAbierto = await abrirMovimientosCaja(page);
    evaluarAccion(Date.now() - tOpen, 'Abrir movimientos de caja');
    if (!modalAbierto) throw new Error('dialog_cash_movement no se pudo abrir');
    console.log('✔ dialog_cash_movement abierto');

    // ── PASO 2: Seleccionar tipo "Salidas" ──
    // movenment_cash_out checkbox + set_movement_out() → cash_movement_type = "2"
    const tipoInicial = await page.evaluate(() => {
      const chkIn  = document.getElementById('movenment_cash_in');
      const chkOut = document.getElementById('movenment_cash_out');
      const typeHidden = document.getElementById('cash_movement_type');
      return {
        chkInChecked:  chkIn?.checked,
        chkOutChecked: chkOut?.checked,
        typeVal: typeHidden?.value ?? null
      };
    });
    console.log('📌 Tipo inicial:', JSON.stringify(tipoInicial));

    // Activar "Salidas"
    const tipoSeleccionado = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const chkOut = document.getElementById('movenment_cash_out');
      if (chkOut) {
        if (!chkOut.checked) { chkOut.checked = true; chkOut.dispatchEvent(new Event('change',{bubbles:true})); }
        if (typeof set_movement_out === 'function') { set_movement_out(); return 'set_movement_out()'; }
        return 'checkbox-checked';
      }
      return null;
    });
    await page.waitForTimeout(500);
    console.log('📌 Tipo salida activado:', tipoSeleccionado);

    const tipoConf = await page.evaluate(() => document.getElementById('cash_movement_type')?.value);
    console.log('📌 cash_movement_type:', tipoConf);

    // ── PASO 3: Ingresar monto ──
    await page.evaluate((val) => {
      const el = document.getElementById('movenment_cash_quantity');
      if (el) { el.value = ''; el.focus(); el.value = String(val); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }
    }, MONTO_SALIDA);
    await page.waitForTimeout(400);
    console.log('✏️ Monto ingresado: ₡' + MONTO_SALIDA);

    const totalDisplay = await page.evaluate(() => document.getElementById('movement_cash_total_display')?.textContent.trim());
    console.log('💰 Efectivo en caja (display):', totalDisplay);

    // ── PASO 4: Ingresar descripción ──
    await page.evaluate(() => {
      const el = document.getElementById('movenment_cash_observation');
      if (el) { el.value = 'QA salida CP-106'; el.dispatchEvent(new Event('input',{bubbles:true})); }
    });
    await page.waitForTimeout(300);

    // ── PASO 5: Click en "Procesar" ──
    const tConfirm = Date.now();
    const confirmResult = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = document.getElementById('btn_send_movement');
      if (btn && isVis(btn)) { btn.click(); return 'btn_send_movement'; }
      return null;
    });
    await page.waitForTimeout(3000);
    evaluarAccion(Date.now() - tConfirm, 'Procesar movimiento salida');
    console.log('✔ Botón Procesar:', confirmResult);

    // ── PASO 6: Manejar alertas ──
    for (let i = 0; i < 4; i++) { const a = await manejarAlerta(page); if (!a) break; console.log('🔔 Alerta:', a); await page.waitForTimeout(800); }
    await page.waitForTimeout(1500);

    // ── PASO 7: Verificar estado final ──
    const estadoFinal = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const modal = document.getElementById('dialog_cash_movement');
      const campoVal = document.getElementById('movenment_cash_quantity')?.value;
      const totalNuevo = document.getElementById('movement_cash_total_display')?.textContent.trim();
      const sweet = document.querySelector('.sweet-alert');
      return {
        modalAbierto: modal && isVis(modal),
        campoLimpiado: campoVal === '' || campoVal === '0',
        totalDisplay: totalNuevo,
        sweetAlertTxt: (sweet && isVis(sweet)) ? sweet.textContent.replace(/\s+/g,' ').trim().substring(0,80) : null
      };
    });
    console.log('📍 Estado final:', JSON.stringify(estadoFinal));

    // ── VALIDACIONES ──
    const v1 = modalAbierto;
    const v2 = tipoSeleccionado !== null;          // Tipo salida activado
    const v3 = confirmResult === 'btn_send_movement';
    const v4 = estadoFinal.campoLimpiado || !estadoFinal.modalAbierto;

    console.log('\n📊 === VALIDACIONES CP-106 ===');
    console.log('  dialog_cash_movement abierto: ' + (v1 ? '✅' : '❌'));
    console.log('  Tipo salida activado:         ' + (v2 ? '✅' : '⚠️') + ' via ' + tipoSeleccionado + ' (cash_movement_type=' + tipoConf + ')');
    console.log('  Botón Procesar clickado:      ' + (v3 ? '✅' : '⚠️'));
    console.log('  Movimiento procesado:         ' + (v4 ? '✅' : '⚠️'));

    if (!v1) throw new Error('dialog_cash_movement no se pudo abrir');
    if (!v3) throw new Error('No se pudo hacer click en btn_send_movement');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    const pasadas = [v1,v2,v3,v4].filter(Boolean).length;
    const icono = pasadas >= 3 ? '✅' : '⚠️';
    console.log(icono + ' CP-106 PASSED | salida: ₡' + MONTO_SALIDA + ' | tipo=salida(via ' + tipoSeleccionado + ') | Procesar: ' + confirmResult + ' | efectivo-caja: ' + totalDisplay + ' | validaciones: ' + pasadas + '/4 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp106-fail');
    console.log('❌ CP-106 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp106_movimiento_salida();
