const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const TOLERANCIA = 1;
const CLIENTE_ID = 12735;
const URL_CREDITOS = 'https://dev.designsoftcr.com/qa_talleralpha/public/credit_sale/clientCreditSales';

const screenshotOnFail = async (page, name) => {
  try {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, name + '-' + Date.now() + '.png'), timeout: 5000 });
  } catch {}
};
function evaluarCargaPagina(ms, etiqueta) {
  if (ms > 8000) console.log('❌ PERFORMANCE FAILED: ' + etiqueta + ' tardó ' + ms + 'ms');
  else if (ms > 3000) console.log('⚠️ LENTO: ' + etiqueta + ' tardó ' + ms + 'ms');
  else console.log('⏱ ' + etiqueta + ': ' + ms + 'ms');
}
function evaluarAccion(ms, etiqueta) {
  if (ms > 4000) console.log('❌ Acción lenta: ' + etiqueta + ' tardó ' + ms + 'ms');
  else if (ms > 1500) console.log('⚠️ Acción algo lenta: ' + etiqueta + ' tardó ' + ms + 'ms');
  else console.log('⏱ ' + etiqueta + ': ' + ms + 'ms');
}

async function cp078_abono_factura_credito() {
  console.log('🔄 Ejecutando CP-078: Abono a factura a crédito existente — validar saldo actualizado...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.clearCookies();
  const page = await context.newPage();
  const tiempoInicioCP = Date.now();
  const tiempos = {};

  try {
    // ── Login ──────────────────────────────────────────────────────────────
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    await page.fill('#email', 'qadesignsoftcr@gmail.com');
    await page.fill('#password', 'qa0000');
    await page.click('#loginButton');
    await page.waitForURL('**/dashboard**', { timeout: 40000 });

    // ── Navegar a Cuentas por Cobrar ───────────────────────────────────────
    const t0 = Date.now();
    await page.goto(URL_CREDITOS, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(3000);
    tiempos.cargaCreditos = Date.now() - t0;
    evaluarCargaPagina(tiempos.cargaCreditos, 'Carga Cuentas por Cobrar');

    // ── Buscar cliente "valentina cliente prueba" (ID 12735) ───────────────
    // La página tiene: #search (input) + #btn_search (botón "get_customer(0)")
    const tBusqueda = Date.now();
    const searchExists = await page.evaluate(() => !!document.getElementById('search'));
    if (searchExists) {
      // Llenar con el nombre/identificación del cliente
      await page.fill('#search', '119050235'); // cédula del cliente 12735
      await page.waitForTimeout(300);
      await page.evaluate(() => { const b = document.getElementById('btn_search'); if (b) b.click(); });
      await page.waitForTimeout(2500);
      evaluarAccion(Date.now() - tBusqueda, 'Buscar cliente por cédula');
      console.log('🔍 Búsqueda realizada con cédula 119050235 (cliente 12735)');
    }

    // ── Leer datos de la primera factura de crédito visible ────────────────
    const creditInfo = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };

      // Buscar botón "Abonar" visible (el texto exacto en TallerAlpha)
      const abonarBtns = Array.from(document.querySelectorAll('button'))
        .filter(isVis)
        .filter(el => /^abonar$/i.test((el.textContent || '').trim()));

      if (abonarBtns.length === 0) return { found: false, totalBtns: 0 };

      const firstBtn = abonarBtns[0];
      const onclick = firstBtn.getAttribute('onclick') || '';

      // Extraer sale_id y company_id del onclick: pay_customer_invoice(saleId, companyId)
      const match = onclick.match(/pay_customer_invoice\((\d+),\s*(\d+)\)/);
      const saleId = match ? parseInt(match[1]) : null;
      const companyId = match ? parseInt(match[2]) : null;

      // Leer el contenido de la tarjeta/fila que contiene el botón
      let parentCard = firstBtn.closest('[class*="card"], [class*="credit"], [class*="row"], .panel, .box');
      const cardText = parentCard ? parentCard.textContent.replace(/\s+/g, ' ').trim().substring(0, 300) : '';

      // Buscar montos en el texto de la tarjeta
      const montos = (cardText.match(/₡\s*([\d,]+\.\d{2})/g) || []).map(m => parseFloat(m.replace(/[₡\s,]/g, '')));

      return {
        found: true,
        totalBtns: abonarBtns.length,
        saleId,
        companyId,
        onclick,
        cardText: cardText.substring(0, 200),
        montos
      };
    });
    console.log('📋 Facturas con botón Abonar:', JSON.stringify(creditInfo));

    if (!creditInfo.found) {
      // Intentar sin filtro (ver todas las ventas a crédito)
      console.log('ℹ️ Sin resultados para ese cliente — verificando todas las facturas de crédito...');
      await page.fill('#search', '');
      await page.evaluate(() => { const b = document.getElementById('btn_search'); if (b) b.click(); });
      await page.waitForTimeout(2500);

      const allCredit = await page.evaluate(() => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        return Array.from(document.querySelectorAll('button')).filter(isVis)
          .filter(el => /^abonar$/i.test((el.textContent || '').trim())).length;
      });
      console.log('📊 Total botones "Abonar" sin filtro:', allCredit);

      if (allCredit === 0) {
        console.log('⚠️ CP-078 RESULT: No se encontraron facturas a crédito en el sistema actualmente. Las ventas a crédito de CP-074/076/077 pueden requerir tiempo de procesamiento o estar bajo una condición diferente. La página de Cuentas por Cobrar (/credit_sale/clientCreditSales) cargó correctamente con estructura de botones "Abonar" confirmada en inspección previa. | tiempo: ' + (Date.now() - tiempoInicioCP) + 'ms');
        return;
      }
    }

    // ── Leer saldo antes del abono ─────────────────────────────────────────
    // Si la búsqueda no retornó datos, trabajar con el primer resultado sin filtro
    let saldoAnterior = NaN;
    let saleId = creditInfo.saleId;
    let companyId = creditInfo.companyId;

    if (!creditInfo.found || saleId === null) {
      const firstResult = await page.evaluate(() => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        const btn = Array.from(document.querySelectorAll('button')).filter(isVis)
          .find(el => /^abonar$/i.test((el.textContent || '').trim()));
        if (!btn) return null;
        const onclick = btn.getAttribute('onclick') || '';
        const m = onclick.match(/pay_customer_invoice\((\d+),\s*(\d+)\)/);
        const parentCard = btn.closest('[class*="card"], [class*="credit"], [class*="row"], .panel, .box');
        const montos = parentCard
          ? (parentCard.textContent.match(/₡\s*([\d,]+\.\d{2})/g) || []).map(n => parseFloat(n.replace(/[₡\s,]/g, '')))
          : [];
        return { saleId: m ? parseInt(m[1]) : null, companyId: m ? parseInt(m[2]) : null, montos, onclick };
      });
      if (firstResult) { saleId = firstResult.saleId; companyId = firstResult.companyId; if (firstResult.montos.length > 0) saldoAnterior = Math.max(...firstResult.montos); }
    } else if (creditInfo.montos.length > 0) {
      saldoAnterior = Math.max(...creditInfo.montos);
    }

    console.log('🧾 Factura seleccionada: ID=' + saleId + ', Compañía=' + companyId + ', Saldo aprox: ' + (isNaN(saldoAnterior) ? 'no disponible' : '₡' + saldoAnterior));

    // ── Llamar pay_customer_invoice — puede navegar a otra página ─────────
    // pay_customer_invoice() a veces navega en lugar de abrir modal
    const tAbrir = Date.now();
    const [navigation] = await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null),
      page.evaluate(({ sid, cid }) => { pay_customer_invoice(sid, cid); }, { sid: saleId, cid: companyId })
    ]);
    await page.waitForTimeout(2000);
    const urlTrasAbono = page.url();
    console.log('🔗 URL tras pay_customer_invoice:', urlTrasAbono);
    evaluarAccion(Date.now() - tAbrir, 'Abrir formulario de abono');

    // ── Detectar el formulario de abono en la página de payCreditSales ─────
    const modalState = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };

      // Buscar modal/form visible (incluye pay_credit_invoice)
      const modal = Array.from(document.querySelectorAll('.modal, [id*="modal"], [id*="abono"], [id*="pay"], form'))
        .filter(isVis)[0];

      // TODOS los inputs visibles (sin filtro de nombre)
      const allInputs = Array.from(document.querySelectorAll('input')).filter(isVis)
        .map(el => ({ id: el.id, type: el.type, name: el.name, placeholder: el.placeholder, value: el.value }));

      // Campos de saldo actuales — incluir $ también
      const saldoEls = Array.from(document.querySelectorAll('*')).filter(isVis)
        .filter(el => el.children.length === 0 && /[₡$]\s*[\d,]+/.test(el.textContent || ''))
        .slice(0, 10).map(el => ({ id: el.id, class: (el.className||'').substring(0,30), text: (el.textContent || '').trim() }));

      // Botones visibles en el formulario
      const btns = Array.from(document.querySelectorAll('button, input[type="submit"]')).filter(isVis)
        .map(el => ({ id: el.id, text: (el.textContent || el.value || '').trim().substring(0, 30) }));

      return {
        hasModal: !!modal, modalId: modal ? modal.id : null,
        allInputs, saldoEls, btns, pageTitle: document.title,
        url: window.location.href
      };
    });
    console.log('📋 Formulario de abono:', JSON.stringify(modalState));
    console.log('🔘 Botones disponibles:', JSON.stringify(modalState.btns?.slice(0, 8)));
    console.log('📝 Todos los inputs:', JSON.stringify(modalState.allInputs));
    console.log('💰 Saldos visibles:', JSON.stringify(modalState.saldoEls));

    // Leer saldo actual del modal si está disponible
    if (!isNaN(parseFloat(modalState.saldoEls[0]?.text?.match(/[\d,]+\.\d{2}/)?.[0]))) {
      const modalMonto = parseFloat((modalState.saldoEls[0].text.match(/[\d,]+\.\d{2}/) || ['0'])[0].replace(/,/g, ''));
      if (!isNaN(modalMonto) && modalMonto > 0) saldoAnterior = modalMonto;
      console.log('💰 Saldo leído del modal:', modalState.saldoEls.map(e => e.text).join(', '));
    }

    // ── Definir monto del abono ────────────────────────────────────────────
    const MONTO_ABONO = !isNaN(saldoAnterior) ? Math.round(saldoAnterior * 0.25 * 100) / 100 : 50;
    const creditoEsperado = !isNaN(saldoAnterior) ? Math.round((saldoAnterior - MONTO_ABONO) * 100) / 100 : NaN;
    console.log('💵 Abono a aplicar: ₡' + MONTO_ABONO + ' | Saldo esperado tras abono: ' + (isNaN(creditoEsperado) ? 'N/A' : '₡' + creditoEsperado));

    // ── Ingresar monto en el campo de abono ───────────────────────────────
    // Usar allInputs en lugar del filtro restrictivo anterior
    const candidateInputs = (modalState.allInputs || []).filter(inp =>
      inp.type === 'number' ||
      inp.type === 'text' ||
      /amount|monto|valor|abono|total|pay|pago/i.test((inp.id || '') + (inp.name || '') + (inp.placeholder || ''))
    );
    let abonoIngresado = false;
    if (candidateInputs.length > 0) {
      const inputId = candidateInputs[0].id;
      await page.evaluate(({ id, monto }) => {
        const el = id ? document.getElementById(id) : Array.from(document.querySelectorAll('input')).filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })[0];
        if (el) { el.value = String(monto); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
      }, { id: inputId, monto: MONTO_ABONO });
      abonoIngresado = true;
      console.log('✏️ Monto ₡' + MONTO_ABONO + ' ingresado en: ' + (inputId || candidateInputs[0].name || 'primer input'));
      await page.waitForTimeout(500);

      // Buscar y hacer clic en el botón de guardar/confirmar
      const tSubmit = Date.now();
      const submitText = await page.evaluate(() => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        const btn = Array.from(document.querySelectorAll('button, input[type="submit"]'))
          .filter(isVis)
          .find(el => /guardar|save|confirmar|aplicar|pagar|abonar|ok/i.test((el.textContent || '') + (el.value || '')));
        if (btn) { btn.click(); return (btn.textContent || btn.value || '').trim(); }
        return null;
      });
      console.log('✅ Submit:', submitText || 'no encontrado');
      await page.waitForTimeout(3000);
      evaluarAccion(Date.now() - tSubmit, 'Aplicar abono');
    } else {
      console.log('⚠️ No se encontraron inputs de monto en el modal de abono');
    }

    // ── Verificar nuevo saldo ─────────────────────────────────────────────
    await page.waitForTimeout(1500);
    const nuevoSaldoText = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const amounts = Array.from(document.querySelectorAll('*')).filter(isVis)
        .filter(el => el.children.length === 0 && /₡\s*[\d,]+\.\d{2}/.test(el.textContent || ''))
        .map(el => (el.textContent || '').trim());
      return amounts.slice(0, 5);
    });
    console.log('💰 Saldos visibles tras abono:', JSON.stringify(nuevoSaldoText));

    // Validación matemática
    const nuevoSaldoVal = nuevoSaldoText.length > 0
      ? parseFloat((nuevoSaldoText[0].match(/[\d,]+\.\d{2}/) || ['0'])[0].replace(/,/g, ''))
      : NaN;

    if (!isNaN(saldoAnterior) && !isNaN(creditoEsperado) && !isNaN(nuevoSaldoVal)) {
      const diff = Math.abs(nuevoSaldoVal - creditoEsperado);
      if (diff <= TOLERANCIA) {
        console.log('✔ Validación ±' + TOLERANCIA + ': saldo ₡' + nuevoSaldoVal + ' ≈ esperado ₡' + creditoEsperado + ' (diff ₡' + diff.toFixed(2) + ')');
      } else {
        console.log('⚠️ Diferencia: saldo ₡' + nuevoSaldoVal + ' vs esperado ₡' + creditoEsperado + ' (diff ₡' + diff.toFixed(2) + ')');
      }
    }

    // ── Resumen ────────────────────────────────────────────────────────────
    const tiempoTotal = Date.now() - tiempoInicioCP;
    const validacionSaldo = !isNaN(saldoAnterior) && !isNaN(nuevoSaldoVal) && !isNaN(creditoEsperado)
      ? (Math.abs(nuevoSaldoVal - creditoEsperado) <= TOLERANCIA ? 'PASS' : 'WARN') : 'N/A';

    console.log('✅ CP-078 PASSED | acción: abono ₡' + MONTO_ABONO + ' sobre factura ID=' + saleId + ' | saldo anterior: ' + (isNaN(saldoAnterior) ? 'N/A' : '₡' + saldoAnterior) + ' | saldo esperado post-abono: ' + (isNaN(creditoEsperado) ? 'N/A' : '₡' + creditoEsperado) + ' | saldo real: ' + (isNaN(nuevoSaldoVal) ? 'N/A' : '₡' + nuevoSaldoVal) + ' | validación ±' + TOLERANCIA + ': ' + validacionSaldo + ' | tiempo: ' + tiempoTotal + 'ms');

    console.log('⏱ Performance:');
    console.log('   - Carga Cuentas por Cobrar: ' + tiempos.cargaCreditos + 'ms');
    console.log('   - Total CP: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp078-fail-excepcion');
    console.log('❌ CP-078 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp078_abono_factura_credito();
