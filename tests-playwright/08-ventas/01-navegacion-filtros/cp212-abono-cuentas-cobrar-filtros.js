const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const DASHBOARD_URL = `${BASE_URL}/dash/dashboard`;
// Módulo "Ventas" → sub-ítem "Abono Cuentas por Cobrar" (`/credit_sale/clientCreditSales`).
//
// ⚠️ CP DE SOLO LECTURA — hallazgo crítico de montos corruptos activo (CLAUDE_CONTEXT.md
// secciones 22 y 27). No se lee ni compara ningún monto. Tampoco se hace clic en "Abonar" ni en
// el ícono de detalle por fila (`btn_pay_customer_invoice_N`/`btn_get_customer_detail_N`) — esas
// acciones abren un flujo de pago real, fuera del alcance de "solo lectura" pedido.

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function navegarADashboard(browser, context) {
  let page = await context.newPage();
  await page.goto(DASHBOARD_URL, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(3000);
  if (/\/log\/login/i.test(page.url())) {
    console.log('⚠️ Sesión expirada — regenerando y reintentando...');
    await page.close();
    fs.rmSync(SESION_PATH, { force: true });
    const contextNuevo = await abrirContextoConSesion(browser);
    page = await contextNuevo.newPage();
    await page.goto(DASHBOARD_URL, { waitUntil: 'load', timeout: 180000 });
    await page.waitForTimeout(3000);
    if (/\/log\/login/i.test(page.url())) throw new Error('Sigue redirigiendo a /log/login tras regenerar la sesión');
    return { context: contextNuevo, page };
  }
  return { context, page };
}

async function irASubitemVentas(page, textoSubitem) {
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const item = Array.from(document.querySelectorAll('a')).filter(isVis).find(a => (a.textContent||'').trim() === 'Ventas' && a.getAttribute('href') === 'javascript:void(0);');
    item?.click();
  });
  await page.waitForTimeout(1200);
  const subOk = await page.evaluate((texto) => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const sub = Array.from(document.querySelectorAll('a')).filter(isVis).find(a => (a.textContent||'').trim() === texto);
    if (!sub) return false;
    sub.click();
    return true;
  }, textoSubitem);
  if (!subOk) throw new Error('No se encontró/pudo clickear el sub-ítem "' + textoSubitem + '" del menú "Ventas"');
  await page.waitForTimeout(3000);
  return true;
}

// Proxy de "filas": contar botones "Abonar" (uno por factura con saldo pendiente en pantalla)
async function contarFilas(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return Array.from(document.querySelectorAll('[id^="btn_pay_customer_invoice_"]')).filter(isVis).length;
  });
}

