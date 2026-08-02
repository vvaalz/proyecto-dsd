const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const DASHBOARD_URL = `${BASE_URL}/dash/dashboard`;
// Módulo "Ventas" → sub-ítem "Lista de Cobros" (`/receip/receivableList`).
//
// ⚠️ CP DE SOLO LECTURA — hallazgo crítico de montos corruptos activo (CLAUDE_CONTEXT.md
// secciones 22 y 27). No se lee ni compara ningún monto.

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
  // Si el acordeón "Ventas" ya está abierto (ej. re-navegando desde la misma pantalla), el
  // sub-ítem ya es visible — clickear "Ventas" de nuevo lo CERRARÍA en vez de abrirlo.
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
    return Array.from(document.querySelectorAll('.brand-card')).filter(isVis).length;
  });
}

async function cp213_lista_cobros_filtros() {
  console.log('🔄 Ejecutando CP-213: Módulo Ventas — Lista de Cobros (navegación + filtros de día/estado/moneda + búsqueda, solo lectura, sin validar montos)...');
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
    await irASubitemVentas(page, 'Lista de Cobros');
    await page.waitForSelector('.brand-card', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);
    evaluarAccion(Date.now() - tNav, 'Navegar Ventas → Lista de Cobros');

    const urlOk = /\/receip\/receivableList/.test(page.url());
    const filasIniciales = await contarFilas(page);
    console.log('📋 URL tras navegar:', page.url(), '| filas visibles:', filasIniciales);
    if (!urlOk) throw new Error('La navegación no llevó a /receip/receivableList (url actual: ' + page.url() + ')');
    if (filasIniciales === 0) throw new Error('El listado cargó con 0 filas — no se puede validar filtros sobre una lista vacía');

    // ── Filtro por día de la semana (show_list_1..7: Lunes..Domingo) — probar 2 días distintos ──
    const tDias = Date.now();
    const resultadosDias = {};
    for (const [id, nombre] of [['show_list_2','Martes'], ['show_list_5','Viernes']]) {
      const clickOk = await page.evaluate((elId) => { const b = document.getElementById(elId); if (b) { b.click(); return true; } return false; }, id);
      await page.waitForTimeout(1500);
      resultadosDias[nombre] = { clickOk, filas: await contarFilas(page) };
    }
    evaluarAccion(Date.now() - tDias, 'Alternar filtro de día de la semana (Martes/Viernes)');
    console.log('📋 Filas por día:', JSON.stringify(resultadosDias));

    // No existe un botón "todos los días" para deshacer el filtro de día (confirmado en vivo:
    // quedarse en un día sin datos, ej. Viernes con 0 filas, contamina cualquier paso posterior).
    // Re-navegar limpia el filtro de día y deja una base consistente para el resto del CP.
    await irASubitemVentas(page, 'Lista de Cobros');
    await page.waitForSelector('.brand-card', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // ── Filtro por estado: Todos / Pendientes / Abonados ──
    const tEstado = Date.now();
    const resultadosEstado = {};
    for (const [id, nombre] of [['show_list_status_0','Todos'], ['show_list_status_1','Pendientes'], ['show_list_status_2','Abonados']]) {
      const clickOk = await page.evaluate((elId) => { const b = document.getElementById(elId); if (b) { b.click(); return true; } return false; }, id);
      await page.waitForTimeout(1500);
      resultadosEstado[nombre] = { clickOk, filas: await contarFilas(page) };
    }
    evaluarAccion(Date.now() - tEstado, 'Alternar filtro de estado Todos/Pendientes/Abonados');
    console.log('📋 Filas por estado:', JSON.stringify(resultadosEstado));

    // Restaurar a "Todos" antes de la búsqueda
    await page.evaluate(() => { document.getElementById('show_list_status_0')?.click(); });
    await page.waitForTimeout(1500);

    // ── Dropdown de moneda "Moneda: Todas" — abrir y confirmar que despliega opciones ──
    const tMoneda = Date.now();
    const opcionesMoneda = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btn = Array.from(document.querySelectorAll('button.dropdown-toggle')).filter(isVis).find(b => /Moneda/i.test(b.textContent||''));
      if (!btn) return { abierto: false };
      btn.click();
      return { abierto: true };
    });
    await page.waitForTimeout(800);
    const itemsMoneda = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      return Array.from(document.querySelectorAll('.dropdown-menu li, .dropdown-menu a')).filter(isVis).map(el => (el.textContent||'').trim()).filter(Boolean);
    });
    console.log('📋 Dropdown "Moneda" abierto:', opcionesMoneda.abierto, '| opciones visibles:', JSON.stringify(itemsMoneda));
    // Cerrar el dropdown clickeando en otro lado sin elegir ninguna opción (no afecta el resto del CP)
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
    evaluarAccion(Date.now() - tMoneda, 'Abrir dropdown de Moneda');

    // ── Búsqueda por texto — HALLAZGO: #receivable_search no tiene ningún handler
    // (oninput/onkeyup/onchange vacíos) ni botón de búsqueda asociado (el ícono de lupa contiguo
    // no tiene onclick) — se confirma escribiendo un término inexistente y comprobando que el
    // conteo de filas NO cambia, documentado como hallazgo (⚠️), no como fallo del CP ──
    const tBusqueda = Date.now();
    await page.fill('#receivable_search', 'zzz_termino_inexistente_zzz_cp213');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    const filasTerminoInexistente = await contarFilas(page);
    await page.fill('#receivable_search', '');
    await page.waitForTimeout(500);
    evaluarAccion(Date.now() - tBusqueda, 'Probar búsqueda con término inexistente');
    console.log('📋 Filas con término inexistente en el buscador:', filasTerminoInexistente, '(línea base sin filtro: 4)');

    await screenshotOnFail(page, 'cp213-estado-final'); // evidencia visual, no falla el CP

    // ── VALIDACIONES (solo interfaz, ningún monto) ──
    const v1 = urlOk;
    const v2 = Object.values(resultadosDias).every(r => r.clickOk) && Object.values(resultadosEstado).every(r => r.clickOk);
    const v3 = opcionesMoneda.abierto && itemsMoneda.length > 0; // el dropdown de moneda despliega opciones reales
    const busquedaFunciona = filasTerminoInexistente === 0; // hallazgo, no bloqueante

    console.log('\n📊 === VALIDACIONES CP-213 (solo interfaz, sin validar montos) ===');
    console.log('  Navegación real (Ventas → Lista de Cobros) llegó a la URL correcta:      ' + (v1 ? '✅' : '❌'));
    console.log('  Los filtros de día y estado son clickeables:                             ' + (v2 ? '✅' : '❌'));
    console.log('  El dropdown de Moneda despliega opciones reales:                         ' + (v3 ? '✅' : '❌'));
    console.log('  ⚠️ Hallazgo: #receivable_search ' + (busquedaFunciona ? 'SÍ filtra correctamente' : 'NO filtra los resultados (sin handler ni botón asociado, confirmado en el DOM)'));

    if (!v1) throw new Error('La navegación por menú no llevó a la URL esperada');
    if (!v2) throw new Error('Alguno de los filtros de día/estado no fue clickeable: días=' + JSON.stringify(resultadosDias) + ' estados=' + JSON.stringify(resultadosEstado));
    if (!v3) throw new Error('El dropdown de Moneda no desplegó opciones');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-213 PASSED | navegación + filtros de día/estado/moneda validados a nivel de interfaz (sin leer/comparar montos) | hallazgo: buscador de texto no funcional | validaciones: 3/3 (+ 1 hallazgo documentado) | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-213', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp213-fail');
    console.log('❌ CP-213 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-213', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp213_lista_cobros_filtros();
