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

// navegarAModulo: variante con waitUntil 'domcontentloaded' en vez de 'load'. Durante la
// exploración en vivo de este CP se observó que 'load' puede excederse (>180s) al regresar a
// este módulo tras salir de él (lentitud general del ambiente ya documentada en CLAUDE_CONTEXT.md
// sección 22) — 'domcontentloaded' + waitForSelector explícito resultó más confiable.
async function navegarAModulo(browser, context, url) {
  let page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForTimeout(3000);
  if (/\/log\/login/i.test(page.url())) {
    console.log('⚠️ Sesión expirada (redirect a /log/login) — regenerando y reintentando...');
    await page.close();
    fs.rmSync(SESION_PATH, { force: true });
    const contextNuevo = await abrirContextoConSesion(browser);
    page = await contextNuevo.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForTimeout(3000);
    if (/\/log\/login/i.test(page.url())) throw new Error('Sigue redirigiendo a /log/login tras regenerar la sesión');
    return { context: contextNuevo, page };
  }
  return { context, page };
}

async function dismissNotificationBanner(page) {
  try { const d = await page.$('#workshop-web-notification-permission-dismiss'); if (d) await d.click(); } catch {}
  await page.waitForTimeout(300);
}

async function abrirMenuKebab(page) {
  const abrio = await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
    const candidatos = Array.from(document.querySelectorAll('*')).filter(el => el.textContent && el.textContent.trim() === 'more_vert' && isVis(el));
    if (candidatos[0]) { candidatos[0].click(); return true; }
    return false;
  });
  await page.waitForTimeout(1000);
  return abrio;
}

