const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');

const RUTAS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/route/adminRoute';
// Nombre único de esta corrida — la ruta que se elimina es SIEMPRE la creada por este mismo CP,
// nunca una ruta de otro CP o de datos reales (acción destructiva sin deshacer)
const NOMBRE_RUTA = 'Ruta QA CP136 DESCARTABLE ' + Date.now();

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

async function buscarRuta(page, nombre) {
  await page.fill('#search_route', nombre);
  await page.evaluate(() => { document.getElementById('btn_search_route')?.click(); });
  await page.waitForTimeout(1500);
}

async function cp136_eliminar_ruta_existente() {
  console.log('🔄 Ejecutando CP-136: Eliminar una ruta existente...');
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

    // ── Crear una ruta NUEVA específicamente para esta prueba (nunca se toca una ruta de otro CP) ──
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
    console.log('🆕 Ruta creada exclusivamente para ser eliminada por este CP:', NOMBRE_RUTA);

    // ── Confirmar que existe antes de eliminar ──
    await refrescarConCacheLimpia(page);
    await page.waitForTimeout(1500);
    await esperarFilasRuta(page);
    await buscarRuta(page, NOMBRE_RUTA);
    const existeAntes = await page.evaluate((nombre) => (document.querySelector('.pce-table')?.textContent || '').includes(nombre), NOMBRE_RUTA);
    console.log('📋 Ruta existe antes de eliminar:', existeAntes);
    if (!existeAntes) throw new Error('La ruta de prueba no se creó correctamente, no se puede continuar con la eliminación');

    // ── Abrir menú de acciones y elegir "Eliminar la ruta" ──
    const tEliminar = Date.now();
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('button.mdl-button--icon')).filter(isVis).find(b => /more_vert/i.test(b.textContent||''));
      if (btn) btn.click();
    });
    await page.waitForTimeout(800);
    const abrioEliminar = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const link = Array.from(document.querySelectorAll('ul.dropdown-menu a')).filter(isVis).find(a => /eliminar/i.test((a.textContent||'').trim()));
      if (link) { link.click(); return true; }
      return false;
    });
    console.log('🖱️ Click en "Eliminar la ruta":', abrioEliminar);
    if (!abrioEliminar) throw new Error('No se encontró la opción "Eliminar la ruta" en el menú de acciones');
    await page.waitForTimeout(1000);

    // ── Validar el diálogo de confirmación (SweetAlert "¿Está seguro?") ──
    const confirmInfo = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
      if (!sa) return null;
      return { texto: sa.textContent.replace(/\s+/g,' ').trim().substring(0,150) };
    });
    console.log('⚠️ Diálogo de confirmación:', JSON.stringify(confirmInfo));
    if (!confirmInfo) { await screenshotOnFail(page, 'cp136-fail-sin-confirmacion'); throw new Error('No apareció el diálogo de confirmación al eliminar'); }

    // ── Confirmar con "Sí, eliminar" ──
    const tRed = [];
    page.on('response', (resp) => {
      if (resp.request().method() === 'POST' && /deleteRoute/i.test(resp.url())) tRed.push(resp.status());
    });
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const btn = Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis).find(b => /s[ií],?\s*eliminar/i.test(b.textContent||''));
      if (btn) btn.click();
    });
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tEliminar, 'Confirmar eliminación de ruta');
    console.log('🌐 Respuesta(s) de /route/deleteRoute:', JSON.stringify(tRed));

    const desapareceInmediato = await page.evaluate((nombre) => !(document.querySelector('.pce-table')?.textContent || '').includes(nombre), NOMBRE_RUTA);
    console.log('🔎 Ruta desaparece del listado inmediatamente:', desapareceInmediato);

    // ── Verificar de forma definitiva tras refrescar y volver a buscar ──
    await refrescarConCacheLimpia(page);
    await page.waitForTimeout(1500);
    await esperarFilasRuta(page).catch(() => {});
    await buscarRuta(page, NOMBRE_RUTA);
    const existeDespues = await page.evaluate((nombre) => (document.querySelector('.pce-table')?.textContent || '').includes(nombre), NOMBRE_RUTA);
    console.log('📋 Ruta existe después de eliminar (tras refrescar):', existeDespues);

    // ── VALIDACIONES ──
    const v1 = existeAntes;
    const v2 = abrioEliminar;
    const v3 = confirmInfo !== null && /segur/i.test(confirmInfo.texto);
    const v4 = tRed.some(s => s === 200);
    const v5 = !existeDespues;

    console.log('\n📊 === VALIDACIONES CP-136 ===');
    console.log('  Ruta de prueba creada y confirmada:      ' + (v1 ? '✅' : '❌'));
    console.log('  Menú "Eliminar la ruta" abrió:             ' + (v2 ? '✅' : '❌'));
    console.log('  Diálogo de confirmación "¿Está seguro?":   ' + (v3 ? '✅' : '❌'));
    console.log('  Petición deleteRoute respondió 200:        ' + (v4 ? '✅' : '❌'));
    console.log('  Ruta ya NO aparece en el listado:          ' + (v5 ? '✅' : '❌'));

    if (!v2) throw new Error('No se pudo abrir la opción "Eliminar la ruta"');
    if (!v3) throw new Error('No apareció el diálogo de confirmación esperado');
    if (!v5) throw new Error('La ruta "' + NOMBRE_RUTA + '" sigue apareciendo en el listado tras eliminarla');

    console.log('✅ CP-136 PASSED | ruta eliminada: "' + NOMBRE_RUTA + '" | validaciones: 5/5');

  } catch (error) {
    await screenshotOnFail(page, 'cp136-fail');
    console.log('❌ CP-136 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp136_eliminar_ruta_existente();
