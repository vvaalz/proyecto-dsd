const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const POS_URL = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
// Wizard "End. Pintura" — vehículo (SUV) -> parte "Frente" -> pieza "Absorbedor de impacto
// delantero" -> servicio "Desmontar y montar". Ver CLAUDE_CONTEXT.md sección 20 para el
// detalle completo de la exploración (dos catálogos de partes, solo "Frente" y hermanas
// tienen servicios configurados en este ambiente QA).
const PRECIO_ESPERADO = '₡20,340.00';

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

async function contarFilasCarrito(page) {
  return page.evaluate(() => document.querySelectorAll('#tb_table_buy_list tr').length);
}

async function leerTotalCarrito(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const totalLabel = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent || '').trim()));
    const next = totalLabel ? totalLabel.nextElementSibling : null;
    return next ? next.textContent.trim() : null;
  });
}

// Click sobre el ancestro real que tiene el onclick (los nodos de texto de partes/piezas
// no lo tienen directamente) — patrón confirmado en la exploración en vivo.
async function clickPorOnclickLiteral(page, onclick) {
  await page.evaluate((oc) => { eval(oc); }, onclick);
}

async function cp171_flujo_completo_agregar_servicio() {
  console.log('🔄 Ejecutando CP-171: End. Pintura — flujo completo vehículo→parte→pieza→servicio→carrito...');
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
    if (!tabExiste) { await screenshotOnFail(page, 'cp171-fail-tab-no-existe'); throw new Error('No se encontró la pestaña "End. Pintura" (#ck_view_straightening_and_paint)'); }
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
    if (!vehiculoSeleccionado || vehiculoSeleccionado === '0') { await screenshotOnFail(page, 'cp171-fail-vehiculo'); throw new Error('El tipo de vehículo "SUV" no quedó seleccionado en #select_type_vehicle'); }

    // ── Paso 2: parte "Frente" ──
    const partes = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      return Array.from(document.querySelectorAll('[onclick*="getPiecesByPart"]')).filter(isVis).map(el => ({ onclick: el.getAttribute('onclick'), txt: el.textContent.replace(/\s+/g,' ').trim() }));
    });
    const parteFrente = partes.find(p => /^0?\s*Frente$/i.test(p.txt));
    if (!parteFrente) { await screenshotOnFail(page, 'cp171-fail-parte'); throw new Error('No se encontró la parte "Frente" tras seleccionar el vehículo'); }
    await clickPorOnclickLiteral(page, parteFrente.onclick);
    await page.waitForTimeout(1500);

    // ── Paso 3: pieza "Absorbedor de impacto delantero" ──
    const piezas = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      return Array.from(document.querySelectorAll('[onclick*="getServiceByPiece"]')).filter(isVis).map(el => ({ onclick: el.getAttribute('onclick'), txt: el.textContent.replace(/\s+/g,' ').trim() }));
    });
    const piezaAbsorbedor = piezas.find(p => /Absorbedor de impacto delantero/i.test(p.txt));
    if (!piezaAbsorbedor) { await screenshotOnFail(page, 'cp171-fail-pieza'); throw new Error('No se encontró la pieza "Absorbedor de impacto delantero" bajo "Frente"'); }
    await clickPorOnclickLiteral(page, piezaAbsorbedor.onclick);
    await page.waitForTimeout(1800);

    // ── Paso 4: servicio "Desmontar y montar" (deduplicado por onclick — header y precio comparten el mismo) ──
    const servicios = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const header = Array.from(document.querySelectorAll('*')).find(el => isVis(el) && el.children.length === 0 && /^Servicios$/.test((el.textContent||'').trim()));
      let contenedor = header;
      for (let i = 0; i < 6 && contenedor?.parentElement; i++) contenedor = contenedor.parentElement;
      if (!contenedor) return [];
      const items = Array.from(contenedor.querySelectorAll('[onclick^="prepare_service_before_add_item_to_table"]')).filter(isVis);
      const vistos = new Set();
      const unicos = [];
      for (const el of items) {
        const oc = el.getAttribute('onclick');
        if (vistos.has(oc)) continue;
        vistos.add(oc);
        unicos.push({ onclick: oc, txt: el.textContent.replace(/\s+/g,' ').trim() });
      }
      return unicos;
    });
    const servicioDesmontar = servicios.find(s => /Desmontar y montar/i.test(s.txt));
    if (!servicioDesmontar) { await screenshotOnFail(page, 'cp171-fail-servicio'); throw new Error('No se encontró el servicio "Desmontar y montar" para la pieza seleccionada'); }

    // ── Click en el servicio: Promise.race entre "carrito creció" y "modal de precio abrió" ──
    const filasAntes = await contarFilasCarrito(page);
    const tAgregar = Date.now();
    await clickPorOnclickLiteral(page, servicioDesmontar.onclick);

    const resultadoRace = await Promise.race([
      page.waitForFunction((antes) => document.querySelectorAll('#tb_table_buy_list tr').length > antes, filasAntes, { timeout: 8000 }).then(() => 'CARRITO_CRECIO').catch(() => null),
      page.waitForSelector('text=/Selecciona un precio/i', { timeout: 8000 }).then(() => 'MODAL_PRECIO').catch(() => null),
    ]);
    await page.waitForTimeout(500);
    evaluarAccion(Date.now() - tAgregar, 'Agregar servicio al carrito');
    console.log('📋 Resultado tras click en servicio:', resultadoRace);

    let totalFinal = null;
    if (resultadoRace === 'MODAL_PRECIO') {
      // Camino B: elegir la primera opción de precio del modal
      const opcionesModal = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const modal = Array.from(document.querySelectorAll('.modal, [class*="modal"]')).find(isVis);
        if (!modal) return [];
        return Array.from(modal.querySelectorAll('[onclick]')).filter(isVis).map(el => el.getAttribute('onclick'));
      });
      if (opcionesModal[0]) {
        await clickPorOnclickLiteral(page, opcionesModal[0]);
        await page.waitForFunction((antes) => document.querySelectorAll('#tb_table_buy_list tr').length > antes, filasAntes, { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(500);
      }
    }

    const filasDespues = await contarFilasCarrito(page);
    totalFinal = await leerTotalCarrito(page);
    console.log('📋 Filas carrito antes/después:', filasAntes, '/', filasDespues);
    console.log('📋 Total del carrito:', totalFinal);

    // ── VALIDACIONES ──
    const v1 = filasDespues > filasAntes;
    const v2 = totalFinal === PRECIO_ESPERADO;
    const v3 = resultadoRace === 'CARRITO_CRECIO' || resultadoRace === 'MODAL_PRECIO';

    console.log('\n📊 === VALIDACIONES CP-171 ===');
    console.log('  El servicio se agregó al carrito (fila nueva):     ' + (v1 ? '✅' : '❌'));
    console.log('  El total refleja el precio esperado (' + PRECIO_ESPERADO + '):  ' + (v2 ? '✅' : '❌') + ' (obtenido: ' + totalFinal + ')');
    console.log('  Se resolvió una rama válida del Promise.race:       ' + (v3 ? '✅' : '❌'));

    if (!v3) throw new Error('Ni el carrito creció ni apareció el modal de precio tras hacer click en el servicio');
    if (!v1) throw new Error('El servicio no se agregó como fila nueva en #tb_table_buy_list');
    if (!v2) throw new Error('El total del carrito no coincide con el precio esperado (' + PRECIO_ESPERADO + '), obtenido: ' + totalFinal);

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-171 PASSED | vehículo=SUV | parte=Frente | pieza=Absorbedor de impacto delantero | servicio=Desmontar y montar | camino=' + resultadoRace + ' | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-171', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp171-fail');
    console.log('❌ CP-171 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-171', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp171_flujo_completo_agregar_servicio();
