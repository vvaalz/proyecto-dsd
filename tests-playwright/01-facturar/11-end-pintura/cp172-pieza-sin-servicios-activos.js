const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const POS_URL = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
// Wizard "End. Pintura" — catálogo "viejo" de partes (Parte frontal, Puertas, Costados, etc.)
// no tiene servicios configurados en este ambiente QA, sin importar la pieza elegida. Ver
// CLAUDE_CONTEXT.md sección 20 para el detalle completo de la exploración.

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

async function clickPorOnclickLiteral(page, onclick) {
  await page.evaluate((oc) => { eval(oc); }, onclick);
}

async function cp172_pieza_sin_servicios_activos() {
  console.log('🔄 Ejecutando CP-172: End. Pintura — pieza sin servicios activos muestra mensaje claro...');
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

    // ── Abrir la pestaña "End. Pintura" ──
    const tabExiste = await page.evaluate(() => !!document.getElementById('ck_view_straightening_and_paint'));
    if (!tabExiste) { await screenshotOnFail(page, 'cp172-fail-tab-no-existe'); throw new Error('No se encontró la pestaña "End. Pintura" (#ck_view_straightening_and_paint)'); }
    await page.evaluate(() => { document.getElementById('ck_view_straightening_and_paint')?.click(); });
    await page.waitForTimeout(1500);

    // ── Paso 1: tipo de vehículo (widget Chosen — requiere click real, no sintético) ──
    const tChosen = Date.now();
    await page.click('#select_type_vehicle_chosen');
    await page.waitForTimeout(400);
    await page.click('#select_type_vehicle_chosen .chosen-results li:has-text("SUV")');
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tChosen, 'Seleccionar tipo de vehículo (SUV)');

    const vehiculoSeleccionado = await page.evaluate(() => document.getElementById('select_type_vehicle')?.value);
    if (!vehiculoSeleccionado || vehiculoSeleccionado === '0') { await screenshotOnFail(page, 'cp172-fail-vehiculo'); throw new Error('El tipo de vehículo "SUV" no quedó seleccionado en #select_type_vehicle'); }

    // ── Paso 2: parte "Parte frontal" (catálogo viejo, sin servicios configurados) ──
    const partes = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      return Array.from(document.querySelectorAll('[onclick*="getPiecesByPart"]')).filter(isVis).map(el => ({ onclick: el.getAttribute('onclick'), txt: el.textContent.replace(/\s+/g,' ').trim() }));
    });
    const parteFrontal = partes.find(p => /^0?\s*Parte frontal$/i.test(p.txt));
    if (!parteFrontal) { await screenshotOnFail(page, 'cp172-fail-parte'); throw new Error('No se encontró la parte "Parte frontal" tras seleccionar el vehículo'); }
    await clickPorOnclickLiteral(page, parteFrontal.onclick);
    await page.waitForTimeout(1500);

    // ── Paso 3: pieza "BUMPER DEL" ──
    const piezas = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      return Array.from(document.querySelectorAll('[onclick*="getServiceByPiece"]')).filter(isVis).map(el => ({ onclick: el.getAttribute('onclick'), txt: el.textContent.replace(/\s+/g,' ').trim() }));
    });
    const piezaBumper = piezas.find(p => /^0?\s*BUMPER DEL$/i.test(p.txt));
    if (!piezaBumper) { await screenshotOnFail(page, 'cp172-fail-pieza'); throw new Error('No se encontró la pieza "BUMPER DEL" bajo "Parte frontal"'); }
    const tPieza = Date.now();
    await clickPorOnclickLiteral(page, piezaBumper.onclick);
    await page.waitForTimeout(1800);
    evaluarAccion(Date.now() - tPieza, 'Seleccionar pieza sin servicios');

    // ── VALIDACIONES: mensaje claro de "sin servicios", sin timeout genérico ──
    const estadoServicios = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const header = Array.from(document.querySelectorAll('*')).find(el => isVis(el) && el.children.length === 0 && /^Servicios$/.test((el.textContent||'').trim()));
      let contenedor = header;
      for (let i = 0; i < 6 && contenedor?.parentElement; i++) contenedor = contenedor.parentElement;
      const textoContenedor = contenedor ? contenedor.textContent.replace(/\s+/g,' ').trim() : '';
      const sinServiciosVisible = /sin servicios/i.test(textoContenedor);
      const toastNoHayServicios = !!Array.from(document.querySelectorAll('*')).find(el => isVis(el) && /no hay servicios activos/i.test(el.textContent || ''));
      // Servicios reales serían [onclick^="prepare_service_before_add_item_to_table"] deduplicados; en este caso debe ser 0
      const serviciosReales = contenedor ? Array.from(contenedor.querySelectorAll('[onclick^="prepare_service_before_add_item_to_table"]')).filter(isVis).length : -1;
      return { sinServiciosVisible, toastNoHayServicios, serviciosReales };
    });
    console.log('📋 Estado de la columna Servicios tras elegir "BUMPER DEL":', JSON.stringify(estadoServicios));

    const v1 = estadoServicios.sinServiciosVisible;
    const v2 = estadoServicios.serviciosReales === 0;

    console.log('\n📊 === VALIDACIONES CP-172 ===');
    console.log('  Mensaje "Sin servicios" visible en la columna:      ' + (v1 ? '✅' : '❌'));
    console.log('  No hay servicios reales renderizados (0 esperado):  ' + (v2 ? '✅' : '❌') + ' (obtenido: ' + estadoServicios.serviciosReales + ')');
    console.log('  Toast "No hay servicios activos" detectado:         ' + (estadoServicios.toastNoHayServicios ? '✅ (informativo)' : '⚠️ no capturado (puede haber desaparecido antes de la lectura, no bloqueante)'));

    if (!v1) throw new Error('No se mostró el mensaje "Sin servicios" en la columna Servicios para una pieza sin servicios configurados');
    if (!v2) throw new Error('Se encontraron ' + estadoServicios.serviciosReales + ' servicios reales renderizados, se esperaban 0 para "BUMPER DEL"');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-172 PASSED | vehículo=SUV | parte=Parte frontal | pieza=BUMPER DEL | mensaje "Sin servicios" confirmado sin timeout genérico | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-172', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp172-fail');
    console.log('❌ CP-172 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-172', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp172_pieza_sin_servicios_activos();
