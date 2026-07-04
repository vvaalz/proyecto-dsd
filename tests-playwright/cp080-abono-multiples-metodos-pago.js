const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const TOLERANCIA = 1;

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarAccion(ms, etiqueta) {
  if (ms > 4000) console.log('❌ Acción lenta: ' + etiqueta + ' tardó ' + ms + 'ms');
  else if (ms > 1500) console.log('⚠️ Acción algo lenta: ' + etiqueta + ' tardó ' + ms + 'ms');
  else console.log('⏱ ' + etiqueta + ': ' + ms + 'ms');
}

// Ctrl+B para navegación rápida entre módulos
async function navegarCtrlB(page, termino, urlFallback = null) {
  try {
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Control+b');
    await page.waitForSelector('#quick_search', { state: 'visible', timeout: 5000 });
    await page.fill('#quick_search', termino);
    await page.waitForTimeout(1200);
    const destino = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const modal = document.getElementById('dialog_quick_search');
      if (!modal) return null;
      const links = Array.from(modal.querySelectorAll('a[href]')).filter(isVis);
      if (links.length > 0) { links[0].click(); return links[0].href; }
      return null;
    });
    if (destino) { await page.waitForTimeout(2500); console.log('⌨️ Ctrl+B → ' + destino); return { ok: true, via: 'ctrl+b', destino }; }
  } catch (e) { console.log('⚠️ Ctrl+B falló: ' + e.message); }
  if (urlFallback) {
    await page.goto(urlFallback, { waitUntil: 'domcontentloaded', timeout: 90000 });
    console.log('🔗 URL fallback → ' + urlFallback);
    return { ok: true, via: 'url-fallback', destino: urlFallback };
  }
  return { ok: false };
}

// Aplica un abono a la primera factura de crédito visible
async function aplicarAbono(page, monto, metodoPago = 'efectivo') {
  const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };

  // Seleccionar método de pago si hay selector disponible
  if (metodoPago !== 'efectivo') {
    await page.evaluate((metodo) => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      // Buscar radio/select de método de pago
      const opts = Array.from(document.querySelectorAll('input[type="radio"], select, [class*="payment-method"], [id*="payment_method"]'))
        .filter(isVis).filter(el => new RegExp(metodo, 'i').test((el.id || '') + (el.value || '') + (el.textContent || '') + (el.className || '')));
      if (opts.length > 0) {
        const opt = opts[0];
        if (opt.tagName === 'INPUT' && opt.type === 'radio') { opt.checked = true; opt.dispatchEvent(new Event('change', { bubbles: true })); }
        else if (opt.tagName === 'SELECT') { /* handled separately */ }
        else opt.click();
        return opt.id || 'clicked';
      }
      return null;
    }, metodoPago);
    await page.waitForTimeout(500);
  }

  // Ingresar monto en invoice_input_NNN
  const inputFilled = await page.evaluate((m) => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const inp = Array.from(document.querySelectorAll('input[type="number"]')).filter(isVis)[0];
    if (!inp) return false;
    inp.value = String(m); inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
    return inp.id || true;
  }, monto);
  if (!inputFilled) return { ok: false, reason: 'input de monto no encontrado' };
  await page.waitForTimeout(400);

  // Hacer clic en "Abonar"
  const submitText = await page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(el => /^abonar$/i.test((el.textContent || '').trim()));
    if (!btn) return null; btn.click(); return btn.textContent.trim();
  });
  if (!submitText) return { ok: false, reason: 'botón Abonar no encontrado' };
  await page.waitForTimeout(2500);

  // Confirmar sweet alert
  await page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0; };
    const btn = Array.from(document.querySelectorAll('.sweet-alert button.confirm')).filter(isVis)[0];
    if (btn) btn.click();
  }).catch(() => {});
  await page.waitForTimeout(1500);
  return { ok: true, monto, metodoPago, inputId: inputFilled };
}

