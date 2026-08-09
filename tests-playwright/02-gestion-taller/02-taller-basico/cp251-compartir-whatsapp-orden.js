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

async function cp251_compartir_whatsapp_orden() {
  console.log('🔄 Ejecutando CP-251: Compartir orden por WhatsApp (descarga de documentos, sin enviar real)...');
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
      if (typeof confirmSendRepairOrderWhatsapp !== 'function') return false;
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const dd = Array.from(document.querySelectorAll('[id^="myDropdow"]')).filter(isVis)[0];
      const link = dd ? Array.from(dd.querySelectorAll('a')).find(a => /compartir por whatsapp/i.test(a.textContent||'')) : null;
      if (link) { link.click(); return true; }
      return false;
    });
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tAbrir, 'Abrir modal de WhatsApp');
    if (!abrio) { await screenshotOnFail(page, 'cp251-fail-no-abrio'); throw new Error('No se encontró/clickeó el link "Compartir por whatsapp"'); }

    const modalVisible = await page.evaluate(() => {
      const m = document.getElementById('dialog_send_whatsapp_message');
      return m ? getComputedStyle(m).display !== 'none' : false;
    });
    if (!modalVisible) { await screenshotOnFail(page, 'cp251-fail-modal-no-visible'); throw new Error('El modal "dialog_send_whatsapp_message" no quedó visible'); }
    console.log('  ✅ Modal de WhatsApp abierto');

    // Validar número de teléfono precargado (dato real del cliente)
    const numeroPrecargado = await page.evaluate(() => document.getElementById('input_whatsapp_message_number')?.value || null);
    console.log('  📱 Número precargado:', numeroPrecargado);

    // Escribir un mensaje de prueba (sin enviar)
    await page.fill('#txt_whatsapp_message_text', 'Mensaje de prueba CP-251 (no se envía realmente)').catch(()=>{});

    // Activar los toggles de documentos a compartir (Proforma, Cotización general, etc.)
    const tToggle = Date.now();
    await page.evaluate(() => document.getElementById('btn_toggle_whatsapp_tools')?.click());
    await page.waitForTimeout(1000);
    evaluarAccion(Date.now() - tToggle, 'Abrir panel de documentos a compartir');

    const totalBotonesDescarga = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return Array.from(document.querySelectorAll('.whatsapp-document-download-btn')).filter(isVis).length;
    });
    console.log('  📎 Botones de descarga de documentos visibles:', totalBotonesDescarga);

    // Descargar el primer documento disponible (validación real, sin enviar WhatsApp). El
    // click puede resultar en una descarga real O en abrir el documento en una pestaña nueva
    // (ver el PDF inline) — se acepta cualquiera de las dos como evidencia de que el botón
    // funciona de verdad.
    let descargaOk = false;
    let nombreDescarga = null;
    if (totalBotonesDescarga > 0) {
      const tDescarga = Date.now();
      try {
        const eventoDescarga = page.waitForEvent('download', { timeout: 15000 }).then(d => ({ tipo: 'download', valor: d.suggestedFilename() }));
        const eventoPestañaNueva = context.waitForEvent('page', { timeout: 15000 }).then(async p => { await p.waitForLoadState('load', { timeout: 10000 }).catch(()=>{}); const u = p.url(); await p.close().catch(()=>{}); return { tipo: 'pestaña', valor: u }; });
        const promesaEvento = Promise.race([eventoDescarga, eventoPestañaNueva]);
        await page.evaluate(() => {
          const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
          const btn = Array.from(document.querySelectorAll('.whatsapp-document-download-btn')).filter(isVis)[0];
          if (btn) btn.click();
        });
        const evento = await promesaEvento;
        nombreDescarga = evento.tipo + ': ' + evento.valor;
        descargaOk = true;
        evaluarAccion(Date.now() - tDescarga, 'Descargar/abrir documento desde modal de WhatsApp');
        console.log('  📥 Evidencia de funcionamiento real del botón:', nombreDescarga);
      } catch (e) {
        console.log('  ⚠️ No se detectó descarga ni pestaña nueva tras clickear el primer documento:', e.message);
      }
    } else {
      console.log('  ⚠️ HALLAZGO: no hay botones de descarga de documentos visibles en el panel de WhatsApp');
    }

    // Confirmar que el botón "Enviar" real existe (validación de UI) SIN clickearlo — no se
    // envía ningún WhatsApp real, consistente con el precedente ya establecido en el proyecto.
    const botonEnviarExiste = await page.evaluate(() => {
      const m = document.getElementById('dialog_send_whatsapp_message');
      return m ? Array.from(m.querySelectorAll('button')).some(b => /enviar/i.test(b.textContent||'') && b.type === 'submit') : false;
    });

    // Cerrar el modal sin enviar
    await page.evaluate(() => document.getElementById('btn_cancel_send_whatsapp_modal')?.click());
    await page.waitForTimeout(1500);
    const modalCerrado = await page.evaluate(() => { const m = document.getElementById('dialog_send_whatsapp_message'); return !m || getComputedStyle(m).display === 'none'; });

    console.log('\n📊 === VALIDACIONES CP-251 ===');
    console.log('  Modal de WhatsApp abrió con datos reales del cliente:  ' + (modalVisible && !!numeroPrecargado ? '✅' : '⚠️'));
    console.log('  Documentos disponibles para compartir:                  ' + totalBotonesDescarga);
    console.log('  Descarga real de un documento confirmada:               ' + (descargaOk ? '✅ (' + nombreDescarga + ')' : '❌'));
    console.log('  Botón "Enviar" real presente (no clickeado):            ' + (botonEnviarExiste ? '✅' : '❌'));
    console.log('  Modal cerrado con "Cancelar" (sin enviar):              ' + (modalCerrado ? '✅' : '❌'));

    if (!modalVisible) throw new Error('El modal de WhatsApp no se abrió');
    if (totalBotonesDescarga > 0 && !descargaOk) throw new Error('Había documentos disponibles pero la descarga no se pudo confirmar');
    if (!modalCerrado) throw new Error('El modal no cerró correctamente al cancelar');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-251 PASSED | orden #' + numeroOrdenVisible + ' | documentos: ' + totalBotonesDescarga + ' | descarga confirmada: ' + descargaOk + ' | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp251-fail');
    console.log('❌ CP-251 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp251_compartir_whatsapp_orden();
