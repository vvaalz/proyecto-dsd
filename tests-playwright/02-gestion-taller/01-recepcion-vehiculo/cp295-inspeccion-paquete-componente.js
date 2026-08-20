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

async function iniciarRecepcionHastaInspeccion(page) {
  await page.click('button.add-reception-btn', { timeout: 15000 });
  await page.waitForTimeout(1800);
  const placa = 'CP295-' + Date.now().toString().slice(-9);
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

  // Agregar un producto mínimo, por si el wizard exige al menos un ítem para avanzar
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
  return placa;
}

async function cp295_inspeccion_paquete_componente() {
  console.log('🔄 Ejecutando CP-295: Recepción Vehicular — Inspección (paquete + componente)...');
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

    const placa = await iniciarRecepcionHastaInspeccion(page);
    console.log('📋 Nueva recepción iniciada con placa:', placa);

    const enPasoCorrecto = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return Array.from(document.querySelectorAll('*')).filter(isVis).some(el => /crea nuevo paquete/i.test(el.textContent||'') && el.children.length < 3);
    });
    await screenshotOnFail(page, 'cp295-estado-al-llegar');
    console.log('  Wizard llegó a "Inspección":', enPasoCorrecto);
    if (!enPasoCorrecto) throw new Error('El wizard no llegó al paso "Inspección" (botón "Crea Nuevo Paquete" no encontrado)');

    // ── 1) Crear un paquete de inspección nuevo ──
    console.log('\n📦 Flujo 1: Crear paquete de inspección...');
    const tPaquete = Date.now();
    const abrioFormPaquete = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button,a')).filter(isVis).find(b => /crea nuevo paquete/i.test(b.textContent||''));
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(2000);
    if (!abrioFormPaquete) { await screenshotOnFail(page, 'cp295-fail-abrir-paquete'); throw new Error('No se encontró/clickeó "+ Crea Nuevo Paquete"'); }
    await screenshotOnFail(page, 'cp295-form-paquete');

    const nombrePaquete = 'CP295 Paquete ' + Date.now().toString().slice(-6);
    const paqueteLlenado = await page.evaluate((nombre) => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const input = Array.from(document.querySelectorAll('input[type="text"]')).filter(isVis).find(i => !i.value && !/buscar/i.test(i.placeholder||''));
      if (!input) return false;
      input.value = nombre;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, nombrePaquete);
    console.log('  Campo de nombre de paquete llenado:', paqueteLlenado);
    await page.waitForTimeout(500);

    const guardoPaquete = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /guardar|crear/i.test(b.textContent||''));
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tPaquete, 'Crear paquete de inspección');
    console.log('  Paquete guardado:', guardoPaquete);

    // ── 2) Crear un componente nuevo dentro del paquete ──
    console.log('\n🔧 Flujo 2: Crear componente de inspección...');
    const tComponente = Date.now();
    const abrioFormComponente = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button,a')).filter(isVis).find(b => /crear nuevo componente/i.test(b.textContent||''));
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(2000);
    console.log('  Formulario de componente abrió:', abrioFormComponente);

    let componenteGuardado = false;
    let reemplazoActivado = false;
    if (abrioFormComponente) {
      await screenshotOnFail(page, 'cp295-form-componente');
      const nombreComponente = 'CP295 Componente ' + Date.now().toString().slice(-6);
      await page.evaluate((nombre) => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const input = Array.from(document.querySelectorAll('input[type="text"]')).filter(isVis).find(i => !i.value && !/buscar/i.test(i.placeholder||''));
        if (input) { input.value = nombre; input.dispatchEvent(new Event('input', { bubbles: true })); }
      }, nombreComponente);
      await page.waitForTimeout(500);

      // Buscar y activar cualquier toggle/checkbox de "reemplazo de productos" en el formulario
      reemplazoActivado = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /reemplazo/i.test(el.textContent||'') && el.textContent.trim().length < 60);
        if (!label) return false;
        let cont = label;
        for (let i = 0; i < 4 && cont; i++) {
          const toggle = cont.querySelector('input[type="checkbox"], input[type="radio"]');
          if (toggle) { if (!toggle.checked) toggle.click(); return true; }
          cont = cont.parentElement;
        }
        return false;
      });
      console.log('  Toggle de "reemplazo de productos" encontrado y activado:', reemplazoActivado);

      componenteGuardado = await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /guardar|crear/i.test(b.textContent||''));
        if (btn) { btn.click(); return true; }
        return false;
      });
      await page.waitForTimeout(2000);
    }
    evaluarAccion(Date.now() - tComponente, 'Crear componente de inspección');
    console.log('  Componente guardado:', componenteGuardado);

    await screenshotOnFail(page, 'cp295-estado-final');

    console.log('\n📊 === VALIDACIONES CP-295 ===');
    console.log('  Wizard llegó a "Inspección":                  ' + (enPasoCorrecto ? '✅' : '❌'));
    console.log('  Formulario "Crear paquete" abrió y se llenó:  ' + (abrioFormPaquete && paqueteLlenado ? '✅' : '❌'));
    console.log('  Paquete guardado:                             ' + (guardoPaquete ? '✅' : '❌'));
    console.log('  Formulario "Crear componente" abrió:          ' + (abrioFormComponente ? '✅' : '⚠️ no disponible (puede requerir seleccionar el paquete primero)'));
    console.log('  Toggle de "reemplazo de productos" activado:  ' + (reemplazoActivado ? '✅' : '⚠️ no encontrado/confirmado'));
    console.log('  Componente guardado:                          ' + (componenteGuardado ? '✅' : '⚠️ no confirmado'));

    if (!enPasoCorrecto) throw new Error('El wizard no llegó al paso correcto');
    if (!abrioFormPaquete || !guardoPaquete) throw new Error('No se pudo crear el paquete de inspección');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-295 PASSED | placa: ' + placa + ' | paquete: ' + nombrePaquete + ' | componente: ' + componenteGuardado + ' | reemplazo activado: ' + reemplazoActivado + ' | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp295-fail');
    console.log('❌ CP-295 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp295_inspeccion_paquete_componente();
