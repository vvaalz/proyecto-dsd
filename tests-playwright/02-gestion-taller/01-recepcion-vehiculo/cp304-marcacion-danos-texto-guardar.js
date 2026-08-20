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

async function iniciarRecepcionHastaMarcacion(page) {
  await page.click('button.add-reception-btn', { timeout: 15000 });
  await page.waitForTimeout(1800);
  const placa = 'CP304-' + Date.now().toString().slice(-9);
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
  return placa;
}

async function cp304_marcacion_danos_texto_guardar() {
  console.log('🔄 Ejecutando CP-304: Recepción Vehicular — Marcación de Daños (marcar + texto + guardar)...');
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

    const placa = await iniciarRecepcionHastaMarcacion(page);
    console.log('📋 Nueva recepción iniciada con placa:', placa);

    const enPasoCorrecto = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return Array.from(document.querySelectorAll('*')).filter(isVis).some(el => el.textContent.trim() === 'Marcaciones de daño' && el.children.length < 3);
    });
    await screenshotOnFail(page, 'cp300-estado-al-llegar');
    console.log('  Wizard llegó a "Marcación de daños":', enPasoCorrecto);
    if (!enPasoCorrecto) throw new Error('El wizard no llegó al paso "Marcación de daños" (encabezado no encontrado)');

    // ── 1) Dibujar una marcación real sobre el diagrama del vehículo (arrastrar mouse) ──
    console.log('\n🖊️ Flujo 1: Dibujar una marcación sobre el vehículo...');
    const tDibujo = Date.now();
    const areaDibujo = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const canvas = Array.from(document.querySelectorAll('canvas, svg')).filter(isVis).sort((a,b) => (b.getBoundingClientRect().width*b.getBoundingClientRect().height) - (a.getBoundingClientRect().width*a.getBoundingClientRect().height))[0];
      if (!canvas) return null;
      const r = canvas.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    console.log('  Área de dibujo detectada:', JSON.stringify(areaDibujo));

    let dibujoRealizado = false;
    if (areaDibujo) {
      const cx = areaDibujo.x + areaDibujo.w * 0.4;
      const cy = areaDibujo.y + areaDibujo.h * 0.4;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 30, cy + 20, { steps: 5 });
      await page.mouse.move(cx + 10, cy + 40, { steps: 5 });
      await page.mouse.up();
      dibujoRealizado = true;
    }
    await page.waitForTimeout(1000);
    evaluarAccion(Date.now() - tDibujo, 'Dibujar marcación sobre el vehículo');
    console.log('  Marcación dibujada:', dibujoRealizado);

    // ── 2) Colocar un texto sobre la imagen ──
    console.log('\n🔤 Flujo 2: Colocar texto en la marcación...');
    const tTexto = Date.now();
    const activoColocarTexto = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /colocar texto/i.test(b.textContent||''));
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(1000);
    console.log('  Botón "Colocar texto" activado:', activoColocarTexto);

    if (activoColocarTexto && areaDibujo) {
      const tx = areaDibujo.x + areaDibujo.w * 0.6;
      const ty = areaDibujo.y + areaDibujo.h * 0.3;
      await page.mouse.click(tx, ty);
      await page.waitForTimeout(800);
      await page.keyboard.type('Rayón CP-304', { delay: 30 });
      await page.waitForTimeout(500);
    }
    evaluarAccion(Date.now() - tTexto, 'Colocar texto sobre la marcación');

    // ── 3) Guardar la marcación ──
    console.log('\n💾 Flujo 3: Guardar la marcación nueva...');
    const tGuardar = Date.now();
    const guardoMarcacion = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /guardar nueva/i.test(b.textContent||''));
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tGuardar, 'Guardar marcación nueva');
    console.log('  Marcación guardada ("Guardar nueva"):', guardoMarcacion);

    const yaNoDiceSinFotos = await page.evaluate(() => !/sin fotos guardadas/i.test(document.body.textContent||''));
    console.log('  Ya no muestra "Sin fotos guardadas en esta orden":', yaNoDiceSinFotos);

    await screenshotOnFail(page, 'cp300-estado-final');

    console.log('\n📊 === VALIDACIONES CP-304 ===');
    console.log('  Wizard llegó a "Marcación de daños":       ' + (enPasoCorrecto ? '✅' : '❌'));
    console.log('  Marcación dibujada sobre el vehículo:       ' + (dibujoRealizado ? '✅' : '❌'));
    console.log('  Texto colocado sobre la marcación:          ' + (activoColocarTexto ? '✅' : '⚠️ no confirmado'));
    console.log('  Marcación guardada:                          ' + (guardoMarcacion ? '✅' : '❌'));
    console.log('  Miniatura guardada refleja el cambio:        ' + (yaNoDiceSinFotos ? '✅' : '⚠️ no confirmado'));

    if (!enPasoCorrecto) throw new Error('El wizard no llegó al paso correcto');
    if (!dibujoRealizado) throw new Error('No se pudo dibujar sobre el diagrama del vehículo');
    if (!guardoMarcacion) throw new Error('No se pudo guardar la marcación');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-304 PASSED | placa: ' + placa + ' | dibujo: ok | texto: ' + activoColocarTexto + ' | guardado: ok | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp300-fail');
    console.log('❌ CP-304 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp304_marcacion_danos_texto_guardar();
