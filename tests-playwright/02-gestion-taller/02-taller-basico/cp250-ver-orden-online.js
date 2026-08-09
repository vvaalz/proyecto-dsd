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

// Busca "Cliente Demo Defensa" (orden con Total ₡0,00 confirmado limpio) y abre su menú de
// opciones ("adv-order-dd"). Devuelve el id interno de la orden.
async function localizarOrdenDemoYAbrirMenu(page) {
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
  const orderId = parseInt(dd.replace('myDropdow', ''), 10);
  const numeroOrdenVisible = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const tarjeta = Array.from(document.querySelectorAll('.repair-order-list-item')).filter(isVis)[0];
    const m = tarjeta ? tarjeta.textContent.match(/^\s*(\d+)/) : null;
    return m ? m[1] : null;
  });
  return { orderId, numeroOrdenVisible };
}

async function cp250_ver_orden_online() {
  console.log('🔄 Ejecutando CP-250: Ver orden online...');
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

    const { orderId, numeroOrdenVisible } = await localizarOrdenDemoYAbrirMenu(page);
    console.log('📋 Orden localizada: #' + numeroOrdenVisible + ' (id interno ' + orderId + ')');

    // Confirmar el link real "Ver orden online" antes de clickearlo (href público con hash_key,
    // sin onclick — se abre como cualquier link normal, potencialmente en pestaña nueva)
    const linkInfo = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const dd = Array.from(document.querySelectorAll('[id^="myDropdow"]')).filter(isVis)[0];
      const link = dd ? Array.from(dd.querySelectorAll('a')).find(a => /ver orden online/i.test(a.textContent||'')) : null;
      return link ? { href: link.getAttribute('href'), target: link.getAttribute('target') } : null;
    });
    if (!linkInfo || !linkInfo.href) { await screenshotOnFail(page, 'cp250-fail-link-no-encontrado'); throw new Error('No se encontró el link "Ver orden online" en el menú'); }
    console.log('🔗 Link "Ver orden online":', JSON.stringify(linkInfo));

    const tClick = Date.now();
    const [popup] = await Promise.all([
      context.waitForEvent('page', { timeout: 15000 }).catch(() => null),
      page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const dd = Array.from(document.querySelectorAll('[id^="myDropdow"]')).filter(isVis)[0];
        const link = dd ? Array.from(dd.querySelectorAll('a')).find(a => /ver orden online/i.test(a.textContent||'')) : null;
        if (link) link.click();
      }),
    ]);
    evaluarAccion(Date.now() - tClick, 'Click en "Ver orden online"');

    let paginaOrdenOnline = popup;
    let seAbrioEnPestañaNueva = !!popup;
    if (!paginaOrdenOnline) {
      // Puede que no dispare un evento "page" de contexto si navega la misma pestaña
      await page.waitForTimeout(3000);
      if (page.url() === linkInfo.href || page.url().includes('get_repair_order_by_hash_key')) {
        paginaOrdenOnline = page;
        seAbrioEnPestañaNueva = false;
      }
    }
    if (!paginaOrdenOnline) { await screenshotOnFail(page, 'cp250-fail-no-abrio'); throw new Error('"Ver orden online" no abrió ninguna pestaña/navegación nueva'); }

    await paginaOrdenOnline.waitForLoadState('load', { timeout: 30000 }).catch(()=>{});
    await paginaOrdenOnline.waitForTimeout(2000);
    const urlFinal = paginaOrdenOnline.url();
    const tituloFinal = await paginaOrdenOnline.title().catch(() => '');
    const textoVisible = await paginaOrdenOnline.evaluate(() => document.body ? document.body.innerText.replace(/\s+/g,' ').slice(0, 400) : '').catch(() => '');
    console.log('🌐 Página "Ver orden online" → URL:', urlFinal);
    console.log('   Título:', tituloFinal);
    console.log('   Texto visible (primeros 400 caracteres):', textoVisible);

    const cargoCorrectamente = /get_repair_order_by_hash_key/i.test(urlFinal) && !/error|not found|404|500/i.test(textoVisible.toLowerCase()) && textoVisible.length > 0;
    // Buscar alguna referencia identificable a la orden/cliente en el contenido público
    const contieneDatosOrden = /810|demo defensa|placa|veh[ií]culo|orden/i.test(textoVisible);

    if (seAbrioEnPestañaNueva) { try { await paginaOrdenOnline.close(); } catch {} }

    console.log('\n📊 === VALIDACIONES CP-250 ===');
    console.log('  Se abrió en pestaña nueva:                     ' + (seAbrioEnPestañaNueva ? '✅' : '➖ (misma pestaña)'));
    console.log('  Cargó correctamente (sin error visible):       ' + (cargoCorrectamente ? '✅' : '❌'));
    console.log('  Contiene datos identificables de la orden:     ' + (contieneDatosOrden ? '✅' : '⚠️ no confirmado por texto'));

    if (!cargoCorrectamente) throw new Error('"Ver orden online" no cargó correctamente (URL: ' + urlFinal + ')');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-250 PASSED | orden #' + numeroOrdenVisible + ' | pestaña nueva: ' + seAbrioEnPestañaNueva + ' | datos de orden visibles: ' + contieneDatosOrden + ' | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp250-fail');
    console.log('❌ CP-250 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp250_ver_orden_online();
