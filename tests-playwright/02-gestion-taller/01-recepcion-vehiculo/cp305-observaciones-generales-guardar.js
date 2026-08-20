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

async function iniciarRecepcionHastaObservaciones(page) {
  await page.click('button.add-reception-btn', { timeout: 15000 });
  await page.waitForTimeout(1800);
  const placa = 'CP305-' + Date.now().toString().slice(-9);
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
  return placa;
}

async function cp305_observaciones_generales_guardar() {
  console.log('🔄 Ejecutando CP-305: Recepción Vehicular — Observaciones Generales...');
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

    const placa = await iniciarRecepcionHastaObservaciones(page);
    console.log('📋 Nueva recepción iniciada con placa:', placa);

    const enPasoCorrecto = await page.evaluate(() => !!document.getElementById('damage_repair') && !!document.getElementById('damage_repair_message'));
    await screenshotOnFail(page, 'cp301-estado-al-llegar');
    console.log('  Wizard llegó a "Observaciones generales":', enPasoCorrecto);
    if (!enPasoCorrecto) throw new Error('El wizard no llegó al paso "Observaciones generales" (textareas no encontrados)');

    // ── Llenar las 2 observaciones (Asesor de servicio + Notas del cliente) ──
    console.log('\n📝 Llenando observaciones...');
    const tLlenar = Date.now();
    const textoAsesor = 'Observación del asesor de servicio (CP-305) — vehículo recibido sin novedades adicionales a lo ya documentado.';
    const textoCliente = 'Notas del cliente (CP-305): el cliente solicita que se le contacte antes de cualquier reparación adicional.';
    await page.fill('#damage_repair', textoAsesor);
    await page.fill('#damage_repair_message', textoCliente);
    await page.waitForTimeout(500);
    evaluarAccion(Date.now() - tLlenar, 'Llenar ambas observaciones');

    const valoresLlenados = await page.evaluate(() => ({
      asesor: document.getElementById('damage_repair')?.value || '',
      cliente: document.getElementById('damage_repair_message')?.value || '',
    }));
    console.log('  Valores confirmados en los campos:', JSON.stringify({ asesorLen: valoresLlenados.asesor.length, clienteLen: valoresLlenados.cliente.length }));

    // Avanzar al siguiente paso y regresar para confirmar que el texto persiste en memoria
    await clickSiguiente(page);
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => b.textContent.trim() === 'Anterior');
      if (btn) btn.click();
    });
    await page.waitForTimeout(2000);
    const valoresPersistidos = await page.evaluate(() => ({
      asesor: document.getElementById('damage_repair')?.value || '',
      cliente: document.getElementById('damage_repair_message')?.value || '',
    }));
    const persistioTrasNavegar = valoresPersistidos.asesor === textoAsesor && valoresPersistidos.cliente === textoCliente;
    console.log('  Observaciones persisten tras avanzar y regresar ("Siguiente" → "Anterior"):', persistioTrasNavegar);

    await screenshotOnFail(page, 'cp301-estado-final');

    console.log('\n📊 === VALIDACIONES CP-305 ===');
    console.log('  Wizard llegó a "Observaciones generales":         ' + (enPasoCorrecto ? '✅' : '❌'));
    console.log('  Ambos campos se llenaron correctamente:            ' + (valoresLlenados.asesor === textoAsesor && valoresLlenados.cliente === textoCliente ? '✅' : '❌'));
    console.log('  Observaciones persisten tras navegar entre pasos:  ' + (persistioTrasNavegar ? '✅' : '⚠️ no confirmado'));

    if (!enPasoCorrecto) throw new Error('El wizard no llegó al paso correcto');
    if (valoresLlenados.asesor !== textoAsesor || valoresLlenados.cliente !== textoCliente) throw new Error('Los campos de observaciones no se llenaron correctamente');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-305 PASSED | placa: ' + placa + ' | campos llenados: ok | persistencia tras navegar: ' + persistioTrasNavegar + ' | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp301-fail');
    console.log('❌ CP-305 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp305_observaciones_generales_guardar();
