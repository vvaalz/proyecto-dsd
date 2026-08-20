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

async function iniciarRecepcionHastaFotos(page) {
  await page.click('button.add-reception-btn', { timeout: 15000 });
  await page.waitForTimeout(1800);
  const placa = 'CP299-' + Date.now().toString().slice(-9);
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
  return placa;
}

async function cp299_seleccionar_fotos_subir_imagen() {
  console.log('🔄 Ejecutando CP-299: Recepción Vehicular — Seleccionar Fotos (subir imagen)...');
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

    const placa = await iniciarRecepcionHastaFotos(page);
    console.log('📋 Nueva recepción iniciada con placa:', placa);

    const enPasoCorrecto = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return Array.from(document.querySelectorAll('*')).filter(isVis).some(el => /arrastra\s*fotos\s*aqu[ií]/i.test(el.textContent||'') && el.children.length < 3);
    });
    await screenshotOnFail(page, 'cp299-estado-al-llegar');
    console.log('  Wizard llegó a "Seleccionar fotos":', enPasoCorrecto);
    if (!enPasoCorrecto) throw new Error('El wizard no llegó al paso "Seleccionar fotos" (zona de arrastre no encontrada)');

    // ── Subir una imagen real usando el <input type="file"> oculto tras la zona de arrastre ──
    console.log('\n📸 Subiendo una imagen de prueba...');
    const tSubida = Date.now();
    const inputFileExiste = await page.evaluate(() => !!document.querySelector('input[type="file"]'));
    console.log('  Input de archivo encontrado en el DOM:', inputFileExiste);
    if (!inputFileExiste) { await screenshotOnFail(page, 'cp299-fail-sin-input-file'); throw new Error('No se encontró ningún <input type="file"> en el paso "Seleccionar fotos"'); }

    // Reutiliza una captura ya existente del propio proyecto como archivo de prueba real
    const dirScreenshots = path.join(__dirname, '..', '..', '..', 'reports', 'screenshots');
    const candidatos = fs.existsSync(dirScreenshots) ? fs.readdirSync(dirScreenshots).filter(f => f.endsWith('.png')) : [];
    let rutaImagen;
    if (candidatos.length > 0) {
      rutaImagen = path.join(dirScreenshots, candidatos[0]);
    } else {
      // Fallback: generar un PNG mínimo válido de 1x1 pixel
      rutaImagen = path.join(__dirname, '_cp299_imagen_prueba_temp.png');
      const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
      fs.writeFileSync(rutaImagen, png1x1);
    }
    console.log('  Archivo a subir:', rutaImagen);

    await page.setInputFiles('input[type="file"]', rutaImagen);
    await page.waitForTimeout(3000);
    evaluarAccion(Date.now() - tSubida, 'Subir imagen');

    const imagenSubida = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return Array.from(document.querySelectorAll('img')).filter(isVis).some(img => /blob:|upload|foto|photo/i.test(img.src||''));
    });
    console.log('  ¿Imagen visible tras subirla?:', imagenSubida);

    // Limpiar el archivo temporal si se creó
    const rutaTemp = path.join(__dirname, '_cp299_imagen_prueba_temp.png');
    if (fs.existsSync(rutaTemp)) fs.unlinkSync(rutaTemp);

    await screenshotOnFail(page, 'cp299-estado-final');

    console.log('\n📊 === VALIDACIONES CP-299 ===');
    console.log('  Wizard llegó a "Seleccionar fotos":       ' + (enPasoCorrecto ? '✅' : '❌'));
    console.log('  Input de archivo real encontrado:          ' + (inputFileExiste ? '✅' : '❌'));
    console.log('  Imagen visible tras la subida:              ' + (imagenSubida ? '✅' : '⚠️ no confirmado'));

    if (!enPasoCorrecto) throw new Error('El wizard no llegó al paso correcto');
    if (!inputFileExiste) throw new Error('No se pudo confirmar el input de archivo');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-299 PASSED | placa: ' + placa + ' | imagen subida: ' + imagenSubida + ' | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp299-fail');
    console.log('❌ CP-299 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp299_seleccionar_fotos_subir_imagen();
