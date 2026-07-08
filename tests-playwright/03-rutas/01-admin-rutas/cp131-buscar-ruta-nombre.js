const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');

const RUTAS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/route/adminRoute';
const TERMINO_EXISTENTE = 'RUTA 3';
const TERMINO_INEXISTENTE = 'ZZZ-No-Existe-' + Date.now();

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

function contarRutas(page) {
  return page.evaluate(() => {
    const tabla = document.querySelector('.pce-table');
    if (!tabla) return { cantidad: 0, nombres: [] };
    // El texto de la fila incluye el menú "Asignar clientes/repartidores" (siempre en el DOM,
    // solo oculto visualmente) — hay que excluirlo para no contaminar el nombre de la ruta
    const filas = Array.from(tabla.querySelectorAll('tr')).filter(tr => /clientes/i.test(tr.textContent||''));
    const nombres = filas.map(tr => {
      const clone = tr.cloneNode(true);
      clone.querySelectorAll('.dropdown-menu').forEach(m => m.remove());
      return clone.textContent.replace(/\s+/g,' ').trim().substring(0,60);
    });
    return { cantidad: filas.length, nombres };
  });
}

async function esperarRutasCargadas(page, timeoutMs = 15000) {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const { cantidad } = await contarRutas(page);
    if (cantidad > 0) return cantidad;
    await page.waitForTimeout(500);
  }
  return 0;
}

async function buscar(page, termino) {
  await page.fill('#search_route', termino);
  const t0 = Date.now();
  await page.evaluate(() => { document.getElementById('btn_search_route')?.click(); });
  await page.waitForTimeout(1500);
  evaluarAccion(Date.now() - t0, 'Buscar "' + termino + '"');
  return contarRutas(page);
}

async function cp131_buscar_ruta_nombre() {
  console.log('🔄 Ejecutando CP-131: Buscador de rutas por nombre...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, RUTAS_URL));
    await refrescarConCacheLimpia(page);
    await page.waitForTimeout(1500);
    evaluarCargaPagina(Date.now() - t0, 'Carga Admin. Rutas');

    await esperarRutasCargadas(page);
    const totalInicial = await contarRutas(page);
    console.log('📋 Rutas totales sin filtrar:', totalInicial.cantidad, JSON.stringify(totalInicial.nombres));

    // ── Búsqueda 1: término existente ──
    const resultadoExistente = await buscar(page, TERMINO_EXISTENTE);
    console.log('🔎 Resultado buscando "' + TERMINO_EXISTENTE + '":', JSON.stringify(resultadoExistente));
    const encontroExistente = resultadoExistente.cantidad > 0 && resultadoExistente.nombres.every(n => new RegExp(TERMINO_EXISTENTE, 'i').test(n));

    // ── Búsqueda 2: término inexistente ──
    const resultadoInexistente = await buscar(page, TERMINO_INEXISTENTE);
    console.log('🔎 Resultado buscando término inexistente:', JSON.stringify(resultadoInexistente));
    const sinResultadosInexistente = resultadoInexistente.cantidad === 0;

    // ── Limpiar búsqueda y verificar que vuelve el listado completo ──
    const resultadoLimpio = await buscar(page, '');
    console.log('🔎 Resultado tras limpiar búsqueda:', JSON.stringify(resultadoLimpio));
    const listadoRestaurado = resultadoLimpio.cantidad === totalInicial.cantidad;

    // ── VALIDACIONES ──
    const v1 = totalInicial.cantidad > 0;
    const v2 = encontroExistente;
    const v3 = sinResultadosInexistente;
    const v4 = listadoRestaurado;

    console.log('\n📊 === VALIDACIONES CP-131 ===');
    console.log('  Listado inicial con rutas:              ' + (v1 ? '✅' : '❌') + ' (' + totalInicial.cantidad + ')');
    console.log('  Búsqueda de término existente filtra:    ' + (v2 ? '✅' : '❌') + ' (' + resultadoExistente.cantidad + ' resultado(s))');
    console.log('  Búsqueda de término inexistente sin res.:' + (v3 ? '✅' : '❌') + ' (' + resultadoInexistente.cantidad + ' resultado(s))');
    console.log('  Limpiar búsqueda restaura el listado:    ' + (v4 ? '✅' : '❌') + ' (' + resultadoLimpio.cantidad + ' vs ' + totalInicial.cantidad + ')');

    if (!v1) throw new Error('No hay rutas para probar la búsqueda');
    if (!v2) throw new Error('La búsqueda de "' + TERMINO_EXISTENTE + '" no devolvió el resultado esperado');
    if (!v3) throw new Error('La búsqueda de un término inexistente devolvió resultados (' + resultadoInexistente.cantidad + ')');
    if (!v4) throw new Error('El listado no se restauró tras limpiar la búsqueda');

    console.log('✅ CP-131 PASSED | validaciones: 4/4');

  } catch (error) {
    await screenshotOnFail(page, 'cp131-fail');
    console.log('❌ CP-131 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp131_buscar_ruta_nombre();
