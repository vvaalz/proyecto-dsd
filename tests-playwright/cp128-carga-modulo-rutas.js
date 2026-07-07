const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../auth/usar-sesion');

const RUTAS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/route/adminRoute';

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

// Navega al módulo y maneja sesión expirada (redirect a /log/login): borra la sesión guardada,
// regenera con abrirContextoConSesion() y reintenta la navegación una sola vez antes de fallar
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

async function cp128_carga_modulo_rutas() {
  console.log('🔄 Ejecutando CP-128: Carga del módulo Admin. Rutas...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, RUTAS_URL));
    await refrescarConCacheLimpia(page);
    await page.waitForTimeout(1500);
    evaluarCargaPagina(Date.now() - t0, 'Carga Admin. Rutas');

    // Tras refrescarConCacheLimpia la tabla de rutas puede tardar en poblarse vía AJAX —
    // esperar hasta que aparezca al menos 1 fila antes de leer el estado
    for (let i = 0; i < 20; i++) {
      const hayFilas = await page.evaluate(() => /clientes/i.test(document.querySelector('.pce-table')?.textContent || ''));
      if (hayFilas) break;
      await page.waitForTimeout(500);
    }

    // ── Validar controles y contenido principal ──
    const estado = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const buscar = document.getElementById('search_route');
      const btnBuscar = document.getElementById('btn_search_route');
      const btnAgregar = document.getElementById('btn_add_route');
      const tabla = document.querySelector('.pce-table');
      // Las filas de datos no necesariamente usan <td> — se identifican por contener el badge "Clientes"
      const filas = tabla ? Array.from(tabla.querySelectorAll('tr')).filter(tr => /clientes/i.test(tr.textContent||'')) : [];
      const nombresRutas = filas.map(tr => (tr.textContent||'').replace(/\s+/g,' ').trim().substring(0,60));
      return {
        buscarVisible: buscar ? isVis(buscar) : false,
        btnBuscarVisible: btnBuscar ? isVis(btnBuscar) : false,
        btnAgregarVisible: btnAgregar ? isVis(btnAgregar) : false,
        tituloVisible: /administrar rutas/i.test(document.body.textContent||''),
        cantidadFilas: filas.length,
        nombresRutas
      };
    });
    console.log('📋 Estado del módulo:', JSON.stringify(estado, null, 2));

    // ── VALIDACIONES ──
    const v1 = estado.tituloVisible;
    const v2 = estado.buscarVisible && estado.btnBuscarVisible;
    const v3 = estado.btnAgregarVisible;
    const v4 = estado.cantidadFilas > 0;

    console.log('\n📊 === VALIDACIONES CP-128 ===');
    console.log('  Título "Administrar Rutas" visible:  ' + (v1 ? '✅' : '❌'));
    console.log('  Buscador de rutas visible:            ' + (v2 ? '✅' : '❌'));
    console.log('  Botón "Agregar Nueva Ruta" visible:    ' + (v3 ? '✅' : '❌'));
    console.log('  Listado con al menos 1 ruta:           ' + (v4 ? '✅' : '❌') + ' (' + estado.cantidadFilas + ')');

    if (!v1) throw new Error('No se encontró el título "Administrar Rutas"');
    if (!v2) throw new Error('El buscador de rutas no está visible');
    if (!v3) throw new Error('El botón "Agregar Nueva Ruta" no está visible');
    if (!v4) throw new Error('El listado de rutas está vacío');

    console.log('✅ CP-128 PASSED | rutas encontradas: ' + estado.cantidadFilas + ' | validaciones: 4/4');

  } catch (error) {
    await screenshotOnFail(page, 'cp128-fail');
    console.log('❌ CP-128 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp128_carga_modulo_rutas();
