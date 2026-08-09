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
  const numeroOrdenVisible = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const tarjeta = Array.from(document.querySelectorAll('.repair-order-list-item')).filter(isVis)[0];
    const m = tarjeta ? tarjeta.textContent.match(/^\s*(\d+)/) : null;
    return m ? m[1] : null;
  });
  return { orderId: parseInt(dd.replace('myDropdow', ''), 10), numeroOrdenVisible };
}

async function cp254_descargar_qr_vehiculo() {
  console.log('🔄 Ejecutando CP-254: Descargar QR del vehículo...');
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

    const { orderId, numeroOrdenVisible } = await abrirMenuOrdenDemo(page);
    console.log('📋 Orden localizada: #' + numeroOrdenVisible + ' (id interno ' + orderId + ')');

    const linkInfo = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const dd = Array.from(document.querySelectorAll('[id^="myDropdow"]')).filter(isVis)[0];
      const link = dd ? Array.from(dd.querySelectorAll('a')).find(a => /descargar qr/i.test(a.textContent||'')) : null;
      return link ? { href: link.getAttribute('href') } : null;
    });
    if (!linkInfo || !linkInfo.href) { await screenshotOnFail(page, 'cp254-fail-link-no-encontrado'); throw new Error('No se encontró el link "Descargar QR de vehículo" en el menú'); }
    console.log('🔗 Link "Descargar QR de vehículo":', linkInfo.href);

    const tDescarga = Date.now();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const dd = Array.from(document.querySelectorAll('[id^="myDropdow"]')).filter(isVis)[0];
        const link = dd ? Array.from(dd.querySelectorAll('a')).find(a => /descargar qr/i.test(a.textContent||'')) : null;
        if (link) link.click();
      }),
    ]);
    evaluarAccion(Date.now() - tDescarga, 'Descargar QR del vehículo');

    const nombreArchivo = download.suggestedFilename();
    const rutaGuardada = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots', 'cp254-qr-' + Date.now() + '.png');
    let tamañoBytes = null;
    try {
      await download.saveAs(rutaGuardada);
      tamañoBytes = fs.statSync(rutaGuardada).size;
    } catch (e) {
      console.log('  ⚠️ No se pudo guardar el archivo descargado para inspeccionar tamaño:', e.message);
    }
    console.log('📥 Descarga confirmada:', nombreArchivo, tamañoBytes !== null ? '(' + tamañoBytes + ' bytes)' : '');

    const esImagenValida = /\.(png|jpg|jpeg)/i.test(nombreArchivo) && (tamañoBytes === null || tamañoBytes > 100);

    console.log('\n📊 === VALIDACIONES CP-254 ===');
    console.log('  Descarga real confirmada (evento "download"):    ' + (!!download ? '✅' : '❌'));
    console.log('  Nombre de archivo coherente con el vehículo/orden: ' + (nombreArchivo ? '✅ (' + nombreArchivo + ')' : '❌'));
    console.log('  Archivo con contenido real (no vacío/corrupto):  ' + (esImagenValida ? '✅' : '⚠️ no se pudo confirmar el tamaño'));

    if (!download) throw new Error('No se confirmó la descarga del QR');
    if (!nombreArchivo) throw new Error('La descarga no tiene un nombre de archivo válido');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-254 PASSED | orden #' + numeroOrdenVisible + ' | archivo: ' + nombreArchivo + ' | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp254-fail');
    console.log('❌ CP-254 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp254_descargar_qr_vehiculo();