async function cp212_abono_cuentas_cobrar_filtros() {
  console.log('🔄 Ejecutando CP-212: Módulo Ventas — Abono Cuentas por Cobrar (navegación + filtros de estado + búsqueda, solo lectura, sin validar montos)...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarADashboard(browser, context));
    await page.waitForTimeout(1000);
    await page.evaluate(() => { document.getElementById('workshop-web-notification-permission-dismiss')?.click(); });
    await page.waitForTimeout(500);
    evaluarCargaPagina(Date.now() - t0, 'Carga Dashboard');

    const tNav = Date.now();
    await irASubitemVentas(page, 'Abono Cuentas por Cobrar');
    await page.waitForSelector('[id^="btn_pay_customer_invoice_"]', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);
    evaluarAccion(Date.now() - tNav, 'Navegar Ventas → Abono Cuentas por Cobrar');

    const urlOk = /\/credit_sale\/clientCreditSales/.test(page.url());
    const filasIniciales = await contarFilas(page);
    console.log('📋 URL tras navegar:', page.url(), '| filas visibles:', filasIniciales);
    if (!urlOk) throw new Error('La navegación no llevó a /credit_sale/clientCreditSales (url actual: ' + page.url() + ')');
    if (filasIniciales === 0) throw new Error('El listado cargó con 0 filas — no se puede validar filtros sobre una lista vacía');

    // ── Filtro de estado: Pendientes / Canceladas (botones #state_pending / #state_paid). Se
    // confirma con una petición de red real (no con el conteo de filas — el botón "Abonar" por
    // cliente resultó NO ser un proxy confiable, el mismo conteo apareció en ambos estados,
    // posiblemente porque la vista agrupa por cliente y no por factura individual) ──
    const tEstado = Date.now();
    const [respPendientes] = await Promise.all([
      page.waitForResponse(r => r.request().method() === 'POST' || /credit_sale/i.test(r.url()), { timeout: 8000 }).catch(() => null),
      page.evaluate(() => { document.getElementById('state_pending')?.click(); }),
    ]);
    await page.waitForTimeout(1200);
    const filasPendientes = await contarFilas(page);
    const activaPendientes = await page.evaluate(() => document.getElementById('state_pending')?.classList.contains('btn_sale_selected') || document.getElementById('state_pending')?.className.includes('active'));

    const [respCanceladas] = await Promise.all([
      page.waitForResponse(r => r.request().method() === 'POST' || /credit_sale/i.test(r.url()), { timeout: 8000 }).catch(() => null),
      page.evaluate(() => { document.getElementById('state_paid')?.click(); }),
    ]);
    await page.waitForTimeout(1200);
    const filasCanceladas = await contarFilas(page);
    const activaCanceladas = await page.evaluate(() => document.getElementById('state_paid')?.classList.contains('btn_sale_selected') || document.getElementById('state_paid')?.className.includes('active'));
    evaluarAccion(Date.now() - tEstado, 'Alternar filtro de estado Pendientes/Canceladas');
    console.log('📋 Pendientes → filas:', filasPendientes, '(activo:', activaPendientes, ', petición disparada:', !!respPendientes, ') | Canceladas → filas:', filasCanceladas, '(activo:', activaCanceladas, ', petición disparada:', !!respCanceladas, ')');

    // Volver a Pendientes (estado por defecto más útil) antes de la búsqueda
    await page.evaluate(() => { document.getElementById('state_pending')?.click(); });
    await page.waitForTimeout(1500);

    // ── Búsqueda por texto — término inexistente debe filtrar a 0 filas ──
    const tBusqueda = Date.now();
    await page.fill('#search', 'zzz_termino_inexistente_zzz_cp212');
    await page.evaluate(() => { document.getElementById('btn_search')?.click(); });
    await page.waitForTimeout(2000);
    const filasTerminoInexistente = await contarFilas(page);
    await page.fill('#search', '');
    await page.evaluate(() => { document.getElementById('btn_search')?.click(); });
    await page.waitForTimeout(2000);
    const filasTrasLimpiar = await contarFilas(page);
    evaluarAccion(Date.now() - tBusqueda, 'Buscar por término inexistente y limpiar búsqueda');
    console.log('📋 Filas con término inexistente:', filasTerminoInexistente, '| filas tras limpiar búsqueda:', filasTrasLimpiar);

    await screenshotOnFail(page, 'cp212-estado-final'); // evidencia visual, no falla el CP

    // ── VALIDACIONES (solo interfaz, ningún monto) ──
    const v1 = urlOk;
    const v2 = activaPendientes && activaCanceladas; // ambos botones de estado marcan su clase activa al clickearse
    const v3 = !!respPendientes && !!respCanceladas; // ambos disparan una consulta real al servidor (no son un no-op puramente visual)
    const v4 = filasTerminoInexistente === 0;
    const v5 = filasTrasLimpiar > filasTerminoInexistente;

    console.log('\n📊 === VALIDACIONES CP-212 (solo interfaz, sin validar montos) ===');
    console.log('  Navegación real (Ventas → Abono Cuentas por Cobrar) llegó a la URL correcta: ' + (v1 ? '✅' : '❌'));
    console.log('  Los botones "Pendientes"/"Canceladas" marcan su estado activo al clickearse:  ' + (v2 ? '✅' : '❌ (pendientes:' + activaPendientes + ', canceladas:' + activaCanceladas + ')'));
    console.log('  Ambos filtros de estado disparan una consulta real al servidor:               ' + (v3 ? '✅' : '❌'));
    console.log('  Buscar un término inexistente devuelve 0 resultados:                          ' + (v4 ? '✅' : '❌ (' + filasTerminoInexistente + ' filas)'));
    console.log('  Limpiar la búsqueda restaura el listado:                                       ' + (v5 ? '✅' : '❌ (' + filasTrasLimpiar + ' filas)'));

    if (!v1) throw new Error('La navegación por menú no llevó a la URL esperada');
    if (!v2) throw new Error('Los botones de estado no marcaron su clase activa al clickearse');
    if (!v3) throw new Error('Alguno de los filtros de estado no disparó ninguna consulta al servidor');
    if (!v4) throw new Error('La búsqueda con un término inexistente devolvió ' + filasTerminoInexistente + ' filas (se esperaba 0)');
    if (!v5) throw new Error('Limpiar la búsqueda no restauró el listado (' + filasTrasLimpiar + ' filas, se esperaba más que ' + filasTerminoInexistente + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-212 PASSED | navegación + filtro de estado (Pendientes/Canceladas) + búsqueda validados a nivel de interfaz (sin leer/comparar montos ni clickear "Abonar") | validaciones: 5/5 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-212', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp212-fail');
    console.log('❌ CP-212 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-212', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp212_abono_cuentas_cobrar_filtros();
