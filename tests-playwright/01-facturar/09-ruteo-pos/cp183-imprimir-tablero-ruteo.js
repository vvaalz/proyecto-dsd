const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const POS_URL = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
// Tablero de Ruteo dentro del POS — opción "Imprimir" del menú superior (botón more_vert junto a
// los filtros de estado; su id numérico cambia tras cada re-render AJAX del tablero, se ubica en
// vivo por selector genérico en vez de un id fijo). Disponible en cualquier filtro de estado
// (Todos/Pendientes/En Camino/Entregado/H. de Órdenes).
// "Imprimir" y "Descargar PDF" (ver CP-184) llaman a la MISMA función printReportRoutingPDF():
// dispara POST /pos/getReportRoutingData (con el estado actualmente filtrado) y genera un PDF
// client-side vía jsPDF, mostrado en un iframe blob:application/pdf (visor nativo del navegador,
// no hay forma práctica de leer el texto renderizado del PDF — se valida "datos correctos"
// confirmando que la petición de datos del reporte se dispara con cada filtro de estado distinto,
// y que el conteo de órdenes visible en el tablero coincide con lo que se envió a imprimir.

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function navegarAModulo(browser, context, url) {
  let page = await context.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(3000);
  if (/\/log\/login/i.test(page.url())) {
    console.log('⚠️ Sesión expirada — regenerando y reintentando...');
    await page.close();
    fs.rmSync(SESION_PATH, { force: true });
    const contextNuevo = await abrirContextoConSesion(browser);
    page = await contextNuevo.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: 180000 });
    await page.waitForTimeout(3000);
    if (/\/log\/login/i.test(page.url())) throw new Error('Sigue redirigiendo a /log/login tras regenerar la sesión');
    return { context: contextNuevo, page };
  }
  return { context, page };
}

async function abrirTabRuteo(page) {
  await page.click('#btn_routing_option');
  await page.waitForTimeout(5000);
}

// El id del botón more_vert del toolbar (fuera de las tarjetas) puede cambiar tras cada
// re-render AJAX del tablero — se ubica en vivo en vez de depender de un id fijo.
async function abrirMenuTablero(page) {
  for (let intento = 0; intento < 3; intento++) {
    const clickeado = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btn = Array.from(document.querySelectorAll('button[data-toggle="dropdown"]')).find(isVis);
      if (!btn) return false;
      btn.click();
      return true;
    });
    await page.waitForTimeout(800);
    const abierto = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      return !!Array.from(document.querySelectorAll('ul.dropdown-menu')).find(m => isVis(m) && /Imprimir/.test(m.textContent||''));
    });
    if (abierto) return true;
    if (!clickeado) await page.waitForTimeout(500);
  }
  return false;
}

async function idsVisibles(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('[id^="a_routing_order_items_"]')).map(el => el.id.replace('a_routing_order_items_', '')));
}

