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

async function cp252_enviar_orden_email() {
  console.log('🔄 Ejecutando CP-252: Enviar orden por Email (sin enviar real)...');
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

    const tAbrir = Date.now();
    const abrio = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const dd = Array.from(document.querySelectorAll('[id^="myDropdow"]')).filter(isVis)[0];
      const link = dd ? Array.from(dd.querySelectorAll('a')).find(a => /enviar por correo/i.test(a.textContent||'')) : null;
      if (link) { link.click(); return true; }
      return false;
    });
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tAbrir, 'Abrir modal de Email');
    if (!abrio) { await screenshotOnFail(page, 'cp252-fail-no-abrio'); throw new Error('No se encontró/clickeó el link "Enviar por correo"'); }

    const modalVisible = await page.evaluate(() => {
      const m = document.getElementById('dialog_send_order_email');
      return m ? getComputedStyle(m).display !== 'none' : false;
    });
    if (!modalVisible) { await screenshotOnFail(page, 'cp252-fail-modal-no-visible'); throw new Error('El modal "dialog_send_order_email" no quedó visible'); }
    console.log('  ✅ Modal de Email abierto');

    // El input de correos usa selectize.js (input real es "order_email_tags-selectized"),
    // hay que escribir y presionar Enter para que se agregue como tag/chip, como un usuario real.
    const tEscribir = Date.now();
    // El campo es un widget selectize.js -- .fill() asigna el value directamente y no dispara
    // el parser interno que crea el tag/chip; hace falta un tipeo real tecla por tecla. El
    // input real se angosta a pocos px, así que se hace foco por su contenedor visible en vez
    // de clickear el input diminuto directamente.
    await page.locator('.selectize-input').first().click({ timeout: 8000 });
    await page.waitForTimeout(300);
    await page.keyboard.type('qa-cp252-prueba@example.com', { delay: 40 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    evaluarAccion(Date.now() - tEscribir, 'Escribir y agregar correo de prueba');

    const tagAgregado = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      return Array.from(document.querySelectorAll('.selectize-control .item')).filter(isVis).some(e => e.getAttribute('data-value') === 'qa-cp252-prueba@example.com' || /qa-cp252-prueba@example\.com/i.test(e.textContent||''));
    });
    console.log('  📧 Correo agregado como tag/chip:', tagAgregado);

    const botonEnviarExiste = await page.evaluate(() => {
      const m = document.getElementById('dialog_send_order_email');
      if (!m) return false;
      return Array.from(m.querySelectorAll('button, input[type="submit"], a')).some(b => /enviar/i.test(b.textContent||b.value||''));
    });

    // Cerrar con "Cancelar" sin enviar ningún correo real
    const cerrado = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const m = document.getElementById('dialog_send_order_email');
      const btn = m ? Array.from(m.querySelectorAll('button')).filter(isVis).find(b => /cancelar/i.test(b.textContent||'')) : null;
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(1500);
    const modalCerrado = await page.evaluate(() => { const m = document.getElementById('dialog_send_order_email'); return !m || getComputedStyle(m).display === 'none'; });

    console.log('\n📊 === VALIDACIONES CP-252 ===');
    console.log('  Modal de Email abrió correctamente:              ' + (modalVisible ? '✅' : '❌'));
    console.log('  Correo de prueba agregado como tag/chip real:    ' + (tagAgregado ? '✅' : '❌'));
    console.log('  Botón "Enviar" real presente (no clickeado):     ' + (botonEnviarExiste ? '✅' : '❌'));
    console.log('  Modal cerrado con "Cancelar" (sin enviar):       ' + (cerrado && modalCerrado ? '✅' : '❌'));

    if (!modalVisible) throw new Error('El modal de Email no se abrió');
    if (!tagAgregado) throw new Error('No se pudo confirmar que el correo de prueba se agregó como tag en el campo de destinatarios');
    if (!modalCerrado) throw new Error('El modal no cerró correctamente al cancelar');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-252 PASSED | orden #' + numeroOrdenVisible + ' | correo agregado: ' + tagAgregado + ' | botón enviar presente: ' + botonEnviarExiste + ' | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp252-fail');
    console.log('❌ CP-252 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp252_enviar_orden_email();
