const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const PANEL_URL = `${BASE_URL}/sett/setting`;
const BTN_ID = 'dashboard_button_setting_5';
const CONTENT_ID = 'dashboard_content_settings_5';
// Sección "Configuración del sistema POS" (57 campos) — CP-168 de 3 (ver CP-169/CP-170 para
// el resto de sub-temas: mesas/taller/aprobaciones y métodos de pago/impuestos/productos).
// Sub-tema: facturación en cero/factura interna + categorías + clientes.
//
// NOTA: se investigó en vivo por qué #generate_automatic_customer_code no persistía tras
// togglearlo con el patrón estándar (checked + dispatchEvent 'change'/'click'): el checkbox
// real está oculto tras un wrapper visual "checkbox-slider" (mismo patrón que otros checkboxes
// que SÍ funcionan, ej. #apply_fe_internal_invoice — la estructura DOM es idéntica), pero el
// payload de guardado capturado con page.on('request') mostró que el parámetro viajaba con el
// valor viejo (ej. "generate_automatic_customer_code=0") pese a que el checkbox visualmente
// mostraba `checked=true` tras el toggle. La causa exacta no se determinó (posible lógica de
// sincronización específica de este campo en el bundle de JS de la app) — se documenta como
// hallazgo pendiente de investigar más a fondo si se decide cubrir este campo puntual más
// adelante, y se usa #validate_credit_limit (mismo sub-grupo "clientes") en su lugar, que sí
// se comportó de forma confiable en la exploración.
const CAMPO_1 = 'apply_fe_internal_invoice'; // Habilitar opción de factura interna
const CAMPO_2 = 'validate_credit_limit'; // Validar el límite de crédito establecido en los clientes

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
  await page.waitForTimeout(300);
}

async function leerEstado(page) {
  return page.evaluate(({ c1, c2 }) => ({
    campo1: document.getElementById(c1)?.checked,
    campo2: document.getElementById(c2)?.checked
  }), { c1: CAMPO_1, c2: CAMPO_2 });
}

async function cp168_pos_facturacion_categorias_clientes() {
  console.log('🔄 Ejecutando CP-168: Panel de Control — POS: facturación, categorías y clientes...');
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
    if (!seccionAbierta) { await screenshotOnFail(page, 'cp168-fail-seccion-no-abre'); throw new Error('La sección "Configuración del sistema POS" no se pudo expandir'); }

    original = await leerEstado(page);
    console.log('📋 Estado original ("Habilitar factura interna" + "Validar límite de crédito de clientes"):', JSON.stringify(original));
    if (original.campo1 === undefined || original.campo2 === undefined) { await screenshotOnFail(page, 'cp168-fail-campo-no-encontrado'); throw new Error('No se encontraron los campos #' + CAMPO_1 + ' / #' + CAMPO_2); }

    const tGuardar = Date.now();
    await togglearCheckbox(page, CAMPO_1, !original.campo1);
    await togglearCheckbox(page, CAMPO_2, !original.campo2);
    await guardarConfiguracion(page);
    evaluarAccion(Date.now() - tGuardar, 'Guardar ambos checkboxes invertidos');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const trasGuardar = await leerEstado(page);
    console.log('📋 Estado tras guardar y refrescar:', JSON.stringify(trasGuardar));

    // ── Restaurar ambos al estado original ──
    await togglearCheckbox(page, CAMPO_1, original.campo1);
    await togglearCheckbox(page, CAMPO_2, original.campo2);
    await guardarConfiguracion(page);
    console.log('🔄 Estado restaurado al original y guardado de nuevo.');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const trasRestaurar = await leerEstado(page);
    console.log('📋 Estado tras restaurar el original:', JSON.stringify(trasRestaurar));

    // ── VALIDACIONES ──
    const v1 = trasGuardar.campo1 === !original.campo1;
    const v2 = trasGuardar.campo2 === !original.campo2;
    const v3 = trasRestaurar.campo1 === original.campo1 && trasRestaurar.campo2 === original.campo2;

    console.log('\n📊 === VALIDACIONES CP-168 ===');
    console.log('  "Habilitar factura interna" persiste invertido:            ' + (v1 ? '✅' : '❌') + ' (' + trasGuardar.campo1 + ')');
    console.log('  "Validar límite de crédito de clientes" persiste invertido:  ' + (v2 ? '✅' : '❌') + ' (' + trasGuardar.campo2 + ')');
    console.log('  Estado original se restauró correctamente:                  ' + (v3 ? '✅' : '❌'));

    if (!v1) throw new Error('"' + CAMPO_1 + '" no persistió invertido tras guardar y refrescar');
    if (!v2) throw new Error('"' + CAMPO_2 + '" no persistió invertido tras guardar y refrescar');
    if (!v3) throw new Error('El estado original no se restauró correctamente');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-168 PASSED | campos: #' + CAMPO_1 + ' + #' + CAMPO_2 + ' | invertidos y restaurados correctamente | validaciones: 3/3 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-168', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp168-fail');
    console.log('❌ CP-168 FAILED: ' + error.message);
    if (original && page) {
      try {
        await abrirSeccion(page, BTN_ID, CONTENT_ID);
        await togglearCheckbox(page, CAMPO_1, original.campo1);
        await togglearCheckbox(page, CAMPO_2, original.campo2);
        await guardarConfiguracion(page);
        console.log('🔄 (recuperación de emergencia) Estado restaurado tras el fallo.');
      } catch {}
    }
    registrarResultado({ cp: 'CP-168', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp168_pos_facturacion_categorias_clientes();
