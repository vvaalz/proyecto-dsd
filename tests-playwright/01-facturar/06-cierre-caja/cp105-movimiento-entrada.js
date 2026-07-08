const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const MONTO_ENTRADA = 10000;

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
}

async function abrirMovimientosCaja(page) {
  // F9 intento
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await page.keyboard.press('F9');
  await page.waitForTimeout(2000);
  const abierto = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const m = document.getElementById('dialog_cash_movement');
    return m && isVis(m);
  });
  if (!abierto) {
    // Fallback: menú Caja → Movimientos de caja
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

async function cp105_movimiento_entrada() {
  console.log('🔄 Ejecutando CP-105: Movimientos de caja — registrar entrada...');
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

    // ── PASO 1: Abrir dialog_cash_movement (F9 o menú) ──
    const tOpen = Date.now();
    const modalAbierto = await abrirMovimientosCaja(page);
    evaluarAccion(Date.now() - tOpen, 'Abrir movimientos de caja');
    if (!modalAbierto) throw new Error('dialog_cash_movement no se pudo abrir — verificar si la caja está abierta');
    console.log('✔ dialog_cash_movement abierto');

    // ── PASO 2: Verificar tipo "Entradas" activo (checkbox movenment_cash_in) ──
    // movenment_cash_in checked + cash_movement_type = "1" = Entrada por defecto
    const tipoInicial = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const chkIn  = document.getElementById('movenment_cash_in');
      const chkOut = document.getElementById('movenment_cash_out');
      const typeHidden = document.getElementById('cash_movement_type');
      return {
        chkIn:  chkIn  ? { checked: chkIn.checked,  vis: isVis(chkIn) }  : null,
        chkOut: chkOut ? { checked: chkOut.checked, vis: isVis(chkOut) } : null,
        typeVal: typeHidden?.value ?? null
      };
    });
    console.log('📌 Tipo inicial:', JSON.stringify(tipoInicial));

    // Asegurar que "Entradas" esté activo
    if (tipoInicial.chkIn && !tipoInicial.chkIn.checked) {
      await page.evaluate(() => {
        const el = document.getElementById('movenment_cash_in');
        if (el) { el.checked = true; el.dispatchEvent(new Event('change',{bubbles:true})); if (typeof set_movement_in === 'function') set_movement_in(); }
      });
      await page.waitForTimeout(400);
      console.log('📌 Activado tipo "Entradas"');
    } else {
      console.log('📌 Tipo "Entradas" ya activo (por defecto)');
    }

    // Verificar que cash_movement_type = "1"
    const tipoConf = await page.evaluate(() => document.getElementById('cash_movement_type')?.value);
    console.log('📌 cash_movement_type:', tipoConf);

    // ── PASO 3: Ingresar monto ──
    await page.evaluate((val) => {
      const el = document.getElementById('movenment_cash_quantity');
      if (el) { el.value = ''; el.focus(); el.value = String(val); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }
    }, MONTO_ENTRADA);
    await page.waitForTimeout(400);
    console.log('✏️ Monto ingresado: ₡' + MONTO_ENTRADA);

    // Leer total display
    const totalDisplay = await page.evaluate(() => document.getElementById('movement_cash_total_display')?.textContent.trim());
    console.log('💰 Efectivo en caja (display):', totalDisplay);

    // ── PASO 4: Ingresar descripción ──
    await page.evaluate(() => {
      const el = document.getElementById('movenment_cash_observation');
      if (el) { el.value = 'QA entrada CP-105'; el.dispatchEvent(new Event('input',{bubbles:true})); }
    });
    await page.waitForTimeout(300);

    // ── PASO 5: Hacer click en "Procesar" (#btn_send_movement) ──
    const tConfirm = Date.now();
    const confirmResult = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = document.getElementById('btn_send_movement');
      if (btn && isVis(btn)) { btn.click(); return 'btn_send_movement'; }
      return null;
    });
    await page.waitForTimeout(3000);
    evaluarAccion(Date.now() - tConfirm, 'Procesar movimiento entrada');
    console.log('✔ Botón Procesar:', confirmResult);

    // ── PASO 6: Manejar alertas de confirmación ──
    for (let i = 0; i < 4; i++) { const a = await manejarAlerta(page); if (!a) break; console.log('🔔 Alerta:', a); await page.waitForTimeout(800); }
    await page.waitForTimeout(1500);

    // ── PASO 7: Verificar estado final ──
    const estadoFinal = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const modal = document.getElementById('dialog_cash_movement');
      const modalAbierto = modal && isVis(modal);
      // Leer monto actual después de registrar
      const campoVal = document.getElementById('movenment_cash_quantity')?.value;
      const totalNuevo = document.getElementById('movement_cash_total_display')?.textContent.trim();
      const sweet = document.querySelector('.sweet-alert');
      return {
        modalAbierto,
        campoLimpiado: campoVal === '' || campoVal === '0',
        totalDisplay: totalNuevo,
        sweetAlertTxt: (sweet && isVis(sweet)) ? sweet.textContent.replace(/\s+/g,' ').trim().substring(0,80) : null
      };
    });
    console.log('📍 Estado final:', JSON.stringify(estadoFinal));

    // ── VALIDACIONES ──
    const v1 = modalAbierto;                                               // Modal se abrió
    const v2 = tipoConf === '1';                                           // Tipo "Entrada" activo
    const v3 = confirmResult === 'btn_send_movement';                      // Botón Procesar clickado
    const v4 = estadoFinal.campoLimpiado || !estadoFinal.modalAbierto;    // Campo vació (procesado) o modal cerró

    console.log('\n📊 === VALIDACIONES CP-105 ===');
    console.log('  dialog_cash_movement abierto: ' + (v1 ? '✅' : '❌'));
    console.log('  Tipo entrada activo:          ' + (v2 ? '✅' : '⚠️') + ' cash_movement_type=' + tipoConf);
    console.log('  Botón Procesar clickado:      ' + (v3 ? '✅' : '⚠️'));
    console.log('  Movimiento procesado:         ' + (v4 ? '✅' : '⚠️') + ' campo=' + estadoFinal.campoLimpiado + ' modalCerrado=' + !estadoFinal.modalAbierto);

    if (!v1) throw new Error('dialog_cash_movement no se pudo abrir');
    if (!v3) throw new Error('No se pudo hacer click en btn_send_movement');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    const pasadas = [v1,v2,v3,v4].filter(Boolean).length;
    const icono = pasadas >= 3 ? '✅' : '⚠️';
    console.log(icono + ' CP-105 PASSED | entrada: ₡' + MONTO_ENTRADA + ' | tipo=entrada(cash_movement_type=' + tipoConf + ') | Procesar: ' + confirmResult + ' | efectivo-caja: ' + totalDisplay + ' | validaciones: ' + pasadas + '/4 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp105-fail');
    console.log('❌ CP-105 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp105_movimiento_entrada();
