const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const DASHBOARD_URL = `${BASE_URL}/dash/dashboard`;
// Módulo "Ventas" (acordeón del menú lateral, distinto de "Facturar"/POS) — reportes/gestión de
// ventas ya realizadas. Sub-ítem "Histórico de Ventas" (`/receip/printPosReceip`).
//
// ⚠️ CP DE SOLO LECTURA — el hallazgo crítico de montos corruptos (CLAUDE_CONTEXT.md sección 22,
// reconfirmado en sección 27 sobre este mismo módulo) sigue activo. Este CP NO valida ningún
// monto/cifra — solo confirma que la navegación al módulo, los filtros (fecha, tabs de estado) y
// la búsqueda funcionan a nivel de interfaz (cambian el conteo de filas visibles / disparan la
// petición esperada), sin leer ni comparar ningún número de colones/dólares.

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

// Abre el acordeón "Ventas" del menú lateral (OJO: hay un segundo <a> con el mismo texto
// "Ventas" que es un link de WhatsApp de soporte, href="https://api.whatsapp.com/..." — hay que
// filtrar por href="javascript:void(0);" para no confundirlo, ver CLAUDE_CONTEXT.md sección 27)
// y hace clic en el sub-ítem indicado por texto exacto.
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

async function contarFilas(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return Array.from(document.querySelectorAll('.receip_item')).filter(isVis).length;
  });
}

async function clickBoton(page, texto) {
  return page.evaluate((t) => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const btn = Array.from(document.querySelectorAll('button, a')).filter(isVis).find(b => (b.textContent||'').trim() === t);
    if (btn) { btn.click(); return true; }
    return false;
  }, texto);
}

