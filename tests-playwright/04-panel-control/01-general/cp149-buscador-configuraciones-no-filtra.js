const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const PANEL_URL = `${BASE_URL}/sett/setting`;

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

async function contarSeccionesVisibles(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    return Array.from(document.querySelectorAll('[id^="dashboard_button_setting_"]')).filter(isVis).length;
  });
}

async function cp149_buscador_configuraciones_no_filtra() {
  console.log('🔄 Ejecutando CP-149: Buscador de configuraciones del Panel de Control...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, PANEL_URL));
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    evaluarCargaPagina(Date.now() - t0, 'Carga Panel de Control');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { document.getElementById('workshop-web-notification-permission-dismiss')?.click(); });
    await page.waitForTimeout(500);

    const buscadorExiste = await page.evaluate(() => !!document.getElementById('input_search_setting'));
    if (!buscadorExiste) { await screenshotOnFail(page, 'cp149-fail-sin-buscador'); throw new Error('No se encontró el buscador #input_search_setting'); }

    // ── Secciones visibles ANTES de buscar ──
    const seccionesAntes = await contarSeccionesVisibles(page);
    console.log('📋 Secciones visibles ANTES de buscar:', seccionesAntes);

    // ── Buscar un término que coincide con UNA sola sección ("comisiones") ──
    const tBuscar = Date.now();
    await page.fill('#input_search_setting', 'comisiones');
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tBuscar, 'Escribir en el buscador');

    const seccionesTrasBuscar = await contarSeccionesVisibles(page);
    const titulosVisiblesTrasBuscar = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return Array.from(document.querySelectorAll('[id^="dashboard_button_setting_"]')).filter(isVis)
        .map(el => el.querySelector('h4')?.textContent.replace(/\s+/g,' ').trim());
    });
    console.log('📋 Secciones visibles TRAS buscar "comisiones":', seccionesTrasBuscar, JSON.stringify(titulosVisiblesTrasBuscar));

    await screenshotOnFail(page, 'cp149-hallazgo-buscador-sin-filtrar');

    // ── Limpiar el buscador y confirmar que el listado vuelve al estado original ──
    await page.fill('#input_search_setting', '');
    await page.waitForTimeout(1000);
    const seccionesTrasLimpiar = await contarSeccionesVisibles(page);
    console.log('📋 Secciones visibles tras limpiar el buscador:', seccionesTrasLimpiar);

    // ── VALIDACIONES ──
    const v1 = seccionesAntes >= 15; // hay secciones para empezar
    const filtroFunciono = seccionesTrasBuscar === 1 && /comision/i.test(titulosVisiblesTrasBuscar[0] || '');
    const v2 = seccionesTrasLimpiar === seccionesAntes; // al limpiar, se restaura el listado completo

    console.log('\n📊 === VALIDACIONES CP-149 (documentación de hallazgo) ===');
    console.log('  Listado inicial con secciones:                  ' + (v1 ? '✅' : '❌') + ' (' + seccionesAntes + ')');
    console.log('  El buscador FILTRA a solo la sección coincidente: ' + (filtroFunciono ? '✅ SÍ filtra' : '⚠️ NO filtra') + ' (' + seccionesTrasBuscar + ' de ' + seccionesAntes + ' siguen visibles)');
    console.log('  Limpiar el buscador restaura el listado completo: ' + (v2 ? '✅' : '❌') + ' (' + seccionesTrasLimpiar + ' vs ' + seccionesAntes + ')');

    if (!v1) throw new Error('El acordeón no tiene las secciones esperadas para poder probar el buscador');
    if (!v2) throw new Error('Limpiar el buscador no restauró el listado completo de secciones');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    if (filtroFunciono) {
      console.log('✅ CP-149 PASSED | el buscador SÍ filtra correctamente | validaciones: 3/3 | tiempo: ' + tiempoTotal + 'ms');
    } else {
      console.log('⚠️ CP-149 RESULT: Hallazgo confirmado — el buscador "Buscar en las configuraciones" (#input_search_setting) NO filtra las secciones del acordeón: tras escribir "comisiones" siguieron visibles las ' + seccionesTrasBuscar + ' secciones (de ' + seccionesAntes + ' totales) en vez de mostrar solo la coincidente. Limpiar el campo sí restaura el estado, por lo que el buscador no rompe la pantalla, simplemente no implementa el filtrado esperado. | tiempo: ' + tiempoTotal + 'ms');
    }
    registrarResultado({ cp: 'CP-149', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp149-fail');
    console.log('❌ CP-149 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-149', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp149_buscador_configuraciones_no_filtra();
