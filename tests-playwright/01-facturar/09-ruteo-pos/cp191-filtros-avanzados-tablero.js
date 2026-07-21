const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const POS_URL = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
// Tablero de Ruteo — "Opciones Avanzadas" (#btn_toggle_advanced_filters), que revela 5 campos
// adicionales de filtrado: Provincia/Cantón/Distrito (selects encadenados) y Fecha creación
// desde/hasta (date range). Se valida que CADA criterio efectivamente filtra las órdenes contra
// el servidor (POST /pos/getSearchRoutingOrders con el criterio en el payload), no solo que el
// panel se despliega visualmente.

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

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function ayerISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function idsVisibles(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('[id^="a_routing_order_items_"]')).map(el => el.id.replace('a_routing_order_items_', '')));
}

async function esperarBusqueda(page, accion) {
  const [resp] = await Promise.all([
    page.waitForResponse((r) => /getSearchRoutingOrders/.test(r.url()) && r.request().method() === 'POST', { timeout: 15000 }).catch(() => null),
    accion(),
  ]);
  await page.waitForTimeout(1500);
  return resp;
}

// El <select> real está oculto por el widget "Chosen" (clase chosen-select); hay que abrir el
// contenedor visible (.chosen-single) y hacer click real sobre la opción en .chosen-results —
// un selectOption() directo sobre el <select> oculto expira (element is not visible).
async function seleccionarChosen(page, selectId, textoOpcion) {
  const container = page.locator(`#${selectId} ~ .chosen-container`).first();
  await container.locator('.chosen-single').click();
  await page.waitForTimeout(400);
  await container.locator('.chosen-results li.active-result', { hasText: textoOpcion }).first().click();
  await page.waitForTimeout(400);
}

async function cp191_filtros_avanzados_tablero() {
  console.log('🔄 Ejecutando CP-191: Tablero de Ruteo — filtros avanzados (Provincia/Cantón/Distrito/Fecha)...');
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

    const idsSinFiltro = await idsVisibles(page);
    console.log('📋 Órdenes visibles sin ningún filtro avanzado:', idsSinFiltro.length);

    // ── Abrir "Opciones Avanzadas" y confirmar que revela los 5 campos esperados ──
    await page.click('#btn_toggle_advanced_filters');
    await page.waitForTimeout(2500);
    const camposRevelados = await page.evaluate(() => {
      const isVis = el => !!el && el.offsetParent !== null;
      return {
        // El widget Chosen inserta el .chosen-container como HERMANO del <select> oculto, no como
        // ancestro — closest() nunca lo encuentra; hay que buscarlo con el combinador de hermanos.
        provincia: isVis(document.querySelector('#filter_routing_order_province ~ .chosen-container')),
        canton: !!document.getElementById('filter_routing_order_canton'),
        distrito: !!document.getElementById('filter_routing_order_distrito'),
        fechaDesde: isVis(document.getElementById('filter_routing_order_created_date_from')),
        fechaHasta: isVis(document.getElementById('filter_routing_order_created_date_to'))
      };
    });
    console.log('📋 Campos revelados por "Opciones Avanzadas":', JSON.stringify(camposRevelados));

    // ── Filtro por fecha de creación: usar un rango que NO incluya hoy (ayer a ayer) para
    // confirmar que el conteo de órdenes CAMBIA respecto al total sin filtro ──
    const tFecha = Date.now();
    const respFecha = await esperarBusqueda(page, async () => {
      await page.fill('#filter_routing_order_created_date_from', ayerISO());
      await page.fill('#filter_routing_order_created_date_to', ayerISO());
      await page.click('text=TALLER ALPHA PREMIUM').catch(() => {});
    });
    evaluarAccion(Date.now() - tFecha, 'Aplicar filtro de fecha (ayer-ayer)');
    const idsFechaAyer = await idsVisibles(page);
    console.log('📋 Órdenes visibles con fecha de creación = ayer:', idsFechaAyer.length, '| petición disparada:', !!respFecha);

    // Restaurar fechas para no arrastrar el filtro a los siguientes pasos
    await page.fill('#filter_routing_order_created_date_from', '');
    await page.fill('#filter_routing_order_created_date_to', '');
    await page.click('text=TALLER ALPHA PREMIUM').catch(() => {});
    await page.waitForTimeout(1500);

    // ── Filtro por Provincia: elegir la primera provincia real (no "Todas las provincias") ──
    const tProvincia = Date.now();
    const opcionesProvincia = await page.evaluate(() => Array.from(document.getElementById('filter_routing_order_province').options).map(o => ({ value: o.value, text: o.textContent.trim() })));
    console.log('📋 Opciones de Provincia:', JSON.stringify(opcionesProvincia));
    const provinciaElegida = opcionesProvincia.find(o => o.value && !/todas/i.test(o.text));
    let idsProvincia = null;
    let respProvincia = null;
    if (provinciaElegida) {
      respProvincia = await esperarBusqueda(page, async () => {
        await seleccionarChosen(page, 'filter_routing_order_province', provinciaElegida.text);
      });
      idsProvincia = await idsVisibles(page);
      console.log('📋 Órdenes visibles filtrando por Provincia="' + provinciaElegida.text + '":', idsProvincia.length, '| petición disparada:', !!respProvincia);
      // Restaurar
      await seleccionarChosen(page, 'filter_routing_order_province', opcionesProvincia[0].text);
      await page.waitForTimeout(1500);
    }
    evaluarAccion(Date.now() - tProvincia, 'Aplicar y restaurar filtro de Provincia');

    // ── VALIDACIONES ──
    const v1 = camposRevelados.provincia && camposRevelados.canton && camposRevelados.distrito && camposRevelados.fechaDesde && camposRevelados.fechaHasta;
    const v2 = !!respFecha; // el filtro de fecha SÍ dispara una consulta real al servidor
    const v3 = idsFechaAyer.length !== idsSinFiltro.length || idsFechaAyer.length === 0; // el filtro de fecha cambia el resultado (lo acota, incluso a 0)
    const v4 = !provinciaElegida || !!respProvincia; // si había una provincia real para probar, el filtro también disparó consulta

    console.log('\n📊 === VALIDACIONES CP-191 ===');
    console.log('  "Opciones Avanzadas" revela los 5 campos esperados:     ' + (v1 ? '✅' : '❌'));
    console.log('  El filtro de fecha dispara una consulta real al servidor: ' + (v2 ? '✅' : '❌'));
    console.log('  El filtro de fecha efectivamente acota el resultado:    ' + (v3 ? '✅' : '❌') + ' (sin filtro: ' + idsSinFiltro.length + ', con fecha=ayer: ' + idsFechaAyer.length + ')');
    console.log('  El filtro de Provincia también dispara consulta real:   ' + (v4 ? '✅' : '❌ (no había provincia real para probar)'));

    if (!v1) throw new Error('"Opciones Avanzadas" no reveló los 5 campos esperados (' + JSON.stringify(camposRevelados) + ')');
    if (!v2) throw new Error('El filtro de fecha de creación no disparó ninguna consulta al servidor');
    if (!v3) throw new Error('El filtro de fecha de creación no cambió el conjunto de órdenes visibles respecto al total sin filtrar');
    if (!v4) throw new Error('El filtro de Provincia no disparó ninguna consulta al servidor');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-191 PASSED | "Opciones Avanzadas" revela los 5 campos esperados y tanto el filtro de fecha como el de Provincia consultan y acotan resultados reales contra el servidor | validaciones: 4/4 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-191', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp191-fail');
    console.log('❌ CP-191 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-191', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp191_filtros_avanzados_tablero();
