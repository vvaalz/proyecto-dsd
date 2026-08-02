const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const DASHBOARD_URL = `${BASE_URL}/dash/dashboard`;
// Módulo "Ventas" → sub-ítem "Nota de crédito" (`/creditNote/creditNote`).
//
// ⚠️ CP DE SOLO LECTURA — hallazgo crítico de montos corruptos activo (CLAUDE_CONTEXT.md
// secciones 22 y 27, esta última documenta que el panel resumen de ESTA MISMA pantalla ya
// muestra montos corruptos agregados). No se lee ni compara ningún monto. Tampoco se interactúa
// con el dropdown "Acciones" (`#btn_credit_note_actions`) ni los menús "..." por fila
// (`.nc-dot-btn`) — esos disparan flujos reales de anulación/devolución, fuera de alcance.

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
    // Fila = contenedor de cada botón "..." (.nc-dot-btn), un botón por nota de crédito listada
    return Array.from(document.querySelectorAll('.nc-dot-btn')).filter(isVis).length;
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

async function cp210_nota_credito_filtros() {
  console.log('🔄 Ejecutando CP-210: Módulo Ventas — Nota de crédito (navegación + filtros + búsqueda, solo lectura, sin validar montos)...');
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
    await irASubitemVentas(page, 'Nota de crédito');
    await page.waitForSelector('#nc_compensation_filter', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tNav, 'Navegar Ventas → Nota de crédito');

    const urlOk = /\/creditNote\/creditNote/.test(page.url());
    const filasIniciales = await contarFilas(page);
    console.log('📋 URL tras navegar:', page.url(), '| filas visibles:', filasIniciales);
    if (!urlOk) throw new Error('La navegación no llevó a /creditNote/creditNote (url actual: ' + page.url() + ')');
    if (filasIniciales === 0) throw new Error('El listado cargó con 0 filas — no se puede validar filtros sobre una lista vacía');

    // ── Filtro por select "Devolución/Anulación" (#nc_compensation_filter) ──
    const tSelect = Date.now();
    const opciones = await page.evaluate(() => Array.from(document.getElementById('nc_compensation_filter').options).map(o => o.textContent.trim()));
    console.log('📋 Opciones del filtro Devolución/Anulación:', JSON.stringify(opciones));
    const opcionElegida = opciones.find(o => !/todas/i.test(o)) || opciones[1];
    const respSelect = await esperarPeticion(page, async () => {
      await page.selectOption('#nc_compensation_filter', { label: opcionElegida });
    });
    const filasFiltradas = await contarFilas(page);
    evaluarAccion(Date.now() - tSelect, 'Aplicar filtro Devolución/Anulación = "' + opcionElegida + '"');
    console.log('📋 Filtro "' + opcionElegida + '" disparó petición:', !!respSelect, '| filas:', filasFiltradas, '(línea base:', filasIniciales + ')');

    // Restaurar filtro a la primera opción (normalmente "Todas")
    await esperarPeticion(page, async () => { await page.selectOption('#nc_compensation_filter', { index: 0 }); });
    await page.waitForTimeout(500);

    // ── Filtro de fecha (un solo día) ──
    const tFecha = Date.now();
    const fechaAyer = (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); })();
    const respFecha = await esperarPeticion(page, async () => {
      await page.fill('#start_date', fechaAyer);
      await page.fill('#end_date', fechaAyer);
      await page.evaluate(() => {
        document.getElementById('end_date')?.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('end_date')?.blur();
      });
    });
    const filasFechaAyer = await contarFilas(page);
    evaluarAccion(Date.now() - tFecha, 'Aplicar filtro de fecha (un solo día)');
    console.log('📋 Filtro de fecha disparó petición:', !!respFecha, '| filas:', filasFechaAyer, '(línea base:', filasIniciales + ')');

    // Restaurar rango de fechas amplio antes de la búsqueda
    const fechaAmplia = '2020-01-01';
    const hoy = new Date().toISOString().slice(0,10);
    await esperarPeticion(page, async () => {
      await page.fill('#start_date', fechaAmplia);
      await page.fill('#end_date', hoy);
      await page.evaluate(() => {
        document.getElementById('end_date')?.dispatchEvent(new Event('change', { bubbles: true }));
        document.getElementById('end_date')?.blur();
      });
    });
    await page.waitForTimeout(500);

    // ── Búsqueda por texto (placeholder "NC, cliente, factura...") ──
    const tBusqueda = Date.now();
    await page.fill('#receip_search', 'zzz_termino_inexistente_zzz_cp210');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    const filasTerminoInexistente = await contarFilas(page);
    await page.fill('#receip_search', '');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    const filasTrasLimpiar = await contarFilas(page);
    evaluarAccion(Date.now() - tBusqueda, 'Buscar por término inexistente y limpiar búsqueda');
    console.log('📋 Filas con término inexistente:', filasTerminoInexistente, '| filas tras limpiar:', filasTrasLimpiar);

    await screenshotOnFail(page, 'cp210-estado-final'); // evidencia visual, no falla el CP

    // ── VALIDACIONES (solo interfaz, ningún monto) ──
    const v1 = urlOk;
    const v2 = opciones.length > 1 && !!respSelect; // el select tiene más de 1 opción y dispara consulta real
    const v3 = !!respFecha; // el filtro de fecha dispara consulta real
    const v4 = filasTerminoInexistente === 0; // un término inexistente no debe devolver resultados
    const v5 = filasTrasLimpiar > 0; // limpiar la búsqueda restaura el listado

    console.log('\n📊 === VALIDACIONES CP-210 (solo interfaz, sin validar montos) ===');
    console.log('  Navegación real (Ventas → Nota de crédito) llegó a la URL correcta:      ' + (v1 ? '✅' : '❌'));
    console.log('  El filtro Devolución/Anulación tiene opciones reales y consulta al servidor: ' + (v2 ? '✅' : '❌'));
    console.log('  El filtro de fecha dispara una consulta real al servidor:                 ' + (v3 ? '✅' : '❌'));
    console.log('  Buscar un término inexistente devuelve 0 resultados:                      ' + (v4 ? '✅' : '❌ (' + filasTerminoInexistente + ' filas)'));
    console.log('  Limpiar la búsqueda restaura el listado:                                  ' + (v5 ? '✅' : '❌ (' + filasTrasLimpiar + ' filas)'));

    if (!v1) throw new Error('La navegación por menú no llevó a la URL esperada');
    if (!v2) throw new Error('El filtro Devolución/Anulación no funcionó como se esperaba (opciones=' + JSON.stringify(opciones) + ', petición=' + !!respSelect + ')');
    if (!v3) throw new Error('El filtro de fecha no disparó ninguna consulta al servidor');
    if (!v4) throw new Error('La búsqueda con un término inexistente devolvió ' + filasTerminoInexistente + ' filas (se esperaba 0)');
    if (!v5) throw new Error('Limpiar la búsqueda no restauró el listado (' + filasTrasLimpiar + ' filas)');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-210 PASSED | navegación + filtros (Devolución/Anulación, fecha) + búsqueda validados a nivel de interfaz (sin leer/comparar montos, sin tocar Acciones/anulación) | validaciones: 5/5 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-210', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp210-fail');
    console.log('❌ CP-210 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-210', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp210_nota_credito_filtros();
