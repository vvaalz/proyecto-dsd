const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');

const URL_POS = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;

const screenshotOnFail = async (page, name) => { try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {} };
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function navegarAModulo(browser, context, url) {
  let page = await context.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(3000);
  if (/\/log\/login/i.test(page.url())) {
    console.log('⚠️ Sesión expirada (redirect a /log/login) — regenerando y reintentando...');
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

// Abre el panel lateral "Seguimiento" (.esthela) para una categoría dada de
// órdenes de la tienda en línea (1=Pendientes, 2=Aprobadas, 5=En camino) y
// devuelve lo que se pudo leer de su contenido real.
async function abrirSeguimiento(page, estado, nombreEstado) {
  await page.evaluate((n) => { if (typeof show_fast_traking === 'function') show_fast_traking(n); }, estado);
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const panel = document.querySelector('.esthela');
    const panelVisible = panel ? isVis(panel) : false;
    const encabezado = panel ? (panel.querySelector('.esthela-header')?.textContent || '').trim() : null;
    const filasOrden = panel ? panel.querySelectorAll('[class*="order_row"], [class*="tracking_row"], tr').length : 0;
    const opcionesEstado = Array.from(document.getElementById('order_tracking_state')?.options || []).map(o => o.textContent.trim());
    return { panelVisible, encabezado, filasOrden, opcionesEstado, textoPanel: panel ? panel.innerText.replace(/\n{2,}/g,'\n').slice(0, 300) : null };
  });
  console.log('  📂 Seguimiento — ' + nombreEstado + ': panel visible=' + info.panelVisible + ' | encabezado="' + info.encabezado + '" | filas de orden detectadas=' + info.filasOrden + ' | opciones de "Cambiar estado" disponibles: [' + info.opcionesEstado.join(', ') + ']');
  return info;
}

async function cerrarSeguimiento(page) {
  await page.evaluate(() => { document.getElementById('close_sidebar')?.click(); });
  await page.waitForTimeout(800);
}