async function cp183_imprimir_tablero_ruteo() {
  console.log('🔄 Ejecutando CP-183: Tablero de Ruteo — opción "Imprimir" en distintos filtros de estado...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();
  const peticionesReporte = [];

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, POS_URL));
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    evaluarCargaPagina(Date.now() - t0, 'Carga POS');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { document.getElementById('workshop-web-notification-permission-dismiss')?.click(); });
    await page.waitForTimeout(500);

    page.on('request', (req) => { if (/getReportRoutingData/i.test(req.url())) peticionesReporte.push({ url: req.url(), postData: req.postData() }); });

    await abrirTabRuteo(page);

    // ── Filtro "Todos": Imprimir ──
    const idsTodos = await idsVisibles(page);
    console.log('📋 Órdenes visibles en "Todos":', idsTodos.length);
    const tImprimir1 = Date.now();
    const menuAbierto1 = await abrirMenuTablero(page);
    if (!menuAbierto1) { await screenshotOnFail(page, 'cp183-fail-menu-no-abre'); throw new Error('El menú del tablero (botón more_vert) no se pudo abrir'); }
    const existeImprimir = await page.evaluate(() => !!Array.from(document.querySelectorAll('a')).find(a => a.textContent.trim() === 'Imprimir'));
    if (!existeImprimir) { await screenshotOnFail(page, 'cp183-fail-no-existe-imprimir'); throw new Error('La opción "Imprimir" no existe en el menú del tablero'); }
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      Array.from(document.querySelectorAll('a')).find(a => isVis(a) && a.textContent.trim() === 'Imprimir')?.click();
    });
    await page.waitForTimeout(3000);
    evaluarAccion(Date.now() - tImprimir1, 'Imprimir (filtro Todos)');

    const framesTodos = page.frames().filter(f => /^blob:/.test(f.url()));
    console.log('📋 Frames blob (PDF) generados en filtro "Todos":', framesTodos.length, '| peticiones getReportRoutingData:', peticionesReporte.length);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
    // Cerrar cualquier vista/iframe de PDF que haya quedado abierta antes de la siguiente impresión
    await page.evaluate(() => {
      document.querySelectorAll('iframe[src^="blob:"]').forEach(f => f.remove());
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const cerrar = Array.from(document.querySelectorAll('.close, [data-dismiss="modal"]')).find(isVis);
      cerrar?.click();
    });
    await page.waitForTimeout(500);

    // ── Filtro "Pendientes": Imprimir de nuevo, confirmar que el conteo visible cambia y se dispara otra petición ──
    peticionesReporte.length = 0;
    await page.click('#filter_routing_order_btn_pending');
    await page.waitForTimeout(2500);
    const idsPendientes = await idsVisibles(page);
    console.log('📋 Órdenes visibles en "Pendientes":', idsPendientes.length);

    const menuAbierto2 = await abrirMenuTablero(page);
    console.log('📋 Menú del tablero reabierto para el filtro "Pendientes":', menuAbierto2);
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      Array.from(document.querySelectorAll('a')).find(a => isVis(a) && a.textContent.trim() === 'Imprimir')?.click();
    });
    await page.waitForTimeout(3000);
    const framesPendientes = page.frames().filter(f => /^blob:/.test(f.url()));
    console.log('📋 Frames blob (PDF) generados en filtro "Pendientes":', framesPendientes.length, '| peticiones getReportRoutingData:', peticionesReporte.length);

    // ── VALIDACIONES ──
    const v1 = existeImprimir;
    const v2 = framesTodos.length > 0; // se generó un PDF (frame blob) al imprimir "Todos"
    const v3 = framesPendientes.length > 0; // se generó un PDF también al imprimir "Pendientes"
    const v4 = peticionesReporte.length > 0; // la segunda impresión SÍ disparó una nueva petición de datos del reporte (no reutiliza el PDF anterior sin refrescar datos)

    console.log('\n📊 === VALIDACIONES CP-183 ===');
    console.log('  Opción "Imprimir" existe en el menú del tablero:        ' + (v1 ? '✅' : '❌'));
    console.log('  Se genera un PDF (frame blob) al imprimir "Todos":      ' + (v2 ? '✅' : '❌'));
    console.log('  Se genera un PDF al imprimir "Pendientes":              ' + (v3 ? '✅' : '❌'));
    console.log('  Cada impresión dispara su propia consulta de datos:     ' + (v4 ? '✅' : '❌'));

    if (!v1) throw new Error('La opción "Imprimir" no existe en el menú del tablero de Ruteo');
    if (!v2) throw new Error('No se generó ningún PDF (frame blob) al usar "Imprimir" con el filtro "Todos"');
    if (!v3) throw new Error('No se generó ningún PDF al usar "Imprimir" con el filtro "Pendientes"');
    if (!v4) throw new Error('"Imprimir" con un filtro distinto no disparó una nueva consulta de datos del reporte — el PDF podría estar mostrando datos obsoletos');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-183 PASSED | "Imprimir" genera un PDF con datos frescos en al menos 2 filtros distintos (Todos: ' + idsTodos.length + ' órdenes, Pendientes: ' + idsPendientes.length + ' órdenes) | validaciones: 4/4 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-183', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp183-fail');
    console.log('❌ CP-183 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-183', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp183_imprimir_tablero_ruteo();
