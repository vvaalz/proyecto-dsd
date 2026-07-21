const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const POS_URL = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
// Tablero de Ruteo — investigación de un campo de búsqueda de órdenes por texto libre (buscar por
// número de orden, cliente, etc., como sí existe en Admin. Rutas vía #search_route).
// ⚠️ HALLAZGO (investigado a fondo, ver CLAUDE_CONTEXT.md): el único input de texto con placeholder
// "Buscar...." visible en la pantalla del tablero de Ruteo es en realidad #product_search — la
// caja de búsqueda de PRODUCTOS del POS (para agregar al carrito), no un buscador de órdenes de
// ruteo. Confirmado escribiendo un término inexistente en ese campo: el número de tarjetas de
// orden visibles en el tablero NO cambia. No se encontró ningún otro input de texto, ícono de lupa
// oculto, ni función JS con nombre tipo "search_routing_order"/"filter_routing_order_by_text" en
// el HTML/JS cargado para esta pantalla. Es decir, el tablero de Ruteo NO tiene una función de
// búsqueda de órdenes por texto libre en este entorno — a diferencia de Admin. Rutas, la única
// forma de acotar el listado de órdenes es por los filtros estructurados (estado, ruta,
// repartidor, recurrencia, provincia/cantón/distrito, fecha) documentados en CP-191, no por texto.
// Este CP documenta el hallazgo en vez de forzar un CP de "buscar y encontrar" que no existe.

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

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

async function idsVisibles(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('[id^="a_routing_order_items_"]')).map(el => el.id.replace('a_routing_order_items_', '')));
}

async function cp192_buscador_tablero_no_existe() {
  console.log('🔄 Ejecutando CP-192: Tablero de Ruteo — investigación de buscador de órdenes por texto (hallazgo: no existe)...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();

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

    await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
    await page.waitForTimeout(5000);

    const idsAntes = await idsVisibles(page);
    console.log('📋 Órdenes visibles antes de tocar ningún campo de texto:', idsAntes.length);

    // ── Enumerar TODOS los inputs de texto visibles en la pantalla del tablero ──
    const inputsTexto = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      return Array.from(document.querySelectorAll('input[type="text"], input[type="search"]')).filter(isVis).map(el => ({
        id: el.id || null, placeholder: el.placeholder || null, cls: (el.className || '').toString().substring(0, 60)
      }));
    });
    console.log('📋 Todos los inputs de texto visibles en la pantalla:', JSON.stringify(inputsTexto, null, 2));

    // Confirmar que el único candidato con placeholder "Buscar...." es #product_search
    const candidatoBuscar = inputsTexto.find(i => /^\s*Buscar\.{3,4}\s*$/.test(i.placeholder || ''));
    console.log('📋 Candidato a "buscador del tablero":', JSON.stringify(candidatoBuscar));

    // ── Probar escribir un término inexistente en ese campo y confirmar que NO filtra órdenes ──
    let idsTrasEscribir = idsAntes;
    if (candidatoBuscar?.id) {
      await page.fill('#' + candidatoBuscar.id, 'zzz_termino_orden_inexistente_zzz');
      await page.waitForTimeout(1500);
      idsTrasEscribir = await idsVisibles(page);
      await page.fill('#' + candidatoBuscar.id, '');
      await page.waitForTimeout(500);
    }
    console.log('📋 Órdenes visibles tras escribir un término inexistente en "' + candidatoBuscar?.id + '":', idsTrasEscribir.length);

    // ── Buscar cualquier función JS relacionada a "buscar orden de ruteo por texto" ──
    const funcionesBusquedaRuteo = await page.evaluate(() => {
      return ['search_routing_order', 'filter_routing_order_by_text', 'search_routing_orders_by_text', 'filterRoutingOrdersByText']
        .filter(nombre => typeof window[nombre] === 'function');
    });
    console.log('📋 Funciones JS de búsqueda de órdenes de ruteo encontradas (se espera ninguna):', JSON.stringify(funcionesBusquedaRuteo));

    await screenshotOnFail(page, 'cp192-hallazgo-sin-buscador-ordenes');

    // ── VALIDACIONES (documentación de hallazgo) ──
    const v1 = candidatoBuscar?.id === 'product_search'; // el único candidato visible ES el buscador de productos del POS, no uno de órdenes
    const v2 = idsTrasEscribir.length === idsAntes.length; // escribir en ese campo NO cambia las órdenes visibles (confirma que no es un buscador de órdenes)
    const v3 = funcionesBusquedaRuteo.length === 0; // no existe ninguna función JS de búsqueda de órdenes por texto

    console.log('\n📊 === VALIDACIONES CP-192 (documentación de hallazgo) ===');
    console.log('  El único candidato visible es #product_search (buscador de productos, no de órdenes): ' + (v1 ? '⚠️ confirmado' : '❌ inesperado'));
    console.log('  Escribir en ese campo NO filtra las órdenes del tablero:                ' + (v2 ? '⚠️ confirmado' : '❌ inesperado: sí filtró'));
    console.log('  No existe ninguna función JS de búsqueda de órdenes por texto:          ' + (v3 ? '⚠️ confirmado' : '❌ inesperado: sí existe (' + JSON.stringify(funcionesBusquedaRuteo) + ')'));

    if (!v1) throw new Error('Se encontró un candidato distinto a #product_search — revisar si SÍ existe un buscador real de órdenes (' + JSON.stringify(candidatoBuscar) + ')');
    if (!v2) throw new Error('Escribir en el campo "Buscar...." SÍ cambió las órdenes visibles — el hallazgo ya no aplica, este campo podría ser un buscador de órdenes real');
    if (!v3) throw new Error('Se encontró una función JS de búsqueda de órdenes de ruteo por texto — el hallazgo ya no aplica: ' + JSON.stringify(funcionesBusquedaRuteo));

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('⚠️ CP-192 RESULT: Hallazgo confirmado — el tablero de Ruteo NO tiene un campo de búsqueda de órdenes por texto libre en este entorno. El único input "Buscar...." visible en la pantalla es #product_search (búsqueda de productos del POS, no relacionado), escribir en él no filtra las órdenes de ruteo, y no existe ninguna función JS de búsqueda de órdenes por texto. La única forma de acotar el listado es mediante los filtros estructurados (estado/ruta/repartidor/recurrencia/provincia/cantón/distrito/fecha, ver CP-191). | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-192', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp192-fail');
    console.log('❌ CP-192 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-192', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp192_buscador_tablero_no_existe();
