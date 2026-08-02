const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const DASHBOARD_URL = `${BASE_URL}/dash/dashboard`;
// Módulo "Ventas" → sub-ítem "Historial Mov. de Caja" (`/cash_movement/movements`).
//
// ⚠️ CP DE SOLO LECTURA — hallazgo crítico de montos corruptos activo (CLAUDE_CONTEXT.md
// secciones 22 y 27). No se lee ni compara ningún monto.
//
// ⚠️ Gap de datos confirmado en vivo: este ambiente QA no tiene NINGÚN movimiento de caja
// registrado (0 filas, área principal vacía) — no es un error de selector, es un estado real
// "sin datos". Por eso los filtros se validan contra una petición de red real disparada al
// servidor, no contra un cambio en el conteo de filas (que se mantiene en 0 en cualquier caso).

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
  const yaVisible = await page.evaluate((texto) => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return Array.from(document.querySelectorAll('a')).filter(isVis).some(a => (a.textContent||'').trim() === texto);
  }, textoSubitem);
  if (!yaVisible) {
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const item = Array.from(document.querySelectorAll('a')).filter(isVis).find(a => (a.textContent||'').trim() === 'Ventas' && a.getAttribute('href') === 'javascript:void(0);');
      item?.click();
    });
    await page.waitForTimeout(1200);
  }
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

async function esperarPeticion(page, accion) {
  const [resp] = await Promise.all([
    page.waitForResponse(r => r.request().method() === 'POST', { timeout: 10000 }).catch(() => null),
    accion(),
  ]);
  await page.waitForTimeout(1000);
  return resp;
}

async function cp208_historial_mov_caja_filtros() {
  console.log('🔄 Ejecutando CP-208: Módulo Ventas — Historial Mov. de Caja (navegación + filtros de fecha/búsqueda, solo lectura, sin validar montos)...');
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
    await irASubitemVentas(page, 'Historial Mov. de Caja');
    await page.waitForSelector('#start_date', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);
    evaluarAccion(Date.now() - tNav, 'Navegar Ventas → Historial Mov. de Caja');

    const urlOk = /\/cash_movement\/movements/.test(page.url());
    const camposPresentes = await page.evaluate(() => ({
      search: !!document.getElementById('receip_search'),
      startDate: !!document.getElementById('start_date'),
      endDate: !!document.getElementById('end_date'),
    }));
    console.log('📋 URL tras navegar:', page.url(), '| campos presentes:', JSON.stringify(camposPresentes));
    if (!urlOk) throw new Error('La navegación no llevó a /cash_movement/movements (url actual: ' + page.url() + ')');
    if (!camposPresentes.search || !camposPresentes.startDate || !camposPresentes.endDate) throw new Error('No se encontraron los 3 campos de filtro esperados: ' + JSON.stringify(camposPresentes));

    // Nota explícita (rigor): este ambiente QA no tiene ningún movimiento de caja registrado
    // (confirmado en exploración previa) — los filtros se validan por la petición de red que
    // disparan, no por un cambio observable en el listado (que permanece vacío en cualquier caso).
    const filasIniciales = await page.evaluate(() => document.querySelectorAll('.receip_item, .brand-card').length);
    console.log('⚠️ Filas iniciales visibles:', filasIniciales, '(se espera 0 en este ambiente — gap de datos ya documentado, no es un error del CP)');

    // ── Filtro de fecha (un solo día) — confirmar que dispara una consulta real ──
    const tFecha = Date.now();
    const fechaAyer = (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); })();
    const respFecha = await esperarPeticion(page, async () => {
      await page.fill('#start_date', fechaAyer);
      await page.fill('#end_date', fechaAyer);
      // Algunos inputs date requieren un 'change' explícito además del fill (Playwright dispara
      // input/change nativos, pero el handler de la app puede escuchar específicamente 'change'
      // en el segundo campo tras perder foco) — reforzar con dispatchEvent + blur.
      await page.evaluate(() => {
        document.getElementById('end_date')?.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('end_date')?.blur();
      });
    });
    evaluarAccion(Date.now() - tFecha, 'Aplicar filtro de fecha (un solo día)');
    console.log('📋 Filtro de fecha (' + fechaAyer + ') disparó petición al servidor:', !!respFecha);

    // Restaurar rango de fechas amplio
    const fechaAmplia = '2020-01-01';
    const hoy = new Date().toISOString().slice(0,10);
    await page.fill('#start_date', fechaAmplia);
    await page.fill('#end_date', hoy);
    await page.waitForTimeout(1500);

    // ── Búsqueda por texto — confirmar que dispara una consulta real ──
    const tBusqueda = Date.now();
    const respBusqueda = await esperarPeticion(page, async () => {
      await page.fill('#receip_search', 'zzz_termino_inexistente_zzz_cp208');
      await page.keyboard.press('Enter');
    });
    evaluarAccion(Date.now() - tBusqueda, 'Probar búsqueda por texto');
    console.log('📋 Búsqueda por texto disparó petición al servidor:', !!respBusqueda);
    await page.fill('#receip_search', '');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    await screenshotOnFail(page, 'cp208-estado-final'); // evidencia visual, no falla el CP

    // ── VALIDACIONES (solo interfaz, ningún monto) ──
    const v1 = urlOk;
    const v2 = camposPresentes.search && camposPresentes.startDate && camposPresentes.endDate;
    const v3 = !!respFecha;
    const v4 = !!respBusqueda;

    console.log('\n📊 === VALIDACIONES CP-208 (solo interfaz, sin validar montos) ===');
    console.log('  Navegación real (Ventas → Historial Mov. de Caja) llegó a la URL correcta: ' + (v1 ? '✅' : '❌'));
    console.log('  Los 3 campos de filtro esperados están presentes:                          ' + (v2 ? '✅' : '❌'));
    console.log('  El filtro de fecha dispara una consulta real al servidor:                  ' + (v3 ? '✅' : '❌'));
    console.log('  La búsqueda por texto dispara una consulta real al servidor:                ' + (v4 ? '✅' : '❌'));
    console.log('  ⚠️ Gap de datos (no bloqueante): 0 movimientos de caja en este ambiente QA — no se pudo confirmar visualmente que los filtros acoten resultados, solo que consultan al servidor.');

    if (!v1) throw new Error('La navegación por menú no llevó a la URL esperada');
    if (!v2) throw new Error('No se encontraron los 3 campos de filtro esperados');
    if (!v3) throw new Error('El filtro de fecha no disparó ninguna consulta al servidor');
    if (!v4) throw new Error('La búsqueda por texto no disparó ninguna consulta al servidor');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-208 PASSED | navegación + filtros de fecha/búsqueda validados por consulta real al servidor (sin leer/comparar montos; 0 movimientos reales en este ambiente) | validaciones: 4/4 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-208', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp208-fail');
    console.log('❌ CP-208 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-208', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp208_historial_mov_caja_filtros();
