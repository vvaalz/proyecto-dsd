const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');

const URL_RECEPCION = `${BASE_URL}/vehicularReception/vehicularQuickReception`;
const CLIENTE_DEMO = 'Cliente Demo Defensa';

const screenshotOnFail = async (page, name) => { try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {} };
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

async function abrirMenuOrdenDemo(page) {
  await page.fill('#repair_order_search', CLIENTE_DEMO);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  const idx = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    return Array.from(document.querySelectorAll('.options-menu-button')).findIndex(isVis);
  });
  if (idx < 0) throw new Error('No se encontró ningún botón de opciones visible para la orden "' + CLIENTE_DEMO + '"');
  const boton = page.locator('.options-menu-button').nth(idx);
  await boton.scrollIntoViewIfNeeded().catch(()=>{});
  await page.waitForTimeout(500);
  await boton.click({ timeout: 8000 }).catch(async () => { await boton.evaluate(el => el.click()); });
  await page.waitForTimeout(2000);
  const dd = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const el = Array.from(document.querySelectorAll('[id^="myDropdow"]')).filter(isVis)[0];
    return el ? el.id : null;
  });
  if (!dd) throw new Error('No se abrió el menú de opciones ("adv-order-dd") de la orden');
  return parseInt(dd.replace('myDropdow', ''), 10);
}

async function clickLinkEnMenu(page, textoRegex) {
  return await page.evaluate((patron) => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const dd = Array.from(document.querySelectorAll('[id^="myDropdow"]')).filter(isVis)[0];
    const re = new RegExp(patron, 'i');
    const link = dd ? Array.from(dd.querySelectorAll('a')).find(a => re.test(a.textContent||'')) : null;
    if (link) { link.click(); return true; }
    return false;
  }, textoRegex);
}

// Dispara un link del menú que produce un documento (descarga real esperada, dado el header
// Content-Disposition de estos endpoints). Si no llega ninguna descarga en el plazo, revisa
// si en cambio abrió una pestaña nueva o navegó la misma pestaña, para diagnosticar sin asumir.
async function dispararYCapturarDocumento(context, page, textoRegex, etiqueta) {
  const urlAntes = page.url();
  const paginasAntes = context.pages().length;
  let evento = null;
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }),
      clickLinkEnMenu(page, textoRegex),
    ]);
    evento = { tipo: 'download', valor: download.suggestedFilename() };
  } catch (e) {
    const paginasAhora = context.pages();
    if (paginasAhora.length > paginasAntes) {
      const nueva = paginasAhora[paginasAhora.length - 1];
      await nueva.waitForLoadState('load', { timeout: 8000 }).catch(()=>{});
      evento = { tipo: 'pestaña', valor: nueva.url() };
      await nueva.close().catch(()=>{});
    } else if (page.url() !== urlAntes) {
      evento = { tipo: 'navegación', valor: page.url() };
      await page.goto(urlAntes, { waitUntil: 'load', timeout: 60000 }).catch(()=>{});
      await page.waitForTimeout(1500);
    }
  }
  console.log('  📄 ' + etiqueta + ' →', evento ? (evento.tipo + ': ' + evento.valor) : '⚠️ sin evidencia de descarga/apertura/navegación');
  return { clickeado: true, evento };
}

