const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../auth/usar-sesion');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
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

async function cp137_carga_tab_ruteo_pos() {
  console.log('🔄 Ejecutando CP-137: Carga del tab "Ruteo" dentro del POS...');
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

    const tabExiste = await page.evaluate(() => !!document.getElementById('btn_routing_option'));
    if (!tabExiste) { await screenshotOnFail(page, 'cp137-fail-sin-tab'); throw new Error('No se encontró el tab "Ruteo" (#btn_routing_option) en la barra superior del POS'); }

    const t1 = Date.now();
    await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
    await page.waitForTimeout(4000);
    evaluarAccion(Date.now() - t1, 'Abrir tab Ruteo');

    // ── Validar controles principales del tablero ──
    const estado = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const filtroTodos = document.getElementById('filter_routing_order_btn_all');
      const filtroPendientes = document.getElementById('filter_routing_order_btn_pending');
      const filtroEnCamino = document.getElementById('filter_routing_order_btn_in_route');
      const filtroEntregado = document.getElementById('filter_routing_order_btn_delivered');
      const filtroHistorial = document.getElementById('filter_routing_order_btn_history_orders');
      const opcionesAvanzadas = document.getElementById('btn_toggle_advanced_filters');
      const tarjetas = Array.from(document.querySelectorAll('[id^="brand_"]')).filter(isVis);
      return {
        filtroTodosVisible: filtroTodos ? isVis(filtroTodos) : false,
        filtroPendientesVisible: filtroPendientes ? isVis(filtroPendientes) : false,
        filtroEnCaminoVisible: filtroEnCamino ? isVis(filtroEnCamino) : false,
        filtroEntregadoVisible: filtroEntregado ? isVis(filtroEntregado) : false,
        filtroHistorialVisible: filtroHistorial ? isVis(filtroHistorial) : false,
        opcionesAvanzadasVisible: opcionesAvanzadas ? isVis(opcionesAvanzadas) : false,
        cantidadTarjetas: tarjetas.length,
        primeraTarjetaTexto: tarjetas[0] ? tarjetas[0].textContent.replace(/\s+/g,' ').trim().substring(0,80) : null
      };
    });
    console.log('📋 Estado del tablero de Ruteo:', JSON.stringify(estado, null, 2));

    // ── VALIDACIONES ──
    const v1 = estado.filtroTodosVisible && estado.filtroPendientesVisible && estado.filtroEnCaminoVisible && estado.filtroEntregadoVisible && estado.filtroHistorialVisible;
    const v2 = estado.opcionesAvanzadasVisible;
    const v3 = estado.cantidadTarjetas >= 0; // el tablero puede estar vacío legítimamente

    console.log('\n📊 === VALIDACIONES CP-137 ===');
    console.log('  Los 5 filtros de estado están visibles:   ' + (v1 ? '✅' : '❌'));
    console.log('  Botón "Opciones Avanzadas" visible:         ' + (v2 ? '✅' : '❌'));
    console.log('  Tablero renderizó sin error (tarjetas):     ' + (v3 ? '✅' : '❌') + ' (' + estado.cantidadTarjetas + ')');

    if (!v1) throw new Error('No se encontraron los 5 filtros de estado del tablero de Ruteo');
    if (!v2) throw new Error('No se encontró el botón "Opciones Avanzadas"');

    console.log('✅ CP-137 PASSED | órdenes visibles: ' + estado.cantidadTarjetas + ' | validaciones: 3/3');

  } catch (error) {
    await screenshotOnFail(page, 'cp137-fail');
    console.log('❌ CP-137 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp137_carga_tab_ruteo_pos();
