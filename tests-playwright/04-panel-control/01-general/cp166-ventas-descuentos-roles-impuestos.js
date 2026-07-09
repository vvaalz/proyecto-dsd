const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const PANEL_URL = `${BASE_URL}/sett/setting`;
const BTN_ID = 'dashboard_button_setting_8';
const CONTENT_ID = 'dashboard_content_settings_8';
// Sección "Configuración general de ventas" (91 campos) — CP-166 de 3.
// Sub-tema: descuento general + el toggle que revela la tabla de descuento por rol.
//
// NOTA sobre #role_discount_1 (y el resto de la tabla role_discount_<roleId>): a diferencia
// de lo documentado en la propuesta original, se investigó en vivo y su valor NO se pudo fijar
// de forma confiable vía JS — el campo tiene min="1" max="100" step="1" y el navegador clampea
///descarta asignaciones fuera de rango (ej. "10.0000" no es válido para step="1"); además,
// mientras la tabla está oculta (#limit_discount_by_role=false) sus campos no viajan en el
// payload de guardado (mismo patrón que el hallazgo de CP-154). Terminar de automatizar esa
// tabla por-rol de forma robusta queda pendiente para un CP futuro dedicado si hace falta —
// este CP se limita a confirmar que el toggle revela/oculta la sección correctamente.
const CAMPO_GENERAL = 'max_general_discount';
const CAMPO_LIMITE_ROL = 'limit_discount_by_role';
const CAMPO_ROL_1 = 'role_discount_1'; // solo para verificar visibilidad, no se le asigna valor
const VALOR_GENERAL_PRUEBA = '15.0000';

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

async function abrirSeccion(page, btnId, contentId) {
  const abierta = await page.evaluate((id) => window.getComputedStyle(document.getElementById(id)).display !== 'none', contentId);
  if (!abierta) {
    await page.evaluate((id) => document.getElementById(id)?.click(), btnId);
    await page.waitForTimeout(1000);
  }
  return page.evaluate((id) => window.getComputedStyle(document.getElementById(id)).display !== 'none', contentId);
}

async function guardarConfiguracion(page) {
  await page.evaluate(() => { document.getElementById('save_settings')?.click(); });
  await page.waitForTimeout(4000);
}

async function togglearCheckbox(page, id, valor) {
  await page.evaluate(({ id, valor }) => {
    const el = document.getElementById(id);
    el.checked = valor;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('click', { bubbles: true }));
  }, { id, valor });
  await page.waitForTimeout(400);
}

async function escribirNumero(page, id, valor) {
  await page.evaluate(({ id, valor }) => {
    const el = document.getElementById(id);
    el.value = valor;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { id, valor });
  await page.waitForTimeout(300);
}

function esVisible(page, id) {
  return page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    const r = el.getBoundingClientRect(), s = window.getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  }, id);
}

async function leerEstado(page) {
  return page.evaluate(({ g, l }) => ({
    general: document.getElementById(g)?.value,
    limiteRol: document.getElementById(l)?.checked
  }), { g: CAMPO_GENERAL, l: CAMPO_LIMITE_ROL });
}