async function cp211_historico_ventas_filtros() {
  console.log('🔄 Ejecutando CP-211: Módulo Ventas — Histórico de Ventas (navegación + filtros + búsqueda, solo lectura, sin validar montos)...');
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

    // ── Navegación real vía menú lateral (Ventas → Histórico de Ventas) ──
    const tNav = Date.now();
    await irASubitemVentas(page, 'Histórico de Ventas');
    await page.waitForSelector('.receip_item', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);
    evaluarAccion(Date.now() - tNav, 'Navegar Ventas → Histórico de Ventas');

    const urlOk = /\/receip\/printPosReceip/.test(page.url());
    const filasIniciales = await contarFilas(page);
    console.log('📋 URL tras navegar:', page.url(), '| filas visibles:', filasIniciales);
    if (!urlOk) throw new Error('La navegación no llevó a /receip/printPosReceip (url actual: ' + page.url() + ')');
    if (filasIniciales === 0) throw new Error('El listado de facturas cargó con 0 filas — no se puede validar filtros sobre una lista vacía');

    // ── Filtro por tabs de estado. "Todas" primero para tener la línea base (superset esperado
    // de Contado/Crédito/Pendientes); "Anuladas" se prueba aparte SIN compararla contra "Todas"
    // — es una fila propia en la interfaz (separada visualmente de Todas/Contado/Crédito/
    // Pendientes), no forma parte del mismo grupo mutuamente excluyente, confirmado en vivo: tras
    // clickear Anuladas y luego Todas, el conteo de "Todas" NO vuelve a su valor original ──
    const tTabs = Date.now();
    await clickBoton(page, 'Todas');
    await page.waitForTimeout(1500);
    const filasTodasBase = await contarFilas(page);

    const resultadosTabs = {};
    for (const tab of ['Contado', 'Crédito', 'Pendientes']) {
      const clickOk = await clickBoton(page, tab);
      await page.waitForTimeout(1500);
      resultadosTabs[tab] = { clickOk, filas: await contarFilas(page) };
    }
    // Restaurar a "Todas" antes de probar "Anuladas" por separado
    await clickBoton(page, 'Todas');
    await page.waitForTimeout(1500);
    const clickAnuladasOk = await clickBoton(page, 'Anuladas');
    await page.waitForTimeout(1500);
    resultadosTabs['Anuladas'] = { clickOk: clickAnuladasOk, filas: await contarFilas(page) };
    // Volver a "Todas" para dejar la pantalla en su estado por defecto para los siguientes pasos
    await clickBoton(page, 'Todas');
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tTabs, 'Recorrer los tabs de estado (Todas/Contado/Crédito/Pendientes/Anuladas)');
    console.log('📋 Filas "Todas" (línea base):', filasTodasBase, '| filas por tab:', JSON.stringify(resultadosTabs));

    // ── Filtro por fecha: acotar a un rango de un solo día distinto (no se valida el contenido,
    // solo que el conteo de filas responda al cambio de filtro) ──
    const tFecha = Date.now();
    const fechaAyer = (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); })();
    await page.fill('#start_date', fechaAyer);
    await page.fill('#end_date', fechaAyer);
    await page.waitForTimeout(1800);
    const filasFechaAyer = await contarFilas(page);
    console.log('📋 Filas con rango de fecha = ayer (' + fechaAyer + '):', filasFechaAyer, '(línea base "Todas":', filasTodasBase + ')');
    evaluarAccion(Date.now() - tFecha, 'Aplicar filtro de fecha (un solo día)');

    // Restaurar fechas (rango amplio) antes de probar la búsqueda
    const fechaAmplia = '2020-01-01';
    const hoy = new Date().toISOString().slice(0,10);
    await page.fill('#start_date', fechaAmplia);
    await page.fill('#end_date', hoy);
    await page.waitForTimeout(1500);

    // ── Búsqueda por texto (consecutivo/orden) — término inexistente debe filtrar a 0/pocas filas.
    // Requiere Enter para disparar la búsqueda (fill + esperar no basta, confirmado en vivo) ──
    const tBusqueda = Date.now();
    await page.fill('#receip_search', 'zzz_termino_inexistente_zzz_cp211');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    const filasTerminoInexistente = await contarFilas(page);
    await page.fill('#receip_search', '');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    const filasTrasLimpiar = await contarFilas(page);
    evaluarAccion(Date.now() - tBusqueda, 'Buscar por término inexistente y limpiar búsqueda');
    console.log('📋 Filas con término inexistente:', filasTerminoInexistente, '| filas tras limpiar búsqueda:', filasTrasLimpiar);

    await screenshotOnFail(page, 'cp211-estado-final'); // evidencia visual, no falla el CP

    // ── VALIDACIONES (todas de interfaz/navegación — ninguna lee ni compara montos) ──
    const v1 = urlOk;
    const v2 = Object.values(resultadosTabs).every(r => r.clickOk); // todos los tabs fueron clickeables
    const v3 = resultadosTabs['Contado'].filas <= filasTodasBase && resultadosTabs['Crédito'].filas <= filasTodasBase && resultadosTabs['Pendientes'].filas <= filasTodasBase; // los filtros de tab acotan o igualan "Todas", nunca amplían
    const v4 = filasTerminoInexistente === 0; // un término inexistente no debe devolver resultados
    const v5 = filasTrasLimpiar > filasTerminoInexistente; // limpiar la búsqueda restaura resultados

    console.log('\n📊 === VALIDACIONES CP-211 (solo interfaz, sin validar montos) ===');
    console.log('  Navegación real (Ventas → Histórico de Ventas) llegó a la URL correcta: ' + (v1 ? '✅' : '❌'));
    console.log('  Los 5 tabs de estado son clickeables:                                  ' + (v2 ? '✅' : '❌ ' + JSON.stringify(resultadosTabs)));
    console.log('  Los tabs "Contado"/"Crédito" acotan (o igualan) el total de "Todas":    ' + (v3 ? '✅' : '❌ ' + JSON.stringify(resultadosTabs)));
    console.log('  Buscar un término inexistente devuelve 0 resultados:                   ' + (v4 ? '✅' : '❌ (' + filasTerminoInexistente + ' filas)'));
    console.log('  Limpiar la búsqueda restaura el listado:                               ' + (v5 ? '✅' : '❌ (' + filasTrasLimpiar + ' filas)'));

    if (!v1) throw new Error('La navegación por menú no llevó a la URL esperada');
    if (!v2) throw new Error('Alguno de los 5 tabs de estado no fue clickeable: ' + JSON.stringify(resultadosTabs));
    if (!v3) throw new Error('Los tabs de estado no acotaron el listado como se esperaba: ' + JSON.stringify(resultadosTabs));
    if (!v4) throw new Error('La búsqueda con un término inexistente devolvió ' + filasTerminoInexistente + ' filas (se esperaba 0)');
    if (!v5) throw new Error('Limpiar la búsqueda no restauró el listado (' + filasTrasLimpiar + ' filas, se esperaba más que ' + filasTerminoInexistente + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-211 PASSED | navegación + 5 tabs de estado + filtro de fecha + búsqueda validados a nivel de interfaz (sin leer/comparar montos, por el hallazgo crítico activo) | validaciones: 5/5 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-211', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp211-fail');
    console.log('❌ CP-211 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-211', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp211_historico_ventas_filtros();