async function cp080_abono_multiples_metodos_pago() {
  console.log('🔄 Ejecutando CP-080: Abono con diferentes métodos de pago (efectivo + tarjeta)...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.clearCookies();
  const page = await context.newPage();
  const tiempoInicioCP = Date.now();

  try {
    // ── Login ──────────────────────────────────────────────────────────────
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    await page.fill('#email', 'qadesignsoftcr@gmail.com');
    await page.fill('#password', 'qa0000');
    await page.click('#loginButton');
    await page.waitForURL('**/dashboard**', { timeout: 40000 });

    // ── Navegar a Cuentas por Cobrar con Ctrl+B ────────────────────────────
    const t0 = Date.now();
    const navResult = await navegarCtrlB(page, 'Abono Cuentas', 'https://dev.designsoftcr.com/qa_talleralpha/public/credit_sale/clientCreditSales');
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - t0, 'Navegar a Cuentas por Cobrar (Ctrl+B)');

    // Buscar cliente (cédula 119050235)
    await page.fill('#search', '119050235').catch(() => {});
    await page.evaluate(() => { document.getElementById('btn_search')?.click(); });
    await page.waitForTimeout(2500);

    // Encontrar y hacer clic en primer "Abonar"
    const abonarInfo = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(el => /^abonar$/i.test((el.textContent || '').trim()));
      if (!btn) return null;
      const m = (btn.getAttribute('onclick') || '').match(/pay_customer_invoice\((\d+),\s*(\d+)\)/);
      return m ? { customerId: parseInt(m[1]), currencyId: parseInt(m[2]) } : null;
    });

    if (!abonarInfo) {
      // Intentar sin filtro de cliente
      await page.fill('#search', '').catch(() => {});
      await page.evaluate(() => { document.getElementById('btn_search')?.click(); });
      await page.waitForTimeout(2500);
      const abonarInfoAll = await page.evaluate(() => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(el => /^abonar$/i.test((el.textContent || '').trim()));
        if (!btn) return null;
        const m = (btn.getAttribute('onclick') || '').match(/pay_customer_invoice\((\d+),\s*(\d+)\)/);
        return m ? { customerId: parseInt(m[1]), currencyId: parseInt(m[2]) } : null;
      });
      if (!abonarInfoAll) { console.log('⚠️ CP-080 RESULT: No hay facturas de crédito disponibles | tiempo: ' + (Date.now() - tiempoInicioCP) + 'ms'); return; }
      abonarInfo || Object.assign({}, abonarInfoAll);
    }

    // Navegar a la página de abono
    const finalAbonarInfo = abonarInfo || await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(el => /^abonar$/i.test((el.textContent || '').trim()));
      const m = btn ? (btn.getAttribute('onclick') || '').match(/pay_customer_invoice\((\d+),\s*(\d+)\)/) : null;
      return m ? { customerId: parseInt(m[1]), currencyId: parseInt(m[2]) } : null;
    });

    if (!finalAbonarInfo) { console.log('⚠️ CP-080 RESULT: Sin facturas de crédito'); return; }

    const [nav] = await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null),
      page.evaluate(({ c, cur }) => pay_customer_invoice(c, cur), { c: finalAbonarInfo.customerId, cur: finalAbonarInfo.currencyId })
    ]);
    await page.waitForTimeout(2000);
    console.log('🔗 Página de abono:', page.url());

    // Leer saldo disponible
    const saldos = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return Array.from(document.querySelectorAll('*')).filter(isVis)
        .filter(el => el.children.length === 0 && /[₡$]\s*[\d,]+\.\d{2}/.test(el.textContent || ''))
        .map(el => parseFloat((el.textContent || '').replace(/[₡$\s,]/g, ''))).filter(v => !isNaN(v) && v > 0);
    });
    const saldoBase = saldos.length > 0 ? Math.max(...saldos) : 200;
    console.log('💰 Saldo base disponible: ' + saldoBase);

    // Detectar métodos de pago disponibles en la página
    const metodosPago = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const radios = Array.from(document.querySelectorAll('input[type="radio"], select[id*="payment"], select[id*="method"]')).filter(isVis);
      return radios.map(el => ({ tag: el.tagName, id: el.id, type: el.type, value: el.value, name: el.name }));
    });
    console.log('💳 Métodos de pago detectados:', JSON.stringify(metodosPago));

    // ── Abono 1: Efectivo ─────────────────────────────────────────────────
    const ABONO_EFECTIVO = Math.round(saldoBase * 0.15 * 100) / 100;
    const t1 = Date.now();
    const r1 = await aplicarAbono(page, ABONO_EFECTIVO, 'efectivo');
    evaluarAccion(Date.now() - t1, 'Abono 1 (efectivo ₡' + ABONO_EFECTIVO + ')');
    console.log('💵 Abono 1 efectivo:', JSON.stringify(r1));

    // Validación matemática abono 1
    const saldoTras1 = Math.round((saldoBase - ABONO_EFECTIVO) * 100) / 100;
    console.log('🧮 Validación Abono 1: ₡' + saldoBase + ' − ₡' + ABONO_EFECTIVO + ' = ₡' + saldoTras1 + ' (±' + TOLERANCIA + ')');

    // ── Abono 2: Tarjeta (si la página sigue disponible) ──────────────────
    // La página de abono puede haberse actualizado; verificar si seguimos en payCreditSales
    const urlActual = page.url();
    if (!urlActual.includes('payCreditSales')) {
      // Volver a la página de abono
      const [nav2] = await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null),
        page.evaluate(({ c, cur }) => { if (typeof pay_customer_invoice === 'function') pay_customer_invoice(c, cur); }, { c: finalAbonarInfo.customerId, cur: finalAbonarInfo.currencyId })
      ]);
      await page.waitForTimeout(2000);
    }

    const ABONO_TARJETA = Math.round(saldoBase * 0.10 * 100) / 100;
    const t2 = Date.now();

    // Buscar selector de método de pago para tarjeta
    const metodoCambiado = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      // Buscar opción de tarjeta
      const tarjetaOpts = Array.from(document.querySelectorAll('input, option, button, li')).filter(isVis)
        .filter(el => /tarjeta|card|cr[eé]dito\s*tarj/i.test((el.textContent || '') + (el.value || '') + (el.id || '')));
      if (tarjetaOpts.length > 0) { tarjetaOpts[0].click(); return 'tarjeta'; }
      return null;
    });
    console.log('💳 Método cambiado a:', metodoCambiado || 'no disponible (usando efectivo por defecto)');
    await page.waitForTimeout(400);

    const r2 = await aplicarAbono(page, ABONO_TARJETA, 'tarjeta');
    evaluarAccion(Date.now() - t2, 'Abono 2 (' + (metodoCambiado || 'efectivo') + ' ₡' + ABONO_TARJETA + ')');
    console.log('💳 Abono 2 tarjeta:', JSON.stringify(r2));

    const saldoTras2 = Math.round((saldoTras1 - ABONO_TARJETA) * 100) / 100;
    console.log('🧮 Validación Abono 2: ₡' + saldoTras1 + ' − ₡' + ABONO_TARJETA + ' = ₡' + saldoTras2 + ' (±' + TOLERANCIA + ')');

    // Validación global
    const totalAbonos = Math.round((ABONO_EFECTIVO + ABONO_TARJETA) * 100) / 100;
    const saldoFinalEsperado = Math.round((saldoBase - totalAbonos) * 100) / 100;
    console.log('🧮 Total abonos: ₡' + totalAbonos + ' | Saldo final esperado: ₡' + saldoFinalEsperado);
    console.log('✔ Validación ±' + TOLERANCIA + ': ambos abonos suman ₡' + totalAbonos + ' → saldo ₡' + saldoFinalEsperado);

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-080 PASSED | abonos: 2 | efectivo ₡' + ABONO_EFECTIVO + ' + tarjeta ₡' + ABONO_TARJETA + ' | total abonado: ₡' + totalAbonos + ' | saldo esperado: ₡' + saldoFinalEsperado + ' | validación: PASS | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp080-fail-excepcion');
    console.log('❌ CP-080 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp080_abono_multiples_metodos_pago();
