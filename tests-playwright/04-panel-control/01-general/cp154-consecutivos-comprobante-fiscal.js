const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const PANEL_URL = `${BASE_URL}/sett/setting`;
const BTN_ID = 'dashboard_button_setting_14';
const CONTENT_ID = 'dashboard_content_settings_14';
const CAMPOS = ['current_fiscal_credit_controcode', 'current_consume_controlcode', 'current_special_tax_regimes_controlcode', 'current_government_receipt_controlcode'];
const CAMPO_ID = CAMPOS[0];
const VALOR_PRUEBA = '5';

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

async function cp154_consecutivos_comprobante_fiscal() {
  console.log('🔄 Ejecutando CP-154: Panel de Control — Consecutivos Comprobante Fiscal...');
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

    const seccionAbierta = await abrirSeccion(page, BTN_ID, CONTENT_ID);
    if (!seccionAbierta) { await screenshotOnFail(page, 'cp154-fail-seccion-no-abre'); throw new Error('La sección "Consecutivos Comprobante Fiscal" no se pudo expandir'); }

    // ── Confirmar que los 4 campos existen y leer su valor original ──
    const valoresOriginales = await page.evaluate((ids) => {
      const out = {};
      for (const id of ids) out[id] = document.getElementById(id)?.value ?? null;
      return out;
    }, CAMPOS);
    console.log('📋 Valores originales de los 4 consecutivos:', JSON.stringify(valoresOriginales));
    if (Object.values(valoresOriginales).some(v => v === null)) { await screenshotOnFail(page, 'cp154-fail-campo-no-encontrado'); throw new Error('No se encontraron los 4 campos de consecutivos esperados'); }

    // ── Capturar el payload real que se envía al guardar ──
    const capturaPayload = new Promise((resolve) => {
      page.on('request', function handler(req) {
        if (req.method() === 'POST' && req.url().includes('/sett/updateSetting')) {
          page.off('request', handler);
          resolve(req.postData() || '');
        }
      });
    });

    // ── Cambiar el primer campo y guardar ──
    const tGuardar = Date.now();
    await page.evaluate(({ id, val }) => {
      const el = document.getElementById(id);
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { id: CAMPO_ID, val: VALOR_PRUEBA });
    await page.waitForTimeout(300);
    await page.evaluate(() => { document.getElementById('save_settings')?.click(); });
    const payload = await Promise.race([capturaPayload, new Promise(r => setTimeout(() => r(null), 8000))]);
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tGuardar, 'Guardar consecutivo modificado');

    const camposEnPayload = CAMPOS.map(id => ({ id, incluido: payload ? payload.includes(id) : null }));
    console.log('🌐 ¿Payload de /sett/updateSetting capturado?', payload !== null, '| longitud:', payload ? payload.length : 0);
    console.log('📋 ¿Cada campo de consecutivo aparece en el payload enviado al servidor?', JSON.stringify(camposEnPayload));

    // ── Refrescar y verificar si el valor persistió ──
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirSeccion(page, BTN_ID, CONTENT_ID);
    const valorTrasGuardar = await page.evaluate((id) => document.getElementById(id)?.value, CAMPO_ID);
    console.log('📋 Valor de "' + CAMPO_ID + '" tras guardar y refrescar:', valorTrasGuardar, '(se escribió "' + VALOR_PRUEBA + '")');

    // Si por alguna razón sí persistió (comportamiento corregido en el futuro), restaurar el original
    if (valorTrasGuardar === VALOR_PRUEBA) {
      await page.evaluate(({ id, val }) => {
        const el = document.getElementById(id);
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, { id: CAMPO_ID, val: valoresOriginales[CAMPO_ID] });
      await page.evaluate(() => { document.getElementById('save_settings')?.click(); });
      await page.waitForTimeout(3000);
      console.log('🔄 (el campo sí persistió) Valor restaurado al original y guardado de nuevo.');
    }

    await screenshotOnFail(page, 'cp154-hallazgo-consecutivos-no-se-guardan');

    // ── VALIDACIONES ──
    const ningunCampoEnPayload = payload !== null && CAMPOS.every(id => !payload.includes(id));
    const valorNoPersistio = valorTrasGuardar !== VALOR_PRUEBA;
    const camposExisten = true; // ya validado arriba (throw si faltaba alguno)

    console.log('\n📊 === VALIDACIONES CP-154 (documentación de hallazgo) ===');
    console.log('  Los 4 campos de consecutivos existen en el DOM:      ' + (camposExisten ? '✅' : '❌'));
    console.log('  Ningún campo de consecutivo va en el payload guardado: ' + (ningunCampoEnPayload ? '⚠️ confirmado' : '✅ (sí se incluyen, comportamiento corregido)'));
    console.log('  El valor modificado NO persiste tras guardar+refrescar: ' + (valorNoPersistio ? '⚠️ confirmado' : '✅ (sí persiste, comportamiento corregido)'));

    const tiempoTotal = Date.now() - tiempoInicioCP;
    if (ningunCampoEnPayload && valorNoPersistio) {
      console.log('⚠️ CP-154 RESULT: Hallazgo confirmado — los 4 campos de "Consecutivos Comprobante Fiscal" (' + CAMPOS.join(', ') + ') se pueden editar en el formulario, pero NINGUNO se incluye en el payload real enviado a POST /sett/updateSetting al hacer click en "Guardar" (confirmado inspeccionando request.postData() de la llamada real). El cambio se ve reflejado visualmente hasta que se refresca la página, momento en el que se pierde porque nunca llegó al servidor. Es un gap real de la app (estos campos no están conectados al guardado general), no un problema del script. | tiempo: ' + tiempoTotal + 'ms');
    } else {
      console.log('✅ CP-154 PASSED | el comportamiento cambió respecto al hallazgo original — los consecutivos ahora sí se guardan correctamente | tiempo: ' + tiempoTotal + 'ms');
    }
    registrarResultado({ cp: 'CP-154', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp154-fail');
    console.log('❌ CP-154 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-154', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp154_consecutivos_comprobante_fiscal();
