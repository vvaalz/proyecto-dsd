const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');

const RUTAS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/route/adminRoute';
const NOMBRE_RUTA = 'Ruta QA CP133 ' + Date.now();

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
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

async function cp133_asignar_repartidor_ruta() {
  console.log('🔄 Ejecutando CP-133: Asignar repartidor a una ruta...');
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

    const repartidoresAntes = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const tabla = document.querySelector('.pce-table');
      const fila = tabla ? Array.from(tabla.querySelectorAll('tr')).filter(isVis).find(tr => /clientes/i.test(tr.textContent||'')) : null;
      const match = fila ? fila.textContent.match(/(\d+)\s*Repartidores/i) : null;
      return match ? parseInt(match[1], 10) : null;
    });
    console.log('📋 Repartidores vinculados antes de asignar:', repartidoresAntes);
    if (repartidoresAntes === null) throw new Error('No se pudo leer el contador de repartidores de la ruta recién creada');

    // ── Abrir menú de acciones de la ruta y elegir "Asignar repartidores" ──
    const tAsignar = Date.now();
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button.mdl-button--icon')).filter(isVis).find(b => /more_vert/i.test(b.textContent||''));
      if (btn) btn.click();
    });
    await page.waitForTimeout(800);
    const abrioModal = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const link = Array.from(document.querySelectorAll('ul.dropdown-menu a')).filter(isVis).find(a => /asignar repartidores/i.test(a.textContent||''));
      if (link) { link.click(); return true; }
      return false;
    });
    console.log('🖱️ Click en "Asignar repartidores":', abrioModal);
    if (!abrioModal) throw new Error('No se encontró la opción "Asignar repartidores" en el menú de acciones');
    await page.waitForSelector('#dialog_add_dealer_route', { timeout: 8000 });
    await page.waitForTimeout(1200);

    // ── Agregar el primer repartidor seleccionable de la lista izquierda ──
    // Mismo ícono <i class="fa fa-angle-double-right"> que en el modal de clientes (CP-132)
    const repartidorAgregado = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const modal = document.getElementById('dialog_add_dealer_route');
      if (!modal) return null;
      const iconos = Array.from(modal.querySelectorAll('i.fa-angle-double-right')).filter(isVis);
      if (iconos.length === 0) return null;
      const icono = iconos[0];
      const fila = icono.closest('tr') || icono.closest('td')?.parentElement;
      const nombreFila = fila ? fila.textContent.replace(/\s+/g,' ').trim().substring(0,40) : null;
      icono.click();
      return nombreFila;
    });
    evaluarAccion(Date.now() - tAsignar, 'Asignar repartidor');
    console.log('🚚 Repartidor agregado (fila detectada):', repartidorAgregado);
    await page.waitForTimeout(1500);
    if (!repartidorAgregado) { await screenshotOnFail(page, 'cp133-fail-boton-agregar'); throw new Error('No se encontró el botón para agregar un repartidor en la lista de seleccionables'); }

    const sinVinculadosDesaparece = await page.evaluate(() => {
      const modal = document.getElementById('dialog_add_dealer_route');
      return modal ? !/no hay repartidores vinculados/i.test(modal.textContent||'') : null;
    });
    console.log('📋 Mensaje "No hay repartidores vinculados" ya no aparece:', sinVinculadosDesaparece);

    // Cerrar el modal
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('#dialog_add_dealer_route button')).filter(isVis).find(b => /cerrar/i.test(b.textContent||''));
      if (btn) btn.click();
    });
    await page.waitForTimeout(1000);

    // ── Verificar el contador de repartidores de la ruta tras refrescar ──
    await refrescarConCacheLimpia(page);
    await page.waitForTimeout(1500);
    await esperarFilasRuta(page);
    await page.fill('#search_route', NOMBRE_RUTA);
    await page.evaluate(() => { document.getElementById('btn_search_route')?.click(); });
    await page.waitForTimeout(1500);

    const repartidoresDespues = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const tabla = document.querySelector('.pce-table');
      const fila = tabla ? Array.from(tabla.querySelectorAll('tr')).filter(isVis).find(tr => /clientes/i.test(tr.textContent||'')) : null;
      const match = fila ? fila.textContent.match(/(\d+)\s*Repartidores/i) : null;
      return match ? parseInt(match[1], 10) : null;
    });
    console.log('📋 Repartidores vinculados después de asignar:', repartidoresDespues);

    // ── VALIDACIONES ──
    // v3 es una señal secundaria dentro del modal (puede tardar en re-renderizar tras el click) —
    // la señal confiable es v4: el contador persistido en el listado tras refrescar la página
    const v1 = repartidoresAntes === 0;
    const v2 = !!repartidorAgregado;
    const v3 = sinVinculadosDesaparece === true;
    const v4 = repartidoresDespues !== null && repartidoresDespues === repartidoresAntes + 1;

    console.log('\n📊 === VALIDACIONES CP-133 ===');
    console.log('  Ruta nueva empieza con 0 repartidores:   ' + (v1 ? '✅' : '❌') + ' (' + repartidoresAntes + ')');
    console.log('  Se encontró y clickeó botón de agregar:  ' + (v2 ? '✅' : '❌'));
    console.log('  Mensaje "sin vinculados" desaparece:      ' + (v3 ? '✅' : '⚠️ (no bloqueante, ver nota)'));
    console.log('  Contador de repartidores incrementó ±1:   ' + (v4 ? '✅' : '❌') + ' (' + repartidoresAntes + ' → ' + repartidoresDespues + ')');

    if (!v2) throw new Error('No se pudo hacer clic en el botón de agregar repartidor');
    if (!v4) throw new Error('El contador de repartidores de la ruta no incrementó tras asignar (' + repartidoresAntes + ' → ' + repartidoresDespues + ')');

    const pasadas = [v1,v2,v3,v4].filter(Boolean).length;
    console.log('✅ CP-133 PASSED | ruta: "' + NOMBRE_RUTA + '" | repartidores: ' + repartidoresAntes + ' → ' + repartidoresDespues + ' | validaciones: ' + pasadas + '/4');

  } catch (error) {
    await screenshotOnFail(page, 'cp133-fail');
    console.log('❌ CP-133 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp133_asignar_repartidor_ruta();
