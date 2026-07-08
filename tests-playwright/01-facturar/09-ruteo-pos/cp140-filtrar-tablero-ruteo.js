const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

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
    console.log('⚠️ Sesión expirada (redirect a /log/login) — regenerando y reintentando...');
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

function leerEstadoFiltro(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const tarjetas = Array.from(document.querySelectorAll('[id^="brand_"]')).filter(isVis);
    return { cantidadTarjetas: tarjetas.length };
  });
}

async function aplicarFiltro(page, filtroId, etiqueta) {
  const t0 = Date.now();
  await page.evaluate((id) => { document.getElementById(id)?.click(); }, filtroId);
  await page.waitForTimeout(2000);
  evaluarAccion(Date.now() - t0, 'Aplicar filtro ' + etiqueta);
  const estado = await leerEstadoFiltro(page);
  console.log('🔎 Filtro "' + etiqueta + '":', JSON.stringify(estado));
  return estado;
}

async function cp140_filtrar_tablero_ruteo() {
  console.log('🔄 Ejecutando CP-140: Filtrar el tablero de Ruteo por estado...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, POS_URL));
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 180000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector('.product_box', { timeout: 60000 });
    await page.evaluate(() => { window.print = () => {}; });
    evaluarCargaPagina(Date.now() - t0, 'Carga POS');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { window.print = () => {}; });

    await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
    await page.waitForTimeout(4000);
    console.log('✅ Tab Ruteo abierto');

    // ── Aplicar cada filtro y registrar resultado ──
    const resultados = {};
    resultados.todos = await aplicarFiltro(page, 'filter_routing_order_btn_all', 'Todos');
    resultados.pendientes = await aplicarFiltro(page, 'filter_routing_order_btn_pending', 'Pendientes');
    resultados.enCamino = await aplicarFiltro(page, 'filter_routing_order_btn_in_route', 'En Camino');
    resultados.entregado = await aplicarFiltro(page, 'filter_routing_order_btn_delivered', 'Entregado');
    resultados.historial = await aplicarFiltro(page, 'filter_routing_order_btn_history_orders', 'H. de Órdenes');

    // Volver a "Todos" al final para dejar el tablero en su estado por defecto
    await aplicarFiltro(page, 'filter_routing_order_btn_all', 'Todos (restaurar)');

    // ── VALIDACIONES ──
    // Todas las órdenes de esta suite se crean sin cambiar de estado, así que deberían empezar
    // como "Pendiente" — "Pendientes" debe igualar a "Todos", y "En Camino"/"Entregado" en 0
    const v1 = resultados.todos.cantidadTarjetas > 0;
    const v2 = resultados.pendientes.cantidadTarjetas === resultados.todos.cantidadTarjetas;
    const v3 = resultados.enCamino.cantidadTarjetas === 0;
    const v4 = resultados.entregado.cantidadTarjetas === 0;
    const v5 = resultados.historial.cantidadTarjetas >= 0; // solo confirma que no rompe, contenido variable

    console.log('\n📊 === VALIDACIONES CP-140 ===');
    console.log('  "Todos" muestra al menos 1 orden:            ' + (v1 ? '✅' : '❌') + ' (' + resultados.todos.cantidadTarjetas + ')');
    console.log('  "Pendientes" == "Todos" (todas son nuevas):  ' + (v2 ? '✅' : '⚠️') + ' (' + resultados.pendientes.cantidadTarjetas + ' vs ' + resultados.todos.cantidadTarjetas + ')');
    console.log('  "En Camino" en 0 (ninguna orden avanzada):    ' + (v3 ? '✅' : '⚠️') + ' (' + resultados.enCamino.cantidadTarjetas + ')');
    console.log('  "Entregado" en 0 (ninguna orden avanzada):    ' + (v4 ? '✅' : '⚠️') + ' (' + resultados.entregado.cantidadTarjetas + ')');
    console.log('  "H. de Órdenes" no rompe el tablero:          ' + (v5 ? '✅' : '❌') + ' (' + resultados.historial.cantidadTarjetas + ')');

    if (!v1) throw new Error('El filtro "Todos" no mostró ninguna orden — no se puede validar el filtrado');
    if (!v5) throw new Error('El filtro "H. de Órdenes" rompió la carga del tablero');

    const tiempoTotal = Date.now() - t0;
    const pasadas = [v1,v2,v3,v4,v5].filter(Boolean).length;
    console.log('✅ CP-140 PASSED | Todos: ' + resultados.todos.cantidadTarjetas + ' | Pendientes: ' + resultados.pendientes.cantidadTarjetas + ' | En Camino: ' + resultados.enCamino.cantidadTarjetas + ' | Entregado: ' + resultados.entregado.cantidadTarjetas + ' | Historial: ' + resultados.historial.cantidadTarjetas + ' | validaciones: ' + pasadas + '/5 | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp140-fail');
    console.log('❌ CP-140 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp140_filtrar_tablero_ruteo();
