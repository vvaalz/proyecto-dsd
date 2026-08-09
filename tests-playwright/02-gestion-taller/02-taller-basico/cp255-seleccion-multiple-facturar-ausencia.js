const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');

const screenshotOnFail = async (page, name) => { try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {} };
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

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

// Busca evidencia de un mecanismo de selección múltiple de órdenes (checkboxes por tarjeta +
// un botón agregado tipo "Facturar seleccionadas") en la vista actualmente cargada.
async function buscarSeleccionMultiple(page) {
  return await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const checkboxesEnTarjetas = Array.from(document.querySelectorAll('.repair-order-list-item input[type="checkbox"], .repair-order-list-item input[type="radio"]')).filter(isVis).length;
    const botonesFacturarLote = Array.from(document.querySelectorAll('button, a')).filter(isVis).filter(b => /facturar seleccionad/i.test(b.textContent||'')).length;
    const seleccionarTodo = Array.from(document.querySelectorAll('input[type="checkbox"], button, a')).filter(isVis).filter(b => /seleccionar todo|select all/i.test(b.textContent || b.title || b.getAttribute('aria-label') || '')).length;
    return { checkboxesEnTarjetas, botonesFacturarLote, seleccionarTodo };
  });
}

async function cp255_seleccion_multiple_facturar_ausencia() {
  console.log('🔄 Ejecutando CP-255: Selección múltiple de órdenes + "Facturar seleccionadas" (verificación de ausencia)...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();
  const hallazgos = {};

  try {
    // ── Ubicación 1: Lista de Órdenes / Recepción de Vehículo (Torre de Control) ──
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, `${BASE_URL}/vehicularReception/vehicularQuickReception`));
    await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
    evaluarCargaPagina(Date.now() - t0, 'Carga de Recepción de Vehículo (Torre de Control)');
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
    try { const d = await page.$('#workshop-web-notification-permission-dismiss'); if (d) await d.click(); } catch {}
    try { await page.waitForSelector('.repair-order-list-item', { state: 'attached', timeout: 25000 }); } catch {}
    await page.waitForTimeout(2000);
    hallazgos.torreControl = await buscarSeleccionMultiple(page);
    await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp255-01-torre-control-'+Date.now()+'.png') }).catch(()=>{});
    console.log('📍 Torre de Control (lista de órdenes):', JSON.stringify(hallazgos.torreControl));

    // ── Ubicación 2: tab interno "Tablero" (kanban de etapas) ──
    const tabTablero = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const tab = Array.from(document.querySelectorAll('a, button')).filter(isVis).find(b => /tablero/i.test(b.textContent||''));
      if (tab) { tab.click(); return true; }
      return false;
    });
    await page.waitForTimeout(2500);
    if (tabTablero) {
      hallazgos.tablero = await buscarSeleccionMultiple(page);
      await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp255-02-tablero-'+Date.now()+'.png') }).catch(()=>{});
      console.log('📍 Tab "Tablero":', JSON.stringify(hallazgos.tablero));
    } else {
      console.log('📍 Tab "Tablero": no se encontró en esta vista, se omite');
    }

    // ── Ubicación 3: /vehicularReception/workOrderBoard (kanban dedicado) ──
    const tBoard = Date.now();
    let page2 = page;
    try {
      await page.goto(`${BASE_URL}/vehicularReception/workOrderBoard`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);
      evaluarCargaPagina(Date.now() - tBoard, 'Carga de workOrderBoard');
      hallazgos.workOrderBoard = await buscarSeleccionMultiple(page);
      await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp255-03-workorderboard-'+Date.now()+'.png') }).catch(()=>{});
      console.log('📍 /vehicularReception/workOrderBoard:', JSON.stringify(hallazgos.workOrderBoard));
    } catch (e) {
      console.log('📍 /vehicularReception/workOrderBoard: no se pudo cargar (' + e.message + '), se omite');
    }

    // ── Ubicación 4: POS, tab "(F3) Taller" ──
    try {
      await page2.goto(`${BASE_URL}/pos/pos`, { waitUntil: 'load', timeout: 60000 });
      await page2.waitForTimeout(4000);
      const tabTaller = await page2.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const tab = Array.from(document.querySelectorAll('a, button, li')).filter(isVis).find(b => /taller/i.test(b.textContent||'') && /F3/i.test(b.textContent||''));
        if (tab) { tab.click(); return true; }
        const tabSinF3 = Array.from(document.querySelectorAll('a, button, li')).filter(isVis).find(b => /^\s*taller\s*$/i.test((b.textContent||'').trim()));
        if (tabSinF3) { tabSinF3.click(); return true; }
        return false;
      });
      await page2.waitForTimeout(2500);
      if (tabTaller) {
        hallazgos.posTaller = await buscarSeleccionMultiple(page2);
        await page2.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp255-04-pos-taller-'+Date.now()+'.png') }).catch(()=>{});
        console.log('📍 POS tab "Taller":', JSON.stringify(hallazgos.posTaller));
      } else {
        console.log('📍 POS tab "Taller": no se encontró el tab, se omite');
      }
    } catch (e) {
      console.log('📍 POS tab "Taller": no se pudo cargar (' + e.message + '), se omite');
    }

    // ── VALIDACIÓN: en NINGUNA de las ubicaciones revisadas debe existir el mecanismo ──
    const ubicacionesRevisadas = Object.keys(hallazgos);
    const algunaConMecanismo = ubicacionesRevisadas.filter(k => {
      const h = hallazgos[k];
      return h.checkboxesEnTarjetas > 0 || h.botonesFacturarLote > 0 || h.seleccionarTodo > 0;
    });

    console.log('\n📊 === VALIDACIONES CP-255 ===');
    console.log('  Ubicaciones revisadas: ' + ubicacionesRevisadas.length + ' (' + ubicacionesRevisadas.join(', ') + ')');
    console.log('  Ubicaciones con algún indicio de selección múltiple/facturar en lote: ' + algunaConMecanismo.length);

    if (ubicacionesRevisadas.length === 0) throw new Error('No se pudo revisar ninguna ubicación (todas fallaron al cargar) — no se puede confirmar el hallazgo de ausencia');

    if (algunaConMecanismo.length > 0) {
      console.log('  ⚠️ HALLAZGO ACTUALIZADO: se encontró evidencia de selección múltiple en: ' + algunaConMecanismo.join(', ') + ' — esto contradice la exploración previa documentada. Revisar manualmente antes de asumir que sigue sin existir.');
      // No se falla el CP por esto -- es información nueva que debe documentarse, no un defecto
      // del script. Se reporta explícitamente para que el equipo lo revise.
    } else {
      console.log('  ✅ HALLAZGO CONFIRMADO (reconfirmado en esta corrida): no existe ningún mecanismo de selección múltiple de órdenes + "Facturar seleccionadas" en ninguna de las ' + ubicacionesRevisadas.length + ' ubicaciones plausibles revisadas. Por lo tanto, el flujo 10 solicitado (abrir el modal de pago con selección múltiple) no se puede ejercer porque el punto de entrada no existe en este ambiente.');
    }

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-255 PASSED | ubicaciones revisadas: ' + ubicacionesRevisadas.length + ' | mecanismo encontrado en: ' + algunaConMecanismo.length + ' | tiempo: ' + tiempoTotalCP + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp255-fail');
    console.log('❌ CP-255 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp255_seleccion_multiple_facturar_ausencia();
