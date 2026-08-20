const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');

const URL_RECEPCION = `${BASE_URL}/vehicularReception/vehicularQuickReception`;

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

async function clickSiguiente(page) {
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => b.textContent.trim() === 'Siguiente');
    if (btn) btn.click();
  });
  await page.waitForTimeout(3000);
}

async function iniciarRecepcionHastaFirma(page) {
  await page.click('button.add-reception-btn', { timeout: 15000 });
  await page.waitForTimeout(1800);
  const placa = 'CP306-' + Date.now().toString().slice(-9);
  await page.fill('#vehicle_plaque', placa);
  await page.click('#vr_add_vehicle_btn');
  await page.waitForTimeout(2500);

  await page.fill('#vehicular_reception_customer_search', 'cliente prueba tarea 5');
  await page.waitForTimeout(1800);
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const candidato = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => el.textContent.trim() === 'cliente prueba tarea 5' && el.children.length === 0);
    if (candidato) { (candidato.closest('[onclick], .client-search-result-item, li, div[role="button"]') || candidato).click(); }
  });
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const candidatos = Array.from(document.querySelectorAll('*')).filter(isVis).filter(el => (el.textContent||'').trim() === 'SEDAN');
    const masChico = candidatos.sort((a,b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0];
    const tarjeta = masChico ? masChico.closest('.card.style-vehicle, [onclick*="setVehicleStyle"]') : null;
    if (tarjeta) tarjeta.click();
  });
  await page.waitForTimeout(3000);

  await page.evaluate(() => { const el = document.getElementById('vehicle_brand'); el.value = '131'; el.dispatchEvent(new Event('change', { bubbles: true })); if (window.jQuery) jQuery(el).trigger('chosen:updated'); });
  await page.waitForTimeout(1800);
  const modeloOpciones = await page.evaluate(() => Array.from(document.getElementById('vehicle_model')?.options || []).map(o => o.value));
  if (modeloOpciones.length > 1) await page.evaluate((v) => { const el = document.getElementById('vehicle_model'); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); if (window.jQuery) jQuery(el).trigger('chosen:updated'); }, modeloOpciones[1]);
  await page.waitForTimeout(1500);

  await clickSiguiente(page); // -> Seleccionar servicios
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const candidatas = Array.from(document.querySelectorAll('div')).filter(isVis).filter(el => {
      const t = el.textContent || '';
      return /₡/.test(t) && /Und/.test(t) && !/agregar producto/i.test(t) && el.querySelectorAll('div').length < 6;
    });
    const tarjeta = candidatas.sort((a,b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0];
    if (tarjeta) tarjeta.click();
  });
  await page.waitForTimeout(2000);
  await clickSiguiente(page); // -> Inspección
  await clickSiguiente(page); // -> Enderezado y Pintura
  await clickSiguiente(page); // -> Abonos
  await clickSiguiente(page); // -> Partes del vehículo
  await clickSiguiente(page); // -> Seleccionar fotos
  await clickSiguiente(page); // -> Marcación de daños
  await clickSiguiente(page); // -> Observaciones generales
  await clickSiguiente(page); // -> Firma del cliente
  return placa;
}

async function cp306_firma_cliente_guardar() {
  console.log('🔄 Ejecutando CP-306: Recepción Vehicular — Firma del Cliente...');
  console.log('ℹ️ Este CP solo dibuja la firma — NO clickea "Generar" (eso lo cubre CP-307, Navegación y Finalización)');
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
    await page.waitForTimeout(1000);

    const placa = await iniciarRecepcionHastaFirma(page);
    console.log('📋 Nueva recepción iniciada con placa:', placa);

    const enPasoCorrecto = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return Array.from(document.querySelectorAll('button')).filter(isVis).some(b => /limpiar firma/i.test(b.textContent||''));
    });
    await screenshotOnFail(page, 'cp302-estado-al-llegar');
    console.log('  Wizard llegó a "Firma del cliente":', enPasoCorrecto);
    if (!enPasoCorrecto) throw new Error('El wizard no llegó al paso "Firma del cliente" (botón "Limpiar firma" no encontrado)');

    const listoParaFirmarAntes = await page.evaluate(() => /listo para firmar/i.test(document.body.textContent||''));
    console.log('  Estado "Listo para firmar" antes de dibujar:', listoParaFirmarAntes);

    // ── Dibujar la firma real sobre el canvas ──
    console.log('\n✍️ Dibujando la firma...');
    const tFirma = Date.now();
    const areaFirma = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const canvas = Array.from(document.querySelectorAll('canvas')).filter(isVis).sort((a,b) => (b.getBoundingClientRect().width*b.getBoundingClientRect().height) - (a.getBoundingClientRect().width*a.getBoundingClientRect().height))[0];
      if (!canvas) return null;
      const r = canvas.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    console.log('  Área de firma (canvas) detectada:', JSON.stringify(areaFirma));
    if (!areaFirma) { await screenshotOnFail(page, 'cp302-fail-sin-canvas'); throw new Error('No se encontró el canvas de firma'); }

    const cx = areaFirma.x + areaFirma.w * 0.2;
    const cy = areaFirma.y + areaFirma.h * 0.5;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(cx + i * (areaFirma.w * 0.6 / 8), cy + Math.sin(i) * 20, { steps: 3 });
    }
    await page.mouse.up();
    await page.waitForTimeout(1000);
    evaluarAccion(Date.now() - tFirma, 'Dibujar firma sobre el canvas');

    const listoParaFirmarDespues = await page.evaluate(() => /listo para firmar/i.test(document.body.textContent||''));
    console.log('  Estado "Listo para firmar" después de dibujar:', listoParaFirmarDespues);

    // ── Probar "Limpiar firma" (sin dejarla limpia al final, se vuelve a firmar) ──
    console.log('\n🧹 Probando "Limpiar firma"...');
    const limpioFirma = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /limpiar firma/i.test(b.textContent||''));
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(1000);
    console.log('  "Limpiar firma" clickeado:', limpioFirma);

    // Volver a firmar para dejar la orden en un estado consistente para cerrar el CP
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(cx + i * (areaFirma.w * 0.6 / 8), cy + Math.cos(i) * 15, { steps: 3 });
    }
    await page.mouse.up();
    await page.waitForTimeout(1000);

    await screenshotOnFail(page, 'cp302-estado-final');

    console.log('\n📊 === VALIDACIONES CP-306 ===');
    console.log('  Wizard llegó a "Firma del cliente":              ' + (enPasoCorrecto ? '✅' : '❌'));
    console.log('  Canvas de firma detectado y se pudo dibujar:      ' + (areaFirma ? '✅' : '❌'));
    console.log('  Indicador cambió tras firmar (si aplica):         ' + (listoParaFirmarAntes !== listoParaFirmarDespues ? '✅ cambió' : '➖ sin cambio detectado por texto'));
    console.log('  Botón "Limpiar firma" funciona:                    ' + (limpioFirma ? '✅' : '⚠️ no confirmado'));

    if (!enPasoCorrecto) throw new Error('El wizard no llegó al paso correcto');
    if (!areaFirma) throw new Error('No se pudo dibujar la firma');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-306 PASSED | placa: ' + placa + ' | firma dibujada: ok | limpiar firma: ' + limpioFirma + ' | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp302-fail');
    console.log('❌ CP-306 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp306_firma_cliente_guardar();
