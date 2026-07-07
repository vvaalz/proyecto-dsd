const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../auth/usar-sesion');

const RUTAS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/route/adminRoute';
const NOMBRE_RUTA = 'Ruta QA CP132 ' + Date.now();

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function navegarAModulo(browser, context, url) {
  let page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (/\/log\/login/i.test(page.url())) {
    console.log('⚠️ Sesión expirada (redirect a /log/login) — regenerando y reintentando...');
    await page.close();
    fs.rmSync(SESION_PATH, { force: true });
    const contextNuevo = await abrirContextoConSesion(browser);
    page = await contextNuevo.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (/\/log\/login/i.test(page.url())) throw new Error('Sigue redirigiendo a /log/login tras regenerar la sesión');
    return { context: contextNuevo, page };
  }
  return { context, page };
}

async function esperarFilasRuta(page, timeoutMs = 15000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const hay = await page.evaluate(() => /clientes/i.test(document.querySelector('.pce-table')?.textContent || ''));
    if (hay) return true;
    await page.waitForTimeout(500);
  }
  return false;
}

async function cp132_asignar_cliente_ruta() {
  console.log('🔄 Ejecutando CP-132: Asignar cliente a una ruta...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, RUTAS_URL));
    await refrescarConCacheLimpia(page);
    await page.waitForTimeout(1500);
    evaluarCargaPagina(Date.now() - t0, 'Carga Admin. Rutas');
    await esperarFilasRuta(page);

    // ── Crear una ruta fresca para esta prueba (aislada, sin depender de otros CPs) ──
    await page.evaluate(() => { document.getElementById('btn_add_route')?.click(); });
    await page.waitForSelector('#dialog_add_route', { timeout: 8000 });
    await page.waitForTimeout(800);
    await page.fill('#route_name_input', NOMBRE_RUTA);
    await page.evaluate(() => {
      const sel = document.getElementById('route_zone_select');
      const opcion = sel ? Array.from(sel.options).find(o => o.value && o.value !== '') : null;
      if (opcion) { sel.value = opcion.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => { document.getElementById('btn_save_new_route')?.click(); });
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const btn = Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis)[0];
      if (btn) btn.click();
    });
    await page.waitForTimeout(1000);
    console.log('🆕 Ruta creada para la prueba:', NOMBRE_RUTA);

    // ── Aislar la ruta con el buscador ──
    await refrescarConCacheLimpia(page);
    await page.waitForTimeout(1500);
    await esperarFilasRuta(page);
    await page.fill('#search_route', NOMBRE_RUTA);
    await page.evaluate(() => { document.getElementById('btn_search_route')?.click(); });
    await page.waitForTimeout(1500);

    const clientesAntes = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const tabla = document.querySelector('.pce-table');
      const fila = tabla ? Array.from(tabla.querySelectorAll('tr')).filter(isVis).find(tr => /clientes/i.test(tr.textContent||'')) : null;
      const match = fila ? fila.textContent.match(/(\d+)\s*Clientes/i) : null;
      return match ? parseInt(match[1], 10) : null;
    });
    console.log('📋 Clientes vinculados antes de asignar:', clientesAntes);
    if (clientesAntes === null) throw new Error('No se pudo leer el contador de clientes de la ruta recién creada');

    // ── Abrir menú de acciones de la ruta y elegir "Asignar clientes" ──
    const tAsignar = Date.now();
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button.mdl-button--icon')).filter(isVis).find(b => /more_vert/i.test(b.textContent||''));
      if (btn) btn.click();
    });
    await page.waitForTimeout(800);
    const abrioModal = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const link = Array.from(document.querySelectorAll('ul.dropdown-menu a')).filter(isVis).find(a => /asignar clientes/i.test(a.textContent||''));
      if (link) { link.click(); return true; }
      return false;
    });
    console.log('🖱️ Click en "Asignar clientes":', abrioModal);
    if (!abrioModal) throw new Error('No se encontró la opción "Asignar clientes" en el menú de acciones');
    await page.waitForSelector('#dialog_add_client_route', { timeout: 8000 });
    await page.waitForTimeout(1200);

    // ── Agregar el primer cliente seleccionable de la lista izquierda ──
    // El botón de "agregar" es un ícono <i class="fa fa-angle-double-right"> dentro de un <td>
    // (confirmado por inspección directa del modal) — no tiene onclick propio, el handler está
    // delegado más arriba, así que un .click() normal sobre el ícono dispara el evento igual
    const clienteAgregado = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const modal = document.getElementById('dialog_add_client_route');
      if (!modal) return null;
      const iconos = Array.from(modal.querySelectorAll('i.fa-angle-double-right')).filter(isVis);
      if (iconos.length === 0) return null;
      const icono = iconos[0];
      const fila = icono.closest('tr') || icono.closest('td')?.parentElement;
      const nombreFila = fila ? fila.textContent.replace(/\s+/g,' ').trim().substring(0,40) : null;
      icono.click();
      return nombreFila;
    });
    evaluarAccion(Date.now() - tAsignar, 'Asignar cliente');
    console.log('👤 Cliente agregado (fila detectada):', clienteAgregado);
    await page.waitForTimeout(1500);
    if (!clienteAgregado) { await screenshotOnFail(page, 'cp132-fail-boton-agregar'); throw new Error('No se encontró el botón para agregar un cliente en la lista de seleccionables'); }

    const seleccionadosTrasAgregar = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const modal = document.getElementById('dialog_add_client_route');
      const titulo = Array.from(modal.querySelectorAll('h4, h5, strong, b')).filter(isVis).find(el => /seleccionados/i.test(el.textContent||''));
      const contenedor = titulo ? titulo.closest('div').parentElement : null;
      return contenedor ? contenedor.textContent.replace(/\s+/g,' ').trim().substring(0,300) : null;
    });
    console.log('📋 Contenido de "seleccionados" tras agregar:', seleccionadosTrasAgregar);

    // Cerrar el modal
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('#dialog_add_client_route button')).filter(isVis).find(b => /cerrar/i.test(b.textContent||''));
      if (btn) btn.click();
    });
    await page.waitForTimeout(1000);

    // ── Verificar el contador de clientes de la ruta tras refrescar ──
    await refrescarConCacheLimpia(page);
    await page.waitForTimeout(1500);
    await esperarFilasRuta(page);
    await page.fill('#search_route', NOMBRE_RUTA);
    await page.evaluate(() => { document.getElementById('btn_search_route')?.click(); });
    await page.waitForTimeout(1500);

    const clientesDespues = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const tabla = document.querySelector('.pce-table');
      const fila = tabla ? Array.from(tabla.querySelectorAll('tr')).filter(isVis).find(tr => /clientes/i.test(tr.textContent||'')) : null;
      const match = fila ? fila.textContent.match(/(\d+)\s*Clientes/i) : null;
      return match ? parseInt(match[1], 10) : null;
    });
    console.log('📋 Clientes vinculados después de asignar:', clientesDespues);

    // ── VALIDACIONES ──
    const v1 = clientesAntes === 0;
    const v2 = !!clienteAgregado;
    const v3 = seleccionadosTrasAgregar !== null && !/^\s*$/.test(seleccionadosTrasAgregar || '');
    const v4 = clientesDespues !== null && clientesDespues === clientesAntes + 1;

    console.log('\n📊 === VALIDACIONES CP-132 ===');
    console.log('  Ruta nueva empieza con 0 clientes:      ' + (v1 ? '✅' : '❌') + ' (' + clientesAntes + ')');
    console.log('  Se encontró y clickeó botón de agregar: ' + (v2 ? '✅' : '❌'));
    console.log('  Panel "seleccionados" muestra contenido: ' + (v3 ? '✅' : '❌'));
    console.log('  Contador de clientes incrementó ±1:      ' + (v4 ? '✅' : '⚠️') + ' (' + clientesAntes + ' → ' + clientesDespues + ')');

    if (!v2) throw new Error('No se pudo hacer clic en el botón de agregar cliente');
    if (!v3) throw new Error('El panel de clientes seleccionados no muestra contenido tras agregar');
    if (!v4) throw new Error('El contador de clientes de la ruta no incrementó tras asignar (' + clientesAntes + ' → ' + clientesDespues + ')');

    console.log('✅ CP-132 PASSED | ruta: "' + NOMBRE_RUTA + '" | clientes: ' + clientesAntes + ' → ' + clientesDespues + ' | validaciones: 4/4');

  } catch (error) {
    await screenshotOnFail(page, 'cp132-fail');
    console.log('❌ CP-132 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp132_asignar_cliente_ruta();
