const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../auth/usar-sesion');

const RUTAS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/route/adminRoute';
const NOMBRE_ORIGINAL = 'Ruta QA CP135 ' + Date.now();
const NOMBRE_EDITADO = NOMBRE_ORIGINAL + ' EDITADA';

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

async function buscarRuta(page, nombre) {
  await page.fill('#search_route', nombre);
  await page.evaluate(() => { document.getElementById('btn_search_route')?.click(); });
  await page.waitForTimeout(1500);
}

async function cp135_editar_ruta_existente() {
  console.log('🔄 Ejecutando CP-135: Editar una ruta existente...');
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
    await page.fill('#route_name_input', NOMBRE_ORIGINAL);
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
    console.log('🆕 Ruta creada para la prueba:', NOMBRE_ORIGINAL);

    // ── Aislar la ruta con el buscador ──
    await refrescarConCacheLimpia(page);
    await page.waitForTimeout(1500);
    await esperarFilasRuta(page);
    await buscarRuta(page, NOMBRE_ORIGINAL);

    // ── Abrir menú de acciones y elegir "Editar ruta" (edición inline, no es un modal) ──
    const tEditar = Date.now();
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button.mdl-button--icon')).filter(isVis).find(b => /more_vert/i.test(b.textContent||''));
      if (btn) btn.click();
    });
    await page.waitForTimeout(800);
    const abrioEdicion = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const link = Array.from(document.querySelectorAll('ul.dropdown-menu a')).filter(isVis).find(a => /^\s*editar ruta\s*$/i.test((a.textContent||'').trim()));
      if (link) { link.click(); return true; }
      return false;
    });
    console.log('🖱️ Click en "Editar ruta":', abrioEdicion);
    if (!abrioEdicion) throw new Error('No se encontró la opción "Editar ruta" en el menú de acciones');
    await page.waitForTimeout(1000);

    // ── Extraer el ID de la ruta desde la fila en edición y modificar nombre + zona ──
    const rutaId = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const fila = Array.from(document.querySelectorAll('tr[id^="tr_route_"]')).filter(isVis)[0];
      return fila ? fila.id.replace('tr_route_', '') : null;
    });
    console.log('🆔 ID de la ruta en edición:', rutaId);
    if (!rutaId) { await screenshotOnFail(page, 'cp135-fail-sin-fila-edicion'); throw new Error('No se encontró la fila en modo edición inline'); }

    const inputExiste = await page.evaluate((id) => !!document.getElementById('input_route_name_' + id), rutaId);
    if (!inputExiste) { await screenshotOnFail(page, 'cp135-fail-sin-input'); throw new Error('No se encontró el input de nombre en edición (input_route_name_' + rutaId + ')'); }

    await page.evaluate(({ id, nombre }) => {
      const el = document.getElementById('input_route_name_' + id);
      if (el) { el.value = nombre; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }, { id: rutaId, nombre: NOMBRE_EDITADO });
    await page.waitForTimeout(300);

    const zonaOriginal = await page.evaluate((id) => document.getElementById('c_zone_select_' + id)?.value, rutaId);
    console.log('📍 Zona seleccionada al editar:', zonaOriginal);

    // ── Guardar el cambio: routeManager.saveRouteChange(id) vía el botón .btn-success ──
    await page.evaluate((id) => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('tr#tr_route_' + id + ' button.btn-success')).filter(isVis)[0];
      if (btn) btn.click();
    }, rutaId);
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tEditar, 'Editar y guardar ruta');

    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const btn = Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis)[0];
      if (btn) btn.click();
    });
    await page.waitForTimeout(1000);

    // ── Verificar que el nombre nuevo aparece en el listado tras refrescar ──
    await refrescarConCacheLimpia(page);
    await page.waitForTimeout(1500);
    await esperarFilasRuta(page);

    await buscarRuta(page, NOMBRE_EDITADO);
    const apareceConNombreNuevo = await page.evaluate((nombre) => (document.querySelector('.pce-table')?.textContent || '').includes(nombre), NOMBRE_EDITADO);
    console.log('🔎 Ruta encontrada con el nombre editado:', apareceConNombreNuevo);

    await buscarRuta(page, NOMBRE_ORIGINAL);
    const apareceConNombreViejo = await page.evaluate((nombre) => {
      const tabla = document.querySelector('.pce-table');
      if (!tabla) return false;
      // Buscar coincidencia EXACTA del nombre original (no solo "contains", ya que el nombre
      // editado también contiene el nombre original como prefijo)
      const filas = Array.from(tabla.querySelectorAll('tr')).filter(tr => /clientes/i.test(tr.textContent||''));
      return filas.some(tr => {
        const clone = tr.cloneNode(true);
        clone.querySelectorAll('.dropdown-menu').forEach(m => m.remove());
        return clone.textContent.replace(/\s+/g,' ').trim().includes(nombre) && !clone.textContent.includes(nombre + ' EDITADA');
      });
    }, NOMBRE_ORIGINAL);
    console.log('🔎 ¿Sigue existiendo una ruta con el nombre original (sin editar)?:', apareceConNombreViejo);

    // ── VALIDACIONES ──
    const v1 = !!rutaId;
    const v2 = abrioEdicion;
    const v3 = apareceConNombreNuevo;
    const v4 = !apareceConNombreViejo;

    console.log('\n📊 === VALIDACIONES CP-135 ===');
    console.log('  Fila en edición inline con ID válido:     ' + (v1 ? '✅' : '❌') + ' (' + rutaId + ')');
    console.log('  Menú "Editar ruta" abrió la edición:       ' + (v2 ? '✅' : '❌'));
    console.log('  Ruta aparece con el nombre editado:        ' + (v3 ? '✅' : '❌'));
    console.log('  Ya no existe con el nombre original:       ' + (v4 ? '✅' : '❌'));

    if (!v1) throw new Error('No se pudo identificar el ID de la ruta en edición');
    if (!v3) throw new Error('La ruta no aparece con el nombre editado tras guardar (' + NOMBRE_EDITADO + ')');
    if (!v4) throw new Error('La ruta sigue apareciendo con el nombre original sin editar (' + NOMBRE_ORIGINAL + ')');

    console.log('✅ CP-135 PASSED | nombre original: "' + NOMBRE_ORIGINAL + '" | nombre editado: "' + NOMBRE_EDITADO + '" | validaciones: 4/4');

  } catch (error) {
    await screenshotOnFail(page, 'cp135-fail');
    console.log('❌ CP-135 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp135_editar_ruta_existente();