async function cp166_ventas_descuentos_roles_impuestos() {
  console.log('🔄 Ejecutando CP-166: Panel de Control — Ventas: descuentos, roles e impuestos...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();
  let original = null;

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

    const seccionAbierta = await abrirSeccion(page, BTN_ID, CONTENT_ID);
    if (!seccionAbierta) { await screenshotOnFail(page, 'cp166-fail-seccion-no-abre'); throw new Error('La sección "Configuración general de ventas" no se pudo expandir'); }

    original = await leerEstado(page);
    const rol1VisibleAntes = await esVisible(page, CAMPO_ROL_1);
    console.log('📋 Estado original (descuento general / límite por rol):', JSON.stringify(original), '| tabla por rol visible:', rol1VisibleAntes);
    if (original.general === undefined || original.limiteRol === undefined) {
      await screenshotOnFail(page, 'cp166-fail-campo-no-encontrado');
      throw new Error('No se encontraron los campos esperados (#' + CAMPO_GENERAL + ', #' + CAMPO_LIMITE_ROL + ')');
    }

    // ── Cambiar descuento general + activar límite por rol (revela la tabla) ──
    const tGuardar = Date.now();
    await escribirNumero(page, CAMPO_GENERAL, VALOR_GENERAL_PRUEBA);
    await togglearCheckbox(page, CAMPO_LIMITE_ROL, true);
    const rol1VisibleTrasToggle = await esVisible(page, CAMPO_ROL_1);
    await guardarConfiguracion(page);
    evaluarAccion(Date.now() - tGuardar, 'Guardar descuento general + activar límite por rol');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const trasGuardar = await leerEstado(page);
    const rol1VisibleTrasGuardar = await esVisible(page, CAMPO_ROL_1);
    console.log('📋 Estado tras guardar y refrescar:', JSON.stringify(trasGuardar), '| tabla por rol visible:', rol1VisibleTrasGuardar);

    // ── Restaurar al estado original ──
    await escribirNumero(page, CAMPO_GENERAL, original.general);
    await togglearCheckbox(page, CAMPO_LIMITE_ROL, original.limiteRol);
    await guardarConfiguracion(page);
    console.log('🔄 Estado restaurado al original y guardado de nuevo.');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const trasRestaurar = await leerEstado(page);
    console.log('📋 Estado tras restaurar el original:', JSON.stringify(trasRestaurar));

    // ── VALIDACIONES ──
    const v1 = parseFloat(trasGuardar.general) === parseFloat(VALOR_GENERAL_PRUEBA);
    const v2 = trasGuardar.limiteRol === true;
    const v3 = rol1VisibleTrasToggle === true && rol1VisibleTrasGuardar === true; // la tabla se revela correctamente
    const v4 = parseFloat(trasRestaurar.general) === parseFloat(original.general) && trasRestaurar.limiteRol === original.limiteRol;

    console.log('\n📊 === VALIDACIONES CP-166 ===');
    console.log('  Descuento general persiste tras guardar:        ' + (v1 ? '✅' : '❌') + ' (' + trasGuardar.general + ' vs esperado ' + VALOR_GENERAL_PRUEBA + ')');
    console.log('  "Limitar descuento por rol" queda activado:     ' + (v2 ? '✅' : '❌') + ' (' + trasGuardar.limiteRol + ')');
    console.log('  Tabla de descuento por rol se revela al activar: ' + (v3 ? '✅' : '❌'));
    console.log('  Estado original se restauró correctamente:        ' + (v4 ? '✅' : '❌') + ' (' + JSON.stringify(trasRestaurar) + ')');

    if (!v1) throw new Error('El descuento general no persistió tras guardar y refrescar (quedó: ' + trasGuardar.general + ')');
    if (!v2) throw new Error('"Limitar descuento por rol" no quedó activado tras guardar y refrescar');
    if (!v3) throw new Error('La tabla de descuento por rol no se reveló correctamente al activar el checkbox');
    if (!v4) throw new Error('El estado original no se restauró correctamente (quedó: ' + JSON.stringify(trasRestaurar) + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-166 PASSED | descuento general: ' + original.general + '→' + VALOR_GENERAL_PRUEBA + '→' + original.general + ' (restaurado) | tabla por rol se revela correctamente | validaciones: 4/4 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-166', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp166-fail');
    console.log('❌ CP-166 FAILED: ' + error.message);
    if (original && page) {
      try {
        await abrirSeccion(page, BTN_ID, CONTENT_ID);
        await escribirNumero(page, CAMPO_GENERAL, original.general);
        await togglearCheckbox(page, CAMPO_LIMITE_ROL, original.limiteRol);
        await guardarConfiguracion(page);
        console.log('🔄 (recuperación de emergencia) Estado restaurado tras el fallo.');
      } catch {}
    }
    registrarResultado({ cp: 'CP-166', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp166_ventas_descuentos_roles_impuestos();
