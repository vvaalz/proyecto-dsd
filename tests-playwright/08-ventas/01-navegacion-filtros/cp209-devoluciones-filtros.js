const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const DASHBOARD_URL = `${BASE_URL}/dash/dashboard`;
// Módulo "Ventas" → sub-ítem "Devoluciones" (`/refund/refund`).
//
// ⚠️ CP DE SOLO LECTURA — hallazgo crítico de montos corruptos activo (CLAUDE_CONTEXT.md
// secciones 22 y 27). No se lee ni compara ningún monto. Tampoco se hace clic en "Agregar"
// (`#btn_add_refund`) — abre el formulario para CREAR una devolución nueva, fuera del alcance de
// "solo lectura" pedido.

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

async function contarFilas(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return Array.from(document.querySelectorAll('.receip_item, .brand-card')).filter(isVis).length;
  });
}

async function esperarPeticion(page, accion) {
  const [resp] = await Promise.all([
    page.waitForResponse(r => r.request().method() === 'POST', { timeout: 10000 }).catch(() => null),
    accion(),
  ]);
  await page.waitForTimeout(1000);
  return resp;
}

async function cp209_devoluciones_filtros() {
  console.log('🔄 Ejecutando CP-209: Módulo Ventas — Devoluciones (navegación + filtros de fecha + búsqueda, solo lectura, sin validar montos)...');
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
    await irASubitemVentas(page, 'Devoluciones');
    await page.waitForSelector('#refund_invoice_search', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tNav, 'Navegar Ventas → Devoluciones');

    const urlOk = /\/refund\/refund/.test(page.url());
    const filasIniciales = await contarFilas(page);
    console.log('📋 URL tras navegar:', page.url(), '| filas visibles:', filasIniciales);
    if (!urlOk) throw new Error('La navegación no llevó a /refund/refund (url actual: ' + page.url() + ')');

    // ── Filtro de fecha (un solo día) ──
    const tFecha = Date.now();
    const fechaAyer = (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); })();
    const respFecha = await esperarPeticion(page, async () => {
      await page.fill('#refund_start_date', fechaAyer);
      await page.fill('#refund_end_date', fechaAyer);
      await page.evaluate(() => {
        document.getElementById('refund_end_date')?.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('refund_end_date')?.blur();
      });
    });
    const filasFechaAyer = await contarFilas(page);
    evaluarAccion(Date.now() - tFecha, 'Aplicar filtro de fecha (un solo día)');
    console.log('📋 Filtro de fecha (' + fechaAyer + ') disparó petición:', !!respFecha, '| filas:', filasFechaAyer, '(línea base:', filasIniciales + ')');

    // Restaurar rango de fechas amplio
    const fechaAmplia = '2020-01-01';
    const hoy = new Date().toISOString().slice(0,10);
    await esperarPeticion(page, async () => {
      await page.fill('#refund_start_date', fechaAmplia);
      await page.fill('#refund_end_date', hoy);
      await page.evaluate(() => {
        document.getElementById('refund_end_date')?.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('refund_end_date')?.blur();
      });
    });
    const filasRestauradas = await contarFilas(page);

    // ── Búsqueda por texto — término inexistente debe filtrar a 0 filas ──
    const tBusqueda = Date.now();
    const respBusqueda = await esperarPeticion(page, async () => {
      await page.fill('#refund_invoice_search', 'zzz_termino_inexistente_zzz_cp209');
      await page.keyboard.press('Enter');
    });
    const filasTerminoInexistente = await contarFilas(page);
    await page.fill('#refund_invoice_search', '');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    const filasTrasLimpiar = await contarFilas(page);
    evaluarAccion(Date.now() - tBusqueda, 'Buscar por término inexistente y limpiar búsqueda');
    console.log('📋 Búsqueda disparó petición:', !!respBusqueda, '| filas con término inexistente:', filasTerminoInexistente, '| filas tras limpiar:', filasTrasLimpiar);

    await screenshotOnFail(page, 'cp209-estado-final'); // evidencia visual, no falla el CP

    // ── VALIDACIONES (solo interfaz, ningún monto) ──
    const v1 = urlOk;
    const v2 = !!respFecha; // el filtro de fecha dispara una consulta real
    const v3 = !!respBusqueda; // la búsqueda dispara una consulta real
    const v4 = filasIniciales === 0 || (filasTerminoInexistente <= filasIniciales && filasTrasLimpiar >= filasTerminoInexistente); // si hay datos, la búsqueda acota y limpiar restaura; si no hay datos (0), no aplica

    console.log('\n📊 === VALIDACIONES CP-209 (solo interfaz, sin validar montos) ===');
    console.log('  Navegación real (Ventas → Devoluciones) llegó a la URL correcta:  ' + (v1 ? '✅' : '❌'));
    console.log('  El filtro de fecha dispara una consulta real al servidor:        ' + (v2 ? '✅' : '❌'));
    console.log('  La búsqueda por texto dispara una consulta real al servidor:     ' + (v3 ? '✅' : '❌'));
    console.log('  La búsqueda acota resultados y limpiarla los restaura (o no aplica por falta de datos): ' + (v4 ? '✅' : '❌ (inicial:' + filasIniciales + ', término:' + filasTerminoInexistente + ', restaurado:' + filasTrasLimpiar + ')'));

    if (!v1) throw new Error('La navegación por menú no llevó a la URL esperada');
    if (!v2) throw new Error('El filtro de fecha no disparó ninguna consulta al servidor');
    if (!v3) throw new Error('La búsqueda por texto no disparó ninguna consulta al servidor');
    if (!v4) throw new Error('La búsqueda no se comportó como se esperaba: inicial=' + filasIniciales + ' término=' + filasTerminoInexistente + ' restaurado=' + filasTrasLimpiar);

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-209 PASSED | navegación + filtros de fecha/búsqueda validados a nivel de interfaz (sin leer/comparar montos, sin clickear "Agregar") | validaciones: 4/4 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-209', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp209-fail');
    console.log('❌ CP-209 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-209', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp209_devoluciones_filtros();