async function cp300_reporte_ordenes_admin_whatsapp() {
  console.log('🔄 Ejecutando CP-300: Reporte de órdenes (menú kebab) + Admin. WhatsApp (catálogo de mensajes rápidos)...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();
  const shortcutUnico = 'cp300-' + Date.now();
  const mensajeOriginal = 'Mensaje de prueba automatizado CP-300';
  const mensajeEditado = mensajeOriginal + ' (editado)';

  try {
    // ── Carga del módulo ──
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, URL_RECEPCION));
    await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
    evaluarCargaPagina(Date.now() - t0, 'Carga de Recepción de Vehículo');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
    await dismissNotificationBanner(page);
    await page.waitForTimeout(1000);

    // ══════════════════════════════════════════════════════
    // PARTE 1 — "Reporte de órdenes"
    // ══════════════════════════════════════════════════════
    const kebab1Ok = await abrirMenuKebab(page);
    if (!kebab1Ok) throw new Error('No se encontró/abrió el menú "more_vert" (kebab)');

    const reporteInfo = await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a.dropdown-item')).find(e => /reporte de órdenes/i.test(e.textContent));
      return a ? { href: a.getAttribute('href'), target: a.getAttribute('target') } : null;
    });
    if (!reporteInfo) throw new Error('No se encontró el link "Reporte de órdenes" dentro del menú kebab');
    console.log('📋 Link "Reporte de órdenes":', JSON.stringify(reporteInfo));

    const tReporte = Date.now();
    // Confirmado en exploración en vivo: este link NO abre pestaña nueva (sin target="_blank"),
    // navega en la misma pestaña.
    await page.evaluate(() => {
      const a = Array.from(document.querySelectorAll('a.dropdown-item')).find(e => /reporte de órdenes/i.test(e.textContent));
      if (a) a.click();
    });
    await page.waitForURL('**/reports/order_report**', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    evaluarCargaPagina(Date.now() - tReporte, 'Navegación a Reporte de órdenes');

    const urlReporteOk = /\/reports\/order_report/i.test(page.url());
    const reporteBodyInfo = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      return {
        largoTexto: document.body.innerText.length,
        filtros: Array.from(document.querySelectorAll('select, input[type="date"], input[type="text"]')).filter(isVis).length,
        tablas: document.querySelectorAll('table').length
      };
    });
    console.log('📊 Reporte de órdenes — URL:', page.url(), '| datos:', JSON.stringify(reporteBodyInfo));
    const reporteCargoConDatos = urlReporteOk && reporteBodyInfo.largoTexto > 50 && (reporteBodyInfo.filtros > 0 || reporteBodyInfo.tablas > 0);
    if (!urlReporteOk) await screenshotOnFail(page, 'cp300-fail-reporte-url');

    // ══════════════════════════════════════════════════════
    // PARTE 2 — "Admin. Whatsapp" (catálogo completo de mensajes rápidos)
    // ══════════════════════════════════════════════════════
    const tVolver = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, URL_RECEPCION));
    await page.waitForSelector('#repair_order_search', { state: 'attached', timeout: 60000 });
    evaluarCargaPagina(Date.now() - tVolver, 'Regreso a Recepción de Vehículo');
    await dismissNotificationBanner(page);
    await page.waitForTimeout(1000);

    const kebab2Ok = await abrirMenuKebab(page);
    if (!kebab2Ok) throw new Error('No se encontró/abrió el menú "more_vert" (kebab) al volver');

    const tAbrirModal = Date.now();
    await page.evaluate(() => { if (typeof show_dialog_whatsapp_manager === 'function') show_dialog_whatsapp_manager(0); });
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tAbrirModal, 'Abrir modal "Admin. Whatsapp"');

    const modalVisible = await page.evaluate(() => {
      const m = document.getElementById('dialog_whatsapp_manager');
      return m ? getComputedStyle(m).display !== 'none' : false;
    });
    if (!modalVisible) { await screenshotOnFail(page, 'cp300-fail-modal-whatsapp'); throw new Error('El modal "dialog_whatsapp_manager" (Admin. Whatsapp) no quedó visible'); }
    console.log('  ✅ Modal "Administración de mensajes" abierto');

    // ── Opción "Agregar": crear un mensaje rápido de prueba ──
    const abrioAgregar = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('#dialog_whatsapp_manager button')).find(b => b.textContent.trim() === 'Agregar');
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(1200);
    const formAgregarOk = await page.evaluate(() => !!(document.getElementById('txt_shortcut') && document.getElementById('txt_message')));
    console.log('  📝 Opción "Agregar" — formulario (Teclado/Mensaje) presente:', formAgregarOk);
    if (!abrioAgregar || !formAgregarOk) throw new Error('No se encontró/abrió el formulario de "Agregar" mensaje rápido');

    await page.fill('#txt_shortcut', shortcutUnico);
    await page.fill('#txt_message', mensajeOriginal);
    const tGuardar1 = Date.now();
    await page.evaluate(() => { if (typeof update_whatsapp_message === 'function') update_whatsapp_message(); });
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tGuardar1, 'Guardar mensaje rápido nuevo');

    // ── Opción "Buscar": localizar el mensaje recién creado por su atajo único ──
    await page.fill('#input_dialog_whatsapp_manager', shortcutUnico).catch(() => {});
    await page.evaluate(() => { if (typeof get_whatsapp_message === 'function') get_whatsapp_message(); });
    await page.waitForTimeout(1500);
    const filaCreada = await page.evaluate((shortcut) => {
      const m = document.getElementById('dialog_whatsapp_manager');
      const texto = m.innerText;
      const btn = Array.from(m.querySelectorAll('button[onclick*="confirm_delete"]'))[0];
      const idMatch = btn ? (btn.getAttribute('onclick') || '').match(/confirm_delete\((\d+)/) : null;
      return { encontrado: texto.includes(shortcut), id: idMatch ? idMatch[1] : null };
    }, shortcutUnico);
    console.log('  🔎 Opción "Buscar" — encontró el mensaje creado por su atajo único:', filaCreada.encontrado, '| id:', filaCreada.id);
    if (!filaCreada.encontrado || !filaCreada.id) throw new Error('El buscador no localizó el mensaje rápido recién creado ("' + shortcutUnico + '")');

    // ── Opción "Editar" (icono de lápiz de la fila) ──
    const tEditar = Date.now();
    const abrioEditar = await page.evaluate((id) => {
      const btn = document.querySelector('button[onclick*="show_hide(0,' + id + '"]') || document.querySelector('button[onclick*="show_hide(0, ' + id + '"]');
      if (btn) { btn.click(); return true; }
      return false;
    }, filaCreada.id);
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tEditar, 'Abrir formulario de edición');
    const valoresEditar = await page.evaluate(() => ({
      shortcut: document.getElementById('txt_shortcut')?.value,
      mensaje: document.getElementById('txt_message')?.value
    }));
    console.log('  ✏️ Opción "Editar" — valores cargados en el formulario:', JSON.stringify(valoresEditar));
    const editarCargoValoresCorrectos = abrioEditar && valoresEditar.shortcut === shortcutUnico && valoresEditar.mensaje === mensajeOriginal;
    if (!editarCargoValoresCorrectos) throw new Error('El formulario de "Editar" no cargó los valores reales del mensaje (shortcut/mensaje)');

    // Modificar el mensaje y guardar el cambio
    await page.fill('#txt_message', mensajeEditado);
    const tGuardar2 = Date.now();
    await page.evaluate(() => { if (typeof update_whatsapp_message === 'function') update_whatsapp_message(); });
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tGuardar2, 'Guardar edición del mensaje');

    // Confirmar que la edición persistió
    await page.fill('#input_dialog_whatsapp_manager', shortcutUnico).catch(() => {});
    await page.evaluate(() => { if (typeof get_whatsapp_message === 'function') get_whatsapp_message(); });
    await page.waitForTimeout(1500);
    const edicionPersistio = await page.evaluate((msj) => document.getElementById('dialog_whatsapp_manager').innerText.includes(msj), mensajeEditado);
    console.log('  💾 Edición persistida (mensaje actualizado visible en la lista):', edicionPersistio);
    if (!edicionPersistio) throw new Error('La edición del mensaje no persistió en la lista tras guardar');

    // ── Opción "Eliminar" (icono de basura + confirmación SweetAlert) ──
    const tEliminar = Date.now();
    const disparoEliminar = await page.evaluate((id) => {
      if (typeof confirm_delete === 'function') { confirm_delete(Number(id), 0); return true; }
      return false;
    }, filaCreada.id);
    await page.waitForTimeout(1200);
    const confirmacionInfo = await page.evaluate(() => {
      const swal = document.querySelector('.swal2-popup, .sweet-alert, [class*="swal"]');
      return swal ? swal.textContent.trim().replace(/\s+/g, ' ').slice(0, 200) : null;
    });
    console.log('  🗑️ Opción "Eliminar" — diálogo de confirmación:', confirmacionInfo);
    if (!disparoEliminar || !confirmacionInfo) throw new Error('No apareció el diálogo de confirmación al eliminar el mensaje');

    const confirmoEliminar = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(b => /^eliminar$/i.test((b.textContent||'').trim()));
      if (btn) { btn.click(); return true; }
      return false;
    });
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tEliminar, 'Confirmar eliminación del mensaje');
    if (!confirmoEliminar) throw new Error('No se encontró el botón "Eliminar" del diálogo de confirmación (SweetAlert)');

    // Confirmar que el mensaje ya no existe (limpieza real completada, no queda dato de prueba)
    await page.fill('#input_dialog_whatsapp_manager', shortcutUnico).catch(() => {});
    await page.evaluate(() => { if (typeof get_whatsapp_message === 'function') get_whatsapp_message(); });
    await page.waitForTimeout(1500);
    const eliminacionConfirmada = await page.evaluate((shortcut) => !document.getElementById('dialog_whatsapp_manager').innerText.includes(shortcut), shortcutUnico);
    console.log('  🧹 Limpieza — el mensaje de prueba ya no aparece en la lista:', eliminacionConfirmada);

    // Cerrar el modal
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('#dialog_whatsapp_manager button')).find(b => b.textContent.trim() === 'Cerrar');
      if (btn) btn.click();
    });
    await page.waitForTimeout(1000);
    const modalCerrado = await page.evaluate(() => {
      const m = document.getElementById('dialog_whatsapp_manager');
      return !m || getComputedStyle(m).display === 'none';
    });

    // ── VALIDACIONES ──
    console.log('\n📊 === VALIDACIONES CP-300 ===');
    console.log('  "Reporte de órdenes" navega en la misma pestaña a /reports/order_report:  ' + (urlReporteOk ? '✅' : '❌'));
    console.log('  "Reporte de órdenes" carga con datos/filtros reales:                        ' + (reporteCargoConDatos ? '✅' : '❌'));
    console.log('  Modal "Admin. Whatsapp" (Administración de mensajes) abre:                  ' + (modalVisible ? '✅' : '❌'));
    console.log('  "Agregar" crea un mensaje rápido nuevo:                                      ' + (formAgregarOk ? '✅' : '❌'));
    console.log('  "Buscar" localiza el mensaje creado por su atajo único:                      ' + (filaCreada.encontrado ? '✅' : '❌'));
    console.log('  "Editar" carga los valores reales (shortcut/mensaje) del mensaje:             ' + (editarCargoValoresCorrectos ? '✅' : '❌'));
    console.log('  Edición del mensaje persiste tras guardar:                                    ' + (edicionPersistio ? '✅' : '❌'));
    console.log('  "Eliminar" muestra confirmación SweetAlert y borra el mensaje:                ' + (confirmoEliminar && eliminacionConfirmada ? '✅' : '❌'));
    console.log('  Modal cerrado con "Cerrar":                                                   ' + (modalCerrado ? '✅' : '❌'));

    if (!urlReporteOk) throw new Error('"Reporte de órdenes" no navegó a la URL esperada');
    if (!reporteCargoConDatos) throw new Error('"Reporte de órdenes" no mostró datos/filtros reales tras cargar');
    if (!modalVisible) throw new Error('El modal de Admin. Whatsapp no se abrió');
    if (!filaCreada.encontrado) throw new Error('El buscador del catálogo de mensajes no funcionó');
    if (!editarCargoValoresCorrectos) throw new Error('La edición del catálogo de mensajes no funcionó');
    if (!edicionPersistio) throw new Error('La persistencia de la edición del catálogo de mensajes no se confirmó');
    if (!confirmoEliminar || !eliminacionConfirmada) throw new Error('La eliminación del catálogo de mensajes no funcionó');
    if (!modalCerrado) throw new Error('El modal de Admin. Whatsapp no cerró correctamente');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    console.log('✅ CP-300 PASSED | Reporte de órdenes + Admin. Whatsapp (Agregar/Buscar/Editar/Eliminar) validados | tiempo: ' + tiempoTotalCP + 'ms');
    registrarResultado({ cp: 'CP-300', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotalCP });

  } catch (error) {
    await screenshotOnFail(page, 'cp300-fail');
    console.log('❌ CP-300 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-300', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp300_reporte_ordenes_admin_whatsapp();