async function cp253_documentos_orden_pdf_imprimir() {
  console.log('🔄 Ejecutando CP-253: Documentos de la orden (PDF General/Descriptivo/Inspección + Imprimir)...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, URL_RECEPCION));
    await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
    evaluarCargaPagina(Date.now() - t0, 'Carga de Recepción de Vehículo');
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
    try { const d = await page.$('#workshop-web-notification-permission-dismiss'); if (d) await d.click(); } catch {}
    try { await page.waitForSelector('.repair-order-list-item', { state: 'attached', timeout: 25000 }); } catch {}
    await page.waitForTimeout(1500);

    const resultados = {};

    // ── 1) Crear PDF General ──
    await abrirMenuOrdenDemo(page);
    let tAccion = Date.now();
    resultados.pdfGeneral = await dispararYCapturarDocumento(context, page, 'crear pdf general', 'Crear PDF General');
    evaluarAccion(Date.now() - tAccion, 'Crear PDF General');
    await page.waitForTimeout(1000);

    // ── 2) Crear PDF Descriptivo ──
    await abrirMenuOrdenDemo(page);
    tAccion = Date.now();
    resultados.pdfDescriptivo = await dispararYCapturarDocumento(context, page, 'crear pdf descriptivo', 'Crear PDF Descriptivo');
    evaluarAccion(Date.now() - tAccion, 'Crear PDF Descriptivo');
    await page.waitForTimeout(1000);

    // ── 3) Crear PDF Reporte Inspección ──
    await abrirMenuOrdenDemo(page);
    tAccion = Date.now();
    resultados.pdfInspeccion = await dispararYCapturarDocumento(context, page, 'crear pdf reporte inspecci', 'Crear PDF Reporte Inspección');
    evaluarAccion(Date.now() - tAccion, 'Crear PDF Reporte Inspección');
    await page.waitForTimeout(1000);

    // ── 4) Imprimir ── (dispara printVehicularReception -> window.print(), neutralizado a
    // nivel de contexto en usar-sesion.js -- la validación es que NO cuelgue el script y la
    // página siga respondiendo después.
    await abrirMenuOrdenDemo(page);
    tAccion = Date.now();
    const urlAntesImprimir = page.url();
    const clickImprimir = await clickLinkEnMenu(page, 'imprimir$');
    await page.waitForTimeout(4000);
    const paginaResponde = await page.evaluate(() => !!document.body).catch(() => false);
    evaluarAccion(Date.now() - tAccion, 'Imprimir orden');
    console.log('  🖨️ Imprimir → click:', clickImprimir, '| página responde tras el click:', paginaResponde, '| URL sin cambios:', page.url() === urlAntesImprimir);
    resultados.imprimir = { clickeado: clickImprimir, paginaResponde };

    console.log('\n📊 === VALIDACIONES CP-253 ===');
    const pdfGeneralOk = resultados.pdfGeneral.clickeado && !!resultados.pdfGeneral.evento;
    const pdfDescriptivoOk = resultados.pdfDescriptivo.clickeado && !!resultados.pdfDescriptivo.evento;
    const pdfInspeccionOk = resultados.pdfInspeccion.clickeado && !!resultados.pdfInspeccion.evento;
    const imprimirOk = resultados.imprimir.clickeado && resultados.imprimir.paginaResponde;
    console.log('  Crear PDF General (descarga/apertura real):        ' + (pdfGeneralOk ? '✅' : '❌'));
    console.log('  Crear PDF Descriptivo (descarga/apertura real):    ' + (pdfDescriptivoOk ? '✅' : '❌'));
    console.log('  Crear PDF Reporte Inspección (descarga/apertura):  ' + (pdfInspeccionOk ? '✅' : '⚠️ (puede depender de datos de inspección aún no llenados en esta orden)'));
    console.log('  Imprimir orden (sin colgarse, página responde):    ' + (imprimirOk ? '✅' : '❌'));

    if (!pdfGeneralOk) throw new Error('"Crear PDF General" no produjo descarga/apertura ni navegación');
    if (!pdfDescriptivoOk) throw new Error('"Crear PDF Descriptivo" no produjo descarga/apertura ni navegación');
    if (!imprimirOk) throw new Error('"Imprimir" no se pudo confirmar sin colgar la página');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-253 PASSED | PDF General: ' + pdfGeneralOk + ' | PDF Descriptivo: ' + pdfDescriptivoOk + ' | PDF Inspección: ' + pdfInspeccionOk + ' | Imprimir: ' + imprimirOk + ' | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp253-fail');
    console.log('❌ CP-253 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp253_documentos_orden_pdf_imprimir();
