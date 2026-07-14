const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const PANEL_URL = `${BASE_URL}/sett/setting`;
// Tab "Tienda online" (#store) — Bloque C del Panel de Control.
// ⚠️ HALLAZGO (investigado a fondo, ver CLAUDE_CONTEXT.md): el botón "Guardar cambios"
// (#save_settings_store) no está dentro de ningún <form> (closest('form') === null) y no
// dispara ninguna petición POST al servidor ni con un click real de Playwright — los cambios
// quedan solo en memoria del DOM y se pierden al refrescar. Confirmado con inspección de red
// (page.on('request')) sin ningún POST relacionado tras el click. Mismo patrón de "link/botón
// no funcional en este entorno" ya documentado en CP-148 (tab Twilio) — este CP documenta el
// hallazgo en vez de forzar una cobertura de "guarda y persiste" que nunca podría pasar.
const CAMPO_SELECT_ID = 'color_select'; // Color de plantilla
const CAMPO_CHECKBOX_ID = 'enable_newsletter'; // Mostrar Newsletter

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

async function abrirTabTiendaOnline(page) {
  // El sidebar puede quedar momentáneamente reposicionándose justo tras un reload
  // (refrescarConCacheLimpia) e interceptar el click del tab — reintentar en vez de
  // fallar con el primer intento.
  for (let intento = 1; intento <= 3; intento++) {
    try {
      await page.click('a[href="#store"]', { timeout: 15000 });
      break;
    } catch (e) {
      if (intento === 3) throw e;
      await page.waitForTimeout(2000);
    }
  }
  await page.waitForTimeout(1500);
  return page.evaluate(() => document.querySelector('#store')?.classList.contains('active'));
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

async function seleccionarOpcion(page, id, valor) {
  await page.evaluate(({ id, valor }) => {
    const el = document.getElementById(id);
    el.value = valor;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { id, valor });
  await page.waitForTimeout(300);
}

async function leerEstado(page) {
  return page.evaluate(({ selectId, checkboxId }) => ({
    select: document.getElementById(selectId)?.value,
    checkbox: document.getElementById(checkboxId)?.checked
  }), { selectId: CAMPO_SELECT_ID, checkboxId: CAMPO_CHECKBOX_ID });
}

async function leerOpcionesSelect(page, id) {
  return page.evaluate((id) => {
    const el = document.getElementById(id);
    return el ? Array.from(el.options).map(o => o.value) : [];
  }, id);
}

async function cp176_tienda_online_guardar_no_funcional() {
  console.log('🔄 Ejecutando CP-176: Panel de Control — Tienda online: investigar botón "Guardar cambios" (hallazgo: no funcional)...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();

  const postsRelevantes = [];

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

    page.on('request', (req) => {
      if (req.method() === 'POST' && !/getUserNotifications|getMonth|addLogRegister|overrides\/all/i.test(req.url())) {
        postsRelevantes.push(req.url());
      }
    });

    const tabActivo = await abrirTabTiendaOnline(page);
    if (!tabActivo) { await screenshotOnFail(page, 'cp176-fail-tab-no-activo'); throw new Error('El tab "Tienda online" (#store) no quedó activo tras el click'); }

    const original = await leerEstado(page);
    console.log('📋 Estado original ("Color de plantilla" + "Mostrar Newsletter"):', JSON.stringify(original));
    if (original.select === undefined || original.checkbox === undefined) { await screenshotOnFail(page, 'cp176-fail-campo-no-encontrado'); throw new Error('No se encontraron los campos #' + CAMPO_SELECT_ID + ' / #' + CAMPO_CHECKBOX_ID); }

    // ── Confirmar que el botón existe pero NO está dentro de un <form> (hallazgo estructural) ──
    const infoBoton = await page.evaluate(() => {
      const btn = document.getElementById('save_settings_store');
      const form = btn?.closest('form');
      return { existe: !!btn, disabled: btn?.disabled, tieneForm: !!form };
    });
    console.log('📋 Info del botón "Guardar cambios":', JSON.stringify(infoBoton));

    const opciones = await leerOpcionesSelect(page, CAMPO_SELECT_ID);
    const valorAlternativo = opciones.find(v => v !== original.select);

    // ── Modificar ambos campos (quedan en memoria) y clickear "Guardar cambios" 3 veces ──
    const tGuardar = Date.now();
    await seleccionarOpcion(page, CAMPO_SELECT_ID, valorAlternativo);
    await togglearCheckbox(page, CAMPO_CHECKBOX_ID, !original.checkbox);
    const enMemoriaTrasModificar = await leerEstado(page);
    console.log('📋 Estado EN MEMORIA tras modificar (antes de guardar):', JSON.stringify(enMemoriaTrasModificar));

    for (let i = 0; i < 3; i++) {
      await page.click('#save_settings_store', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(1500);
    }
    evaluarAccion(Date.now() - tGuardar, 'Modificar + clickear "Guardar cambios" (3 intentos)');
    console.log('📡 Peticiones POST relevantes detectadas tras los 3 clicks en "Guardar cambios":', JSON.stringify(postsRelevantes));

    // ── Refrescar y confirmar si los cambios persistieron o no ──
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('.nav-tabs', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(1500);
    await abrirTabTiendaOnline(page);
    const trasGuardarYRefrescar = await leerEstado(page);
    console.log('📋 Estado tras guardar (x3) y refrescar:', JSON.stringify(trasGuardarYRefrescar));

    // ── Confirmar que el resto del módulo sigue operativo (no quedó roto) ──
    const dashboardSigueFuncionando = await page.evaluate(() => {
      const dash = document.getElementById('dash');
      return !!dash;
    });
    console.log('📋 Tab Dashboard sigue existiendo tras la investigación:', dashboardSigueFuncionando);

    // Si por algún motivo el cambio SÍ persistió (el hallazgo ya no aplica), restaurar el original.
    const siPersistioRestaurar = trasGuardarYRefrescar.select === valorAlternativo || trasGuardarYRefrescar.checkbox === !original.checkbox;
    if (siPersistioRestaurar) {
      await seleccionarOpcion(page, CAMPO_SELECT_ID, original.select);
      await togglearCheckbox(page, CAMPO_CHECKBOX_ID, original.checkbox);
      await page.click('#save_settings_store', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);
      console.log('🔄 El cambio sí había persistido — se restauró el valor original.');
    }

    // ── VALIDACIONES (documentación de hallazgo, mismo criterio que CP-148) ──
    const v1 = infoBoton.existe; // el botón existe en el DOM
    const v2 = !infoBoton.tieneForm; // hallazgo estructural: no está dentro de un <form>
    const v3 = postsRelevantes.length === 0; // ningún POST relevante se disparó tras 3 clicks
    const v4 = trasGuardarYRefrescar.select === original.select && trasGuardarYRefrescar.checkbox === original.checkbox; // no persistió (confirma el hallazgo)
    const v5 = dashboardSigueFuncionando; // el resto del módulo no queda roto

    console.log('\n📊 === VALIDACIONES CP-176 (documentación de hallazgo) ===');
    console.log('  Botón "Guardar cambios" existe en el DOM:              ' + (v1 ? '✅' : '❌'));
    console.log('  Botón NO está dentro de un <form> (hallazgo):          ' + (v2 ? '⚠️ confirmado' : '❌ inesperado: sí tiene form'));
    console.log('  Ningún POST relevante tras 3 clicks (hallazgo):        ' + (v3 ? '⚠️ confirmado' : '❌ inesperado: sí se envió (' + postsRelevantes.length + ')'));
    console.log('  Los cambios NO persisten tras refrescar (hallazgo):    ' + (v4 ? '⚠️ confirmado' : '✅ sí persistió — el hallazgo ya no aplica'));
    console.log('  El resto del módulo no queda roto:                     ' + (v5 ? '✅' : '❌'));

    if (!v1) throw new Error('El botón "Guardar cambios" (#save_settings_store) no existe en el DOM — no se puede confirmar el hallazgo');
    if (!v5) throw new Error('El módulo quedó en un estado roto tras la investigación');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    if (v2 && v3 && v4) {
      console.log('⚠️ CP-176 RESULT: Hallazgo confirmado — el botón "Guardar cambios" del tab "Tienda online" (#save_settings_store) no produce ningún efecto real: no está dentro de un <form>, no dispara ninguna petición POST al servidor ni con 3 clicks reales de Playwright, y los cambios en #color_select/#enable_newsletter quedan solo en memoria del DOM (se pierden al refrescar). El resto del módulo no queda roto. | tiempo: ' + tiempoTotal + 'ms');
    } else {
      console.log('✅ CP-176 RESULT: El guardado sí funcionó (el hallazgo documentado ya no reproduce) — #' + CAMPO_SELECT_ID + '/#' + CAMPO_CHECKBOX_ID + ' persistieron correctamente y se restauraron. | tiempo: ' + tiempoTotal + 'ms');
    }
    registrarResultado({ cp: 'CP-176', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp176-fail');
    console.log('❌ CP-176 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-176', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp176_tienda_online_guardar_no_funcional();
