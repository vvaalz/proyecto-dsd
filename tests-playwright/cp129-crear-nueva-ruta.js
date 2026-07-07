const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../auth/usar-sesion');

const RUTAS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/route/adminRoute';
const NOMBRE_RUTA = 'Ruta QA CP129 ' + Date.now();

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

async function cp129_crear_nueva_ruta() {
  console.log('🔄 Ejecutando CP-129: Crear una nueva ruta...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, RUTAS_URL));
    await refrescarConCacheLimpia(page);
    await page.waitForTimeout(1500);
    evaluarCargaPagina(Date.now() - t0, 'Carga Admin. Rutas');

    // ── Abrir formulario "Agregar Nueva Ruta" ──
    await page.evaluate(() => { document.getElementById('btn_add_route')?.click(); });
    await page.waitForSelector('#dialog_add_route', { timeout: 8000 });
    await page.waitForTimeout(800);

    // ── Completar nombre y zona ──
    const tCrear = Date.now();
    await page.fill('#route_name_input', NOMBRE_RUTA);
    const zonaSeleccionada = await page.evaluate(() => {
      const sel = document.getElementById('route_zone_select');
      if (!sel) return null;
      const opcionReal = Array.from(sel.options).find(o => o.value && o.value !== '');
      if (!opcionReal) return null;
      sel.value = opcionReal.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return opcionReal.textContent.trim();
    });
    console.log('📍 Zona seleccionada:', zonaSeleccionada);
    await page.waitForTimeout(500);

    // ── Guardar ──
    await page.evaluate(() => { document.getElementById('btn_save_new_route')?.click(); });
    await page.waitForTimeout(2000);
    evaluarAccion(Date.now() - tCrear, 'Crear ruta');

    // Cerrar cualquier notificación/sweet-alert de confirmación
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const btn = Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis)[0];
      if (btn) btn.click();
    });
    await page.waitForTimeout(1000);

    const modalCerrado = await page.evaluate(() => {
      const m = document.getElementById('dialog_add_route');
      return !m || window.getComputedStyle(m).display === 'none';
    });
    console.log('🪟 Modal cerrado tras guardar:', modalCerrado);

    // ── Verificar que la nueva ruta aparece en el listado (recargar y buscar) ──
    await refrescarConCacheLimpia(page);
    await page.waitForTimeout(1500);
    await page.fill('#search_route', NOMBRE_RUTA);
    await page.evaluate(() => { document.getElementById('btn_search_route')?.click(); });
    await page.waitForTimeout(1500);

    const rutaEncontrada = await page.evaluate((nombre) => {
      return (document.querySelector('.pce-table')?.textContent || '').includes(nombre);
    }, NOMBRE_RUTA);
    console.log('🔎 Ruta encontrada tras buscar:', rutaEncontrada);

    // ── VALIDACIONES ──
    const v1 = zonaSeleccionada !== null;
    const v2 = modalCerrado;
    const v3 = rutaEncontrada;

    console.log('\n📊 === VALIDACIONES CP-129 ===');
    console.log('  Zona seleccionada en el formulario:  ' + (v1 ? '✅' : '❌') + ' ' + zonaSeleccionada);
    console.log('  Modal se cerró tras guardar:          ' + (v2 ? '✅' : '❌'));
    console.log('  Ruta nueva aparece en el listado:     ' + (v3 ? '✅' : '❌'));

    if (!v1) throw new Error('No se pudo seleccionar una zona en el formulario');
    if (!v2) throw new Error('El modal de nueva ruta no se cerró tras guardar');
    if (!v3) throw new Error('La ruta "' + NOMBRE_RUTA + '" no aparece en el listado tras crearla');

    console.log('✅ CP-129 PASSED | ruta creada: "' + NOMBRE_RUTA + '" | zona: ' + zonaSeleccionada + ' | validaciones: 3/3');

  } catch (error) {
    await screenshotOnFail(page, 'cp129-fail');
    console.log('❌ CP-129 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp129_crear_nueva_ruta();
