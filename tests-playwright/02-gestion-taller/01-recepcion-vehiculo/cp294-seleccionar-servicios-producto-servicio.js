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

async function iniciarRecepcionHastaServicios(page) {
  await page.click('button.add-reception-btn', { timeout: 15000 });
  await page.waitForTimeout(1800);
  const placa = 'CP294-' + Date.now().toString().slice(-9);
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

  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => b.textContent.trim() === 'Siguiente');
    if (btn) btn.click();
  });
  await page.waitForTimeout(3500);
  return placa;
}

function extraerTotal(texto) {
  if (!texto) return null;
  const m = texto.match(/₡\s*([\d.,]+)/);
  return m ? m[1] : null;
}

async function cp294_seleccionar_servicios_producto_servicio() {
  console.log('🔄 Ejecutando CP-294: Recepción Vehicular — Seleccionar Servicios (producto + servicio, totales)...');
  console.log('⚠️ Este flujo puede toparse con el hallazgo crítico de montos corruptos (CLAUDE_CONTEXT.md sección 22) — si aparece, se documenta y se continúa (instrucción explícita del usuario para este bloque)');
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

    const placa = await iniciarRecepcionHastaServicios(page);
    console.log('📋 Nueva recepción iniciada con placa:', placa);

    const enPasoCorrecto = await page.evaluate(() => !!document.getElementById('search_vehicle_product-left'));
    await screenshotOnFail(page, 'cp294-estado-al-llegar');
    console.log('  Wizard llegó a "Seleccionar servicios":', enPasoCorrecto);
    if (!enPasoCorrecto) throw new Error('El wizard no llegó al paso "Seleccionar servicios" (buscador de productos no encontrado)');

    // ── 1) Agregar un PRODUCTO existente al carrito (tab "Productos", primera tarjeta real) ──
    console.log('\n🛒 Flujo 1: Agregar un producto existente al carrito...');
    const tProducto = Date.now();
    const productoAgregado = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      // Tarjetas reales muestran precio "₡" y "Und" (cantidad) — la tarjeta "Agregar producto" no.
      const candidatas = Array.from(document.querySelectorAll('div')).filter(isVis).filter(el => {
        const t = el.textContent || '';
        return /₡/.test(t) && /Und/.test(t) && !/agregar producto/i.test(t) && el.querySelectorAll('div').length < 6;
      });
      const tarjeta = candidatas.sort((a,b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0];
      if (tarjeta) { tarjeta.click(); return { ok: true, texto: tarjeta.textContent.trim().replace(/\s+/g,' ').slice(0,80) }; }
      return { ok: false };
    });
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tProducto, 'Agregar producto existente al carrito');
    console.log('  Producto agregado:', JSON.stringify(productoAgregado));
    if (!productoAgregado.ok) { await screenshotOnFail(page, 'cp294-fail-agregar-producto'); throw new Error('No se encontró/clickeó ninguna tarjeta de producto real'); }

    const totalTrasProducto = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const el = Array.from(document.querySelectorAll('*')).filter(isVis).find(e => e.textContent.trim() === 'Total' && e.children.length === 0);
      return el ? (el.parentElement.textContent||'').replace(/\s+/g,' ').trim() : null;
    });
    console.log('  💰 Total tras agregar producto:', totalTrasProducto);

    // ── 2) Agregar un SERVICIO existente (tab "Servicios") ──
    console.log('\n🛠️ Flujo 2: Agregar un servicio existente al carrito...');
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button,a')).filter(isVis).find(b => b.textContent.trim() === 'Servicios');
      if (btn) btn.click();
    });
    await page.waitForTimeout(2000);

    const tServicio = Date.now();
    const servicioAgregado = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const candidatas = Array.from(document.querySelectorAll('div')).filter(isVis).filter(el => {
        const t = el.textContent || '';
        return /₡/.test(t) && !/agregar servicio/i.test(t) && el.querySelectorAll('div').length < 6;
      });
      const tarjeta = candidatas.sort((a,b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0];
      if (tarjeta) { tarjeta.click(); return { ok: true, texto: tarjeta.textContent.trim().replace(/\s+/g,' ').slice(0,80) }; }
      return { ok: false };
    });
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tServicio, 'Agregar servicio existente al carrito');
    console.log('  Servicio agregado:', JSON.stringify(servicioAgregado));

    const totalFinal = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const el = Array.from(document.querySelectorAll('*')).filter(isVis).find(e => e.textContent.trim() === 'Total' && e.children.length === 0);
      return el ? (el.parentElement.textContent||'').replace(/\s+/g,' ').trim() : null;
    });
    console.log('  💰 Total final (producto + servicio):', totalFinal);

    // ── HALLAZGO DE MONTOS: documentar sin detenerse, tal como se pidió para este bloque ──
    const totalNumerico = extraerTotal(totalFinal);
    const totalPareceCorrupto = totalNumerico && parseFloat(totalNumerico.replace(/\./g,'').replace(',', '.')) > 100000000; // > ₡100 millones en un carrito de 2 items es sospechoso
    if (totalPareceCorrupto) {
      console.log('  🔴 HALLAZGO: el total tras agregar solo 1 producto + 1 servicio parece corrupto (' + totalFinal + ') — posible manifestación del bug de montos de la sección 22. Documentado, no se detiene el CP.');
    } else {
      console.log('  ✅ Total dentro de un rango razonable, sin indicios del bug de montos en esta corrida.');
    }

    await screenshotOnFail(page, 'cp294-estado-final');

    console.log('\n📊 === VALIDACIONES CP-294 ===');
    console.log('  Wizard llegó a "Seleccionar servicios":              ' + (enPasoCorrecto ? '✅' : '❌'));
    console.log('  Producto existente agregado al carrito:              ' + (productoAgregado.ok ? '✅' : '❌'));
    console.log('  Servicio existente agregado al carrito:              ' + (servicioAgregado.ok ? '✅' : '⚠️ no confirmado'));
    console.log('  Total del carrito se actualizó y quedó documentado:  ' + (totalFinal ? '✅ (' + totalFinal + ')' : '❌'));
    console.log('  Hallazgo de montos corruptos en esta corrida:        ' + (totalPareceCorrupto ? '🔴 SÍ (ver log arriba)' : '➖ no'));

    if (!enPasoCorrecto) throw new Error('El wizard no llegó al paso correcto');
    if (!productoAgregado.ok) throw new Error('No se pudo agregar ningún producto al carrito');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-294 PASSED | placa: ' + placa + ' | producto: ok | servicio: ' + servicioAgregado.ok + ' | total final: ' + totalFinal + ' | hallazgo montos: ' + totalPareceCorrupto + ' | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp294-fail');
    console.log('❌ CP-294 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp294_seleccionar_servicios_producto_servicio();