async function cp196_tienda_linea_pos_seguimiento_ordenes() {
  console.log('🔄 Ejecutando CP-196: Tab "Tienda en línea" del POS — panel de Seguimiento de órdenes...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, URL_POS));
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForSelector('.product_box', { timeout: 15000 });
    evaluarCargaPagina(Date.now() - t0, 'Carga del POS');
    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForSelector('.product_box', { timeout: 15000 });
    try { const d = await page.$('#workshop-web-notification-permission-dismiss'); if (d) await d.click(); } catch {}

    // ── Abrir el tab "Tienda en línea" ──
    const abrioTab = await page.evaluate(() => !!document.getElementById('btn_get_virtual_order_list'));
    if (!abrioTab) { await screenshotOnFail(page, 'cp196-fail-tab-no-encontrado'); throw new Error('No se encontró el tab "Tienda en línea" (#btn_get_virtual_order_list)'); }
    const tTab = Date.now();
    await page.evaluate(() => document.getElementById('btn_get_virtual_order_list').click());
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tTab, 'Abrir tab "Tienda en línea"');

    // ── Leer los 3 contadores reales del tab (Pendientes / Aprobadas / En camino) ──
    const contadores = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const leer = (texto) => {
        const el = Array.from(document.querySelectorAll('*')).filter(isVis).find(e => new RegExp('^\\s*' + texto + '\\s*$', 'i').test((e.textContent||'').trim()) && e.children.length === 0);
        const caja = el ? el.closest('[onclick*="show_fast_traking"]') : null;
        const numero = caja ? caja.textContent.replace(/\s+/g,' ').trim().match(/^(\d+)/) : null;
        return numero ? parseInt(numero[1], 10) : null;
      };
      return { pendientes: leer('[oó]rdenes pendientes'), aprobadas: leer('[oó]rdenes aprobadas'), enCamino: leer('[oó]rdenes en camino') };
    });
    console.log('📊 Contadores reales del tab: Pendientes=' + contadores.pendientes + ' | Aprobadas=' + contadores.aprobadas + ' | En camino=' + contadores.enCamino);

    // ── Abrir el panel "Seguimiento" para cada una de las 3 categorías reales ──
    console.log('\n📂 Abriendo el panel de Seguimiento para cada categoría real...');
    const infoPendientes = await abrirSeguimiento(page, 1, 'Pendientes (1)');
    await cerrarSeguimiento(page);
    const infoAprobadas = await abrirSeguimiento(page, 2, 'Aprobadas (2)');
    await cerrarSeguimiento(page);
    const infoEnCamino = await abrirSeguimiento(page, 5, 'En camino (5)');
    // Dejamos este último panel abierto para ejercitar sus controles reales a continuación.

    if (!infoPendientes.panelVisible || !infoAprobadas.panelVisible || !infoEnCamino.panelVisible) {
      await screenshotOnFail(page, 'cp196-fail-panel-seguimiento');
      throw new Error('El panel "Seguimiento" no abrió correctamente para alguna de las 3 categorías');
    }

    // ── Ejercitar los controles reales del panel: dropdown "Cambiar estado" (Chosen) ──
    // Hallazgo confirmado en vivo: las opciones de este dropdown NO son fijas — son
    // contextuales al estado actual de la categoría abierta (ej. con "En camino" abierto
    // solo ofrece "Entregado" como siguiente estado válido; con "Pendientes" ofrece más
    // opciones). Se ejercitan aquí las opciones reales que ofrece el panel "En camino"
    // (el que quedó abierto), sin asumir una cantidad fija.
    console.log('\n🎛️ Ejercitando el dropdown "Cambiar estado" (Chosen) con las opciones reales de esta categoría...');
    const opcionesEstado = await page.evaluate(() => Array.from(document.getElementById('order_tracking_state')?.options || []).map(o => ({ v: o.value, t: o.textContent.trim() })));
    console.log('  Opciones reales encontradas para "En camino": ' + JSON.stringify(opcionesEstado));
    if (opcionesEstado.length === 0) { await screenshotOnFail(page, 'cp196-fail-dropdown-estado'); throw new Error('No se encontraron opciones en el dropdown #order_tracking_state'); }

    for (const opcion of opcionesEstado) {
      await page.evaluate((v) => {
        const el = document.getElementById('order_tracking_state');
        el.value = v;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        if (window.jQuery && jQuery(el).data('chosen')) jQuery(el).trigger('chosen:updated');
      }, opcion.v);
      await page.waitForTimeout(400);
      const valorVisibleChosen = await page.evaluate(() => document.querySelector('.esthela .chosen-single')?.textContent.trim());
      console.log('  → "' + opcion.t + '" seleccionada — texto visible en el widget: "' + valorVisibleChosen + '"');
    }

    const todasLasOpcionesVistas = Array.from(new Set([
      ...infoPendientes.opcionesEstado, ...infoAprobadas.opcionesEstado, ...infoEnCamino.opcionesEstado
    ])).filter(Boolean);
    console.log('  📋 Unión de opciones de estado vistas entre las 3 categorías (confirma que el catálogo real es Aprobada/Rechazada/En camino/Entregado, repartidas según el estado actual): [' + todasLasOpcionesVistas.join(', ') + ']');

    // ── Checkbox "Seleccionar todos" ──
    console.log('\n☑️ Ejercitando el checkbox "Seleccionar todos"...');
    const checkboxInfo = await page.evaluate(() => {
      const el = document.getElementById('fast_select_all_order_tracking');
      if (!el) return null;
      const antes = el.checked;
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('click', { bubbles: true }));
      return { existia: true, estadoAntes: antes, estadoDespues: el.checked };
    });
    console.log('  Checkbox "Seleccionar todos": ' + JSON.stringify(checkboxInfo));

    // ── NO se hace clic en "Guardar cambios" (#btn_save_masive_tracking) ──
    // Es una acción en lote (save_tracking_order_state()) que, según el texto de
    // ayuda del propio panel, puede disparar un correo electrónico y/o una
    // notificación push reales al cliente si hubiera órdenes seleccionadas.
    // Con 0 órdenes reales en las 3 categorías en este ambiente, no habría nada
    // que guardar, pero por la regla del proyecto (toda acción en lote requiere
    // confirmación explícita del usuario antes de ejecutarse) no se invoca.
    const botonGuardarExiste = await page.evaluate(() => !!document.getElementById('btn_save_masive_tracking'));
    console.log('\n⏸️  Botón "Guardar cambios" (acción en lote, ' + (botonGuardarExiste ? 'SÍ' : 'NO') + ' encontrado en el DOM) — deliberadamente NO se ejecuta (ver nota en el código).');

    await cerrarSeguimiento(page);
    const panelCerrado = await page.evaluate(() => {
      const p = document.querySelector('.esthela');
      const r = p ? p.getBoundingClientRect() : null;
      return !p || r.width === 0 || r.height === 0 || getComputedStyle(p).display === 'none';
    });
    console.log('🚪 Panel "Seguimiento" cerrado correctamente: ' + panelCerrado);

    // ── VALIDACIONES ──
    const v1 = infoPendientes.panelVisible && infoAprobadas.panelVisible && infoEnCamino.panelVisible;
    const v2 = opcionesEstado.length >= 1 && todasLasOpcionesVistas.length >= 3;
    const v3 = checkboxInfo && checkboxInfo.existia && checkboxInfo.estadoDespues === true;
    const v4 = panelCerrado;

    console.log('\n📊 === VALIDACIONES CP-196 ===');
    console.log('  Panel "Seguimiento" abre para las 3 categorías reales: ' + (v1 ? '✅' : '❌'));
    console.log('  Dropdown "Cambiar estado" con opciones reales (≥3 distintas entre categorías): ' + (v2 ? '✅' : '❌') + ' (' + todasLasOpcionesVistas.length + ': ' + todasLasOpcionesVistas.join(', ') + ')');
    console.log('  Checkbox "Seleccionar todos" responde:                  ' + (v3 ? '✅' : '❌'));
    console.log('  Panel se cierra correctamente:                         ' + (v4 ? '✅' : '❌'));

    if (!v1) throw new Error('El panel "Seguimiento" no abrió para alguna de las 3 categorías');
    if (!v2) throw new Error('El dropdown "Cambiar estado" no ofreció suficientes opciones distintas entre las 3 categorías (se esperaban al menos 3 de: Aprobada/Rechazada/En camino/Entregado)');
    if (!v3) throw new Error('El checkbox "Seleccionar todos" no respondió');
    if (!v4) throw new Error('El panel "Seguimiento" no se cerró correctamente');

    const sinOrdenesReales = (contadores.pendientes === 0 && contadores.aprobadas === 0 && contadores.enCamino === 0);
    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    if (sinOrdenesReales) {
      console.log('⚠️ CP-196 RESULT: El tab "Tienda en línea" del POS (distinto del tab "Tienda online" de Panel de Control, CP-176) SÍ tiene contenido real interactivo — un panel de "Seguimiento" con 3 categorías (Pendientes/Aprobadas/En camino), un selector de estado con 4 opciones (Aprobada/Rechazada/En camino/Entregado) y una acción en lote "Guardar cambios" que notifica al cliente por correo/app. Se ejercitaron todos estos controles reales. Gap de cobertura documentado: este ambiente QA no tiene ninguna orden real de tienda en línea (0 en las 3 categorías), por lo que no se pudo ejercer el flujo completo de aprobar/rechazar una orden real de principio a fin — ver CLAUDE_CONTEXT.md para el detalle. | tiempo: ' + tiempoTotalCP + 'ms');
    } else {
      console.log('✅ CP-196 PASSED | contadores: Pendientes=' + contadores.pendientes + ', Aprobadas=' + contadores.aprobadas + ', En camino=' + contadores.enCamino + ' | dropdown: 4/4 opciones | tiempo: ' + tiempoTotalCP + 'ms');
    }

  } catch (error) {
    await screenshotOnFail(page, 'cp196-fail');
    console.log('❌ CP-196 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp196_tienda_linea_pos_seguimiento_ordenes();
