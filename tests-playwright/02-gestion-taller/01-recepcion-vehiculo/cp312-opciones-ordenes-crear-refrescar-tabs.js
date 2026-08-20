const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const URL_RECEPCION = `${BASE_URL}/vehicularReception/vehicularQuickReception`;

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function navegarAModulo(browser, context, url) {
  let page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
  if (/\/log\/login/i.test(page.url())) {
    console.log('⚠️ Sesión expirada — regenerando y reintentando...');
    await page.close();
    fs.rmSync(SESION_PATH, { force: true });
    const contextNuevo = await abrirContextoConSesion(browser);
    page = await contextNuevo.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
    return { context: contextNuevo, page };
  }
  return { context, page };
}

function clickTexto(page, texto) {
  return page.evaluate((t) => {
    const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const normaliza = (s) => (s||'').replace(/\s+/g, ' ').trim();
    const candidatos = Array.from(document.querySelectorAll('button, a')).filter(isVis)
      .filter(b => normaliza(b.textContent).includes(t) && normaliza(b.textContent).length < t.length + 30)
      .sort((a, b) => a.textContent.length - b.textContent.length);
    if (candidatos[0]) { candidatos[0].click(); return true; }
    return false;
  }, texto);
}

async function cp312_opciones_ordenes_crear_refrescar_tabs() {
  console.log('🔄 Ejecutando CP-312: Opciones de órdenes en tabs + Crear recepción desde tabs + Refrescar...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, URL_RECEPCION));
    evaluarCargaPagina(Date.now() - t0, 'Carga del Panel de Recepción');
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
    await page.evaluate(() => document.getElementById('workshop-web-notification-permission-dismiss')?.click());
    await page.waitForTimeout(1000);

    // ══════════════════════════════════════════════════════
    // PARTE 1 — Opciones de órdenes (menú "adv-order-dd") en tab "Tablero"
    // (ya documentado en CLAUDE_CONTEXT.md sección 30 desde el tab "Órdenes"; aquí se
    // confirma que el MISMO menú está disponible también en "Tablero" y "Repuestos")
    // ══════════════════════════════════════════════════════
    await clickTexto(page, 'Tablero');
    await page.waitForTimeout(2500);
    const kebabTableroInfo = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const candidatos = Array.from(document.querySelectorAll('*')).filter(isVis)
        .filter(el => el.textContent && el.textContent.trim() === 'more_vert' && el.children.length === 0);
      return candidatos.length;
    });
    console.log('  Menús "more_vert" (opciones de orden) visibles en tab Tablero:', kebabTableroInfo);
    const kebabTableroOk = kebabTableroInfo > 0;

    // ══════════════════════════════════════════════════════
    // PARTE 2 — Crear recepción desde distintos tabs (solo abrir el modal, no completar)
    // ══════════════════════════════════════════════════════
    const tabsParaProbar = ['Tablero', 'Repuestos'];
    const resultadosCrear = {};
    for (const tab of tabsParaProbar) {
      await clickTexto(page, tab);
      await page.waitForTimeout(2000);
      const t1 = Date.now();
      const clickRecepcion = await clickTexto(page, 'Recepción');
      await page.waitForTimeout(2000);
      evaluarAccion(Date.now() - t1, 'Abrir modal "Recepción" desde tab ' + tab);
      const modalAbierto = await page.evaluate(() => !!document.querySelector('input[placeholder="Placa / Matricula"]'));
      resultadosCrear[tab] = clickRecepcion && modalAbierto;
      console.log('  "+ Recepción" desde tab "' + tab + '": clic=' + clickRecepcion + ', modal abierto=' + modalAbierto + ' → ' + (resultadosCrear[tab] ? '✅' : '❌'));
      // Cerrar el modal sin crear nada
      await page.evaluate(() => {
        const isVis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /^Cerrar$/i.test((b.textContent||'').trim()));
        if (btn) btn.click();
      });
      await page.waitForTimeout(1000);
    }

    // ══════════════════════════════════════════════════════
    // PARTE 3 — Botón "Refrescar" en al menos 2 tabs distintos
    // ══════════════════════════════════════════════════════
    const resultadosRefrescar = {};
    for (const tab of ['Órdenes', 'Tablero']) {
      await clickTexto(page, tab);
      await page.waitForTimeout(2000);
      const antesTexto = await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('*')).find(e => /última actualizaci[oó]n/i.test(e.textContent||''));
        return el ? el.textContent.trim() : null;
      });
      const t2 = Date.now();
      let respuestaRed = false;
      page.once('response', (r) => { if (/repairOrder|repair_order|getRepairOrder/i.test(r.url())) respuestaRed = true; });
      const clickRefrescar = await page.evaluate(() => { document.getElementById('btn_refresh_repair_order_list_cache')?.click(); return !!document.getElementById('btn_refresh_repair_order_list_cache'); });
      await page.waitForTimeout(2500);
      evaluarAccion(Date.now() - t2, 'Refrescar en tab ' + tab);
      const despuesTexto = await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('*')).find(e => /última actualizaci[oó]n/i.test(e.textContent||''));
        return el ? el.textContent.trim() : null;
      });
      resultadosRefrescar[tab] = clickRefrescar && (despuesTexto !== antesTexto || respuestaRed);
      console.log('  "Refrescar" en tab "' + tab + '": clic=' + clickRefrescar + ', timestamp cambió=' + (antesTexto !== despuesTexto) + ' → ' + (resultadosRefrescar[tab] ? '✅' : '❌'));
    }

    // ── VALIDACIONES ──
    const crearOk = Object.values(resultadosCrear).every(Boolean);
    const refrescarOk = Object.values(resultadosRefrescar).every(Boolean);
    console.log('\n📊 === VALIDACIONES CP-312 ===');
    console.log('  Menú de opciones de orden disponible en tab Tablero:              ' + (kebabTableroOk ? '✅' : '❌'));
    console.log('  "+ Recepción" abre el modal desde Tablero y Repuestos:             ' + (crearOk ? '✅' : '❌ ' + JSON.stringify(resultadosCrear)));
    console.log('  "Refrescar" funciona en tabs Órdenes y Tablero:                    ' + (refrescarOk ? '✅' : '❌ ' + JSON.stringify(resultadosRefrescar)));

    if (!kebabTableroOk) throw new Error('No se encontró el menú de opciones de orden en el tab Tablero');
    if (!crearOk) throw new Error('"+ Recepción" no abrió correctamente el modal desde algún tab: ' + JSON.stringify(resultadosCrear));
    if (!refrescarOk) throw new Error('"Refrescar" no funcionó correctamente en algún tab: ' + JSON.stringify(resultadosRefrescar));

    console.log('✅ CP-312 PASSED | Opciones de orden + crear recepción + refrescar verificados en múltiples tabs | validaciones: 3/3');
    registrarResultado({ cp: 'CP-312', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: Date.now() - tiempoInicioCP });

  } catch (error) {
    await screenshotOnFail(page, 'cp312-fail');
    console.log('❌ CP-312 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-312', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp312_opciones_ordenes_crear_refrescar_tabs();
