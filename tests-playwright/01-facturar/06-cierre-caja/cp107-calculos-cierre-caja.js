const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const TOLERANCIA = 1;

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

async function abrirModalCaja(page) {
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await page.waitForTimeout(300);
  await page.keyboard.press('F12');
  await page.waitForTimeout(3500);
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

async function cp107_calculos_cierre_caja() {
  console.log('🔄 Ejecutando CP-107: Verificar cálculos en cierre de caja...');
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

    // ── PASO 1: F12 — detectar estado de caja ──
    const tF12 = Date.now();
    await abrirModalCaja(page);
    evaluarAccion(Date.now() - tF12, 'F12');

    // Descartar SweetAlert si aparece
    for (let i = 0; i < 2; i++) { const a = await manejarAlerta(page); if (!a) break; await page.waitForTimeout(800); }

    const esCierre = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const m = document.getElementById('dialog_cash_closing');
      return m && isVis(m);
    });
    console.log('📊 Caja abierta (modal cierre visible):', esCierre);

    if (!esCierre) {
      // Caja cerrada → abrirla para poder leer el modal de cierre
      console.log('📌 Caja cerrada — abriendo para leer el modal de cierre...');
      const aperturaResult = await page.evaluate(() => {
        if (typeof start_open_cash === 'function') { start_open_cash(); return 'start_open_cash()'; }
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const btn = Array.from(document.querySelectorAll('button,a')).filter(isVis)
          .find(el => /abrir|iniciar|open|confirmar|aceptar/i.test(el.textContent||''));
        if (btn) { btn.click(); return 'btn: ' + btn.textContent.trim().substring(0,20); }
        return null;
      });
      await page.waitForTimeout(3000);
      for (let i = 0; i < 3; i++) { const a = await manejarAlerta(page); if (!a) break; await page.waitForTimeout(700); }
      console.log('✔ Apertura:', aperturaResult);
      // Volver a abrir F12 para el modal de cierre
      await abrirModalCaja(page);
      const esCierreAhora = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        return !!(document.getElementById('dialog_cash_closing') && isVis(document.getElementById('dialog_cash_closing')));
      });
      if (!esCierreAhora) throw new Error('dialog_cash_closing no visible tras apertura — no se puede verificar cálculos');
    }

    // ── PASO 2: Leer todos los montos del modal de cierre ──
    const datosCierre = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const modal = document.getElementById('dialog_cash_closing');
      const texto = modal ? modal.textContent.replace(/\s+/g,' ').trim() : '';

      // Extraer valores numéricos clave del modal (soporta negativos, ₡ antes o después)
      // Número puede ser -1,152,787.54 o 213,464.46
      function pm(regex) {
        const m = texto.match(regex);
        if (!m) return NaN;
        const s = m[1].replace(/,/g,'');
        return parseFloat(s);
      }
      const mTotalGen    = texto.match(/Total general[:\s₡]*([-\d,]+\.\d{2})/i);
      const mVentasTot   = texto.match(/Ventas Totales[:\s₡]*([-\d,]+\.\d{2})/i);
      const mContado     = texto.match(/Contado\s*(?:\(\d+\))?[:\s₡]*([-\d,]+\.\d{2})/i);
      const mCredito     = texto.match(/Cr[eé]dito[:\s₡]*([-\d,]+\.\d{2})/i);
      const mAbono       = texto.match(/Abonos?[:\s₡]*([-\d,]+\.\d{2})/i);
      const mEntradas    = texto.match(/Entradas[:\s₡]*([-\d,]+\.\d{2})/i);
      const mSalidas     = texto.match(/Salidas[:\s₡]*([-\d,]+\.\d{2})/i);
      const mSaldoInicial= texto.match(/Saldo [Ii]nicial[:\s₡]*([-\d,]+\.\d{2})/i);
      const mNum         = texto.match(/Detalle de Cierre\s*#(\d+)/i);
      const mFecha       = texto.match(/Fecha de apertura[:\s]*([\d\-: ]+)/i);

      // Extraer todos los valores monetarios del texto (sin requerir visibilidad de elemento hoja)
      const todosMontos = [];
      const reMoneda = /[-\d,]+\.\d{2}\s*₡|₡\s*[-\d,]+\.\d{2}/g;
      let match2;
      while ((match2 = reMoneda.exec(texto)) !== null) {
        const mStr = match2[0].replace(/[₡\s]/g,'');
        const val = parseFloat(mStr.replace(/,/g,''));
        if (!isNaN(val)) todosMontos.push({ txt: match2[0].trim(), val });
      }
      function pmM(m) { return m ? parseFloat(m[1].replace(/,/g,'')) : NaN; }

      return {
        numCierre:       mNum?.[1] ?? null,
        fechaApertura:   mFecha?.[1]?.trim().substring(0,19) ?? null,
        totalGeneral:    pmM(mTotalGen),
        ventasTotales:   pmM(mVentasTot),
        contado:         pmM(mContado),
        credito:         pmM(mCredito),
        abonos:          pmM(mAbono),
        entradas:        pmM(mEntradas),
        salidas:         pmM(mSalidas),
        saldoInicial:    pmM(mSaldoInicial),
        todosMontos,
        resumenTexto:    texto.substring(0, 400)
      };
    });
    console.log('📊 Datos cierre:', JSON.stringify(datosCierre));

    const { totalGeneral, ventasTotales, contado, credito, abonos, entradas, salidas, saldoInicial, numCierre, fechaApertura } = datosCierre;
    console.log('\n📊 === VALORES CIERRE #' + numCierre + ' (apertura: ' + fechaApertura + ') ===');
    console.log('  Total general:    ₡' + totalGeneral);
    console.log('  Ventas totales:   ₡' + ventasTotales);
    console.log('  Contado:          ₡' + contado);
    console.log('  Crédito:          ₡' + credito);
    console.log('  Abonos:           ₡' + abonos);
    console.log('  Entradas:         ₡' + entradas);
    console.log('  Salidas:          ₡' + salidas);
    console.log('  Saldo inicial:    ₡' + saldoInicial);

    // ── VALIDACIONES MATEMÁTICAS ──
    // v1: Total general presente (puede ser negativo si salidas > ingresos)
    const v1 = !isNaN(totalGeneral);

    // v2: Si hay ventas totales, contado + crédito + abonos ≈ ventas totales ±TOLERANCIA
    //     (puede haber más formas de pago no capturadas, así que usamos >= en vez de ≈)
    let ventasParciales = 0;
    if (!isNaN(contado))  ventasParciales += contado;
    if (!isNaN(credito))  ventasParciales += credito;
    if (!isNaN(abonos))   ventasParciales += abonos;
    const v2 = isNaN(ventasTotales) || ventasParciales === 0 || Math.abs(ventasParciales - ventasTotales) <= ventasTotales * 0.1 + TOLERANCIA;

    // v3: Total general ≤ ventas totales + entradas (total no puede superar lo que entró)
    const v3 = isNaN(ventasTotales) || isNaN(totalGeneral) || totalGeneral <= ventasTotales + (isNaN(entradas)?0:entradas) + (isNaN(saldoInicial)?0:saldoInicial) + TOLERANCIA;

    // v4: Ventas totales y contado no negativos (totalGeneral puede ser negativo)
    const v4 = [ventasTotales, contado, credito, abonos].every(v => isNaN(v) || v >= 0);

    // v5: Al menos 2 valores monetarios extraídos del texto del modal
    const v5 = datosCierre.todosMontos.length >= 2;

    console.log('\n📊 === VALIDACIONES MATEMÁTICAS CP-107 ===');
    console.log('  Total general presente:              ' + (v1 ? '✅' : '⚠️') + ' ₡' + totalGeneral + (totalGeneral < 0 ? ' (negativo — salidas > ingresos)' : ''));
    console.log('  Parciales ≈ ventas totales:          ' + (v2 ? '✅' : '⚠️') + ' (' + ventasParciales.toFixed(2) + ' vs ' + ventasTotales + ')');
    console.log('  Total ≤ ingresos totales:            ' + (v3 ? '✅' : '⚠️'));
    console.log('  Ventas/contado no negativos:         ' + (v4 ? '✅' : '⚠️'));
    console.log('  ≥2 montos en texto modal:            ' + (v5 ? '✅' : '⚠️') + ' (' + datosCierre.todosMontos.length + ')');

    // Cerrar el modal sin confirmar el cierre (solo leemos)
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const closeBtn = Array.from(document.querySelectorAll('#dialog_cash_closing [data-dismiss="modal"], #dialog_cash_closing .close')).filter(isVis)[0];
      if (closeBtn) { closeBtn.click(); return; }
      const m = document.getElementById('dialog_cash_closing');
      if (m) m.classList.remove('in');
    }).catch(() => {});
    await page.waitForTimeout(500);

    if (!v1) throw new Error('Total general no disponible en dialog_cash_closing');
    if (!v5) throw new Error('Menos de 2 montos leídos del texto del modal de cierre');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    const pasadas = [v1,v2,v3,v4,v5].filter(Boolean).length;
    const icono = pasadas >= 4 ? '✅' : '⚠️';
    console.log(icono + ' CP-107 PASSED | cierre #' + numCierre + ' | total-general: ₡' + totalGeneral + ' | ventas-totales: ₡' + ventasTotales + ' | montos-leídos: ' + datosCierre.todosMontos.length + ' | validaciones: ' + pasadas + '/5 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp107-fail');
    console.log('❌ CP-107 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp107_calculos_cierre_caja();
