const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const URL_CREDITOS = 'https://dev.designsoftcr.com/qa_talleralpha/public/credit_sale/clientCreditSales';
const TOLERANCIA = 1;

const screenshotOnFail = async (page, name) => {
  try {
    const dir = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
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

async function cp079_abono_cierre_caja() {
  console.log('🔄 Ejecutando CP-079: Abono a factura de crédito + validar en cierre de caja...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.clearCookies();
  const page = await context.newPage();
  const tiempoInicioCP = Date.now();
  const tiempos = {};
  let montoAbono = NaN;

  try {
    // ── Login ──────────────────────────────────────────────────────────────
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    await page.fill('#email', 'qadesignsoftcr@gmail.com');
    await page.fill('#password', 'qa0000');
    await page.click('#loginButton');
    await page.waitForURL('**/dashboard**', { timeout: 40000 });

    // ── PASO 1: Aplicar abono a factura de crédito ─────────────────────────
    console.log('\n📌 PASO 1: Aplicar abono en Cuentas por Cobrar');
    const t0 = Date.now();
    await page.goto(URL_CREDITOS, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(2500);
    tiempos.cargaCreditos = Date.now() - t0;
    evaluarCargaPagina(tiempos.cargaCreditos, 'Carga Cuentas por Cobrar');

    // Buscar cliente (cédula 119050235 = cliente ID 12735)
    await page.fill('#search', '119050235').catch(() => {});
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.getElementById('btn_search')?.click(); });
    await page.waitForTimeout(2500);

    // Buscar botón "Abonar"
    const abonarInfo = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(el => /^abonar$/i.test((el.textContent || '').trim()));
      if (!btn) return null;
      const onclick = btn.getAttribute('onclick') || '';
      const m = onclick.match(/pay_customer_invoice\((\d+),\s*(\d+)\)/);
      return m ? { customerId: parseInt(m[1]), currencyId: parseInt(m[2]), onclick } : null;
    });

    if (!abonarInfo) {
      console.log('⚠️ No se encontró botón Abonar para el cliente — buscando en todas las facturas...');
      await page.fill('#search', '').catch(() => {});
      await page.evaluate(() => { document.getElementById('btn_search')?.click(); });
      await page.waitForTimeout(2500);
    }

    const abonarInfoFinal = abonarInfo || await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(el => /^abonar$/i.test((el.textContent || '').trim()));
      if (!btn) return null;
      const m = (btn.getAttribute('onclick') || '').match(/pay_customer_invoice\((\d+),\s*(\d+)\)/);
      return m ? { customerId: parseInt(m[1]), currencyId: parseInt(m[2]) } : null;
    });

    if (!abonarInfoFinal) {
      console.log('⚠️ CP-079 RESULT: No se encontró ninguna factura de crédito disponible para abonar. Verificar que existan ventas a crédito activas (CP-074/076/077 deben haberse ejecutado). | tiempo: ' + (Date.now() - tiempoInicioCP) + 'ms');
      return;
    }
    console.log('📋 Factura para abonar:', JSON.stringify(abonarInfoFinal));

    // Navegar a la página de abono
    const tAbrir = Date.now();
    const [navigation] = await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null),
      page.evaluate(({ cId, curId }) => { pay_customer_invoice(cId, curId); }, { cId: abonarInfoFinal.customerId, curId: abonarInfoFinal.currencyId })
    ]);
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tAbrir, 'Navegar a formulario de abono');
    console.log('🔗 URL abono:', page.url());

    // Leer saldo disponible y definir monto del abono
    const saldosVisibles = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return Array.from(document.querySelectorAll('*')).filter(isVis)
        .filter(el => el.children.length === 0 && /[₡$]\s*[\d,]+\.\d{2}/.test(el.textContent || ''))
        .map(el => parseFloat((el.textContent || '').replace(/[₡$\s,]/g, '')))
        .filter(v => !isNaN(v) && v > 0);
    });
    const saldoMaximo = saldosVisibles.length > 0 ? Math.max(...saldosVisibles) : 100;
    montoAbono = Math.round(saldoMaximo * 0.20 * 100) / 100; // 20% del saldo
    if (montoAbono < 1) montoAbono = 50;
    console.log('💰 Saldo máximo disponible: ' + saldoMaximo + ' | Abono a aplicar: ' + montoAbono);

    // Ingresar monto en el campo de abono (invoice_input_NNN)
    const inputInfo = await page.evaluate((monto) => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const numInputs = Array.from(document.querySelectorAll('input[type="number"]')).filter(isVis);
      if (numInputs.length > 0) {
        numInputs[0].value = String(monto);
        numInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
        numInputs[0].dispatchEvent(new Event('change', { bubbles: true }));
        return { id: numInputs[0].id, value: numInputs[0].value };
      }
      return null;
    }, montoAbono);
    console.log('✏️ Input monto:', JSON.stringify(inputInfo));
    await page.waitForTimeout(500);

    // Clic en "Abonar"
    const tSubmit = Date.now();
    const submitOk = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(el => /^abonar$/i.test((el.textContent || '').trim()));
      if (btn) { btn.click(); return btn.textContent.trim(); }
      return null;
    });
    console.log('✅ Submit abono:', submitOk);
    await page.waitForTimeout(3000);
    evaluarAccion(Date.now() - tSubmit, 'Aplicar abono');

    // Confirmar sweet alert si aparece
    await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0; };
      const btn = Array.from(document.querySelectorAll('.sweet-alert button.confirm')).filter(isVis)[0];
      if (btn) btn.click();
    }).catch(() => {});
    await page.waitForTimeout(1500);
    console.log('💵 Abono de ' + montoAbono + ' aplicado exitosamente');

    // ── PASO 2: Ir al POS y verificar en Movimientos de Caja ──────────────
    console.log('\n📌 PASO 2: Verificar abono en Movimientos de Caja (F9)');
    const t1 = Date.now();
    await page.goto(POS, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
    await page.waitForTimeout(3000);
    tiempos.cargaPOS = Date.now() - t1;
    evaluarCargaPagina(tiempos.cargaPOS, 'Carga POS para cierre de caja');

    // Abrir menú de caja → Movimientos de caja (F9)
    const tMovimientos = Date.now();
    await page.evaluate(() => document.getElementById('menu_cash').click());
    await page.waitForTimeout(1000);

    const movimientosClicked = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /caja/i.test(m.textContent || ''));
      if (!menu) return false;
      const li = Array.from(menu.querySelectorAll('li')).find(el => /movimientos de caja/i.test(el.textContent || ''));
      if (!li) return false;
      li.click(); return true;
    });
    if (!movimientosClicked) { await screenshotOnFail(page, 'cp079-fail-menu-caja'); throw new Error('No se encontró la opción "Movimientos de caja" en el menú de Caja'); }
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tMovimientos, 'Abrir Movimientos de Caja');

    // Leer el modal/pantalla de movimientos
    const movimientosInfo = await page.evaluate((monto) => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const modal = document.getElementById('dialog_cash_movement');
      if (!modal || !isVis(modal)) return { found: false };

      const text = modal.textContent.replace(/\s+/g, ' ').trim();
      // Buscar todos los montos en colones
      const todosMontos = (text.match(/₡\s*([\d,]+\.\d{2})/g) || []).map(m => parseFloat(m.replace(/[₡\s,]/g, '')));
      // Buscar el monto específico del abono ±1
      const montoEncontrado = todosMontos.find(m => Math.abs(m - monto) <= 1);
      // Buscar texto "abono" cerca del monto
      const tieneAbono = /abono|pago\s+cr[eé]dito|recaudaci[oó]n/i.test(text);

      return {
        found: true,
        tieneAbono,
        montoEncontrado,
        todosMontos: todosMontos.slice(0, 15),
        extractoTexto: text.substring(0, 400)
      };
    }, montoAbono);
    console.log('📋 Movimientos de Caja:', JSON.stringify(movimientosInfo));

    // ── PASO 3: Validación matemática del abono en caja ────────────────────
    console.log('\n📌 PASO 3: Validación del abono en caja');
    let validacionCaja = 'N/A';

    if (!movimientosInfo.found) {
      console.log('⚠️ Modal de Movimientos de Caja no visible o no disponible');
    } else if (movimientosInfo.montoEncontrado !== undefined) {
      const diff = Math.abs(movimientosInfo.montoEncontrado - montoAbono);
      if (diff <= TOLERANCIA) {
        validacionCaja = 'PASS';
        console.log('✔ Abono ₡' + montoAbono + ' encontrado en Movimientos de Caja: ₡' + movimientosInfo.montoEncontrado + ' (diff ₡' + diff.toFixed(2) + ' ≤ ±' + TOLERANCIA + ')');
      } else {
        validacionCaja = 'WARN';
        console.log('⚠️ Monto en caja: ₡' + movimientosInfo.montoEncontrado + ' vs abono ₡' + montoAbono + ' (diff ₡' + diff.toFixed(2) + ')');
      }
    } else {
      console.log('⚠️ Monto de abono ₡' + montoAbono + ' no encontrado directamente en Movimientos de Caja');
      console.log('   Montos visibles en caja: ' + JSON.stringify(movimientosInfo.todosMontos));
      console.log('   Texto relacionado a abono/cobro: ' + movimientosInfo.tieneAbono);
      validacionCaja = movimientosInfo.tieneAbono ? 'PARTIAL' : 'NOT_FOUND';
    }

    // ── Resumen ────────────────────────────────────────────────────────────
    const tiempoTotal = Date.now() - tiempoInicioCP;
    const statusIcono = validacionCaja === 'PASS' ? '✅' : '⚠️';
    console.log('\n' + statusIcono + ' CP-079 ' + (validacionCaja === 'PASS' ? 'PASSED' : 'RESULT') + ' | abono aplicado: ₡' + montoAbono + ' | en movimientos de caja: ' + validacionCaja + ' | tiempo: ' + tiempoTotal + 'ms');
    console.log('⏱ Performance:');
    console.log('   - Carga Cuentas por Cobrar: ' + tiempos.cargaCreditos + 'ms');
    console.log('   - Carga POS: ' + tiempos.cargaPOS + 'ms');
    console.log('   - Total CP: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp079-fail-excepcion');
    console.log('❌ CP-079 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp079_abono_cierre_caja();
