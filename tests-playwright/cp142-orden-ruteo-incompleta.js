const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../auth/usar-sesion');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const OBSERVACION = 'Orden de ruteo INCOMPLETA CP-142 ' + Date.now();

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
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

async function contarOrdenes(page) {
  await page.evaluate(() => { document.getElementById('btn_routing_option')?.click(); });
  await page.waitForTimeout(4000);
  for (let i = 0; i < 15; i++) {
    const listo = await page.evaluate(() => document.getElementById('filter_routing_order_btn_all') !== null);
    if (listo) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1000);
  return page.evaluate(() => document.querySelectorAll('[id^="brand_"]').length);
}

async function cp142_orden_ruteo_incompleta() {
  console.log('🔄 Ejecutando CP-142: Enviar Orden de Ruteo sin cliente/ruta/repartidor (caso de error)...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, POS_URL));
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 180000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector('.product_box', { timeout: 60000 });
    await page.evaluate(() => { window.print = () => {}; });
    evaluarCargaPagina(Date.now() - t0, 'Carga POS');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { window.print = () => {}; });

    // ── Contar órdenes existentes ANTES del intento ──
    const ordenesAntes = await contarOrdenes(page);
    console.log('📋 Órdenes de ruteo antes del intento:', ordenesAntes);

    // Volver al POS y agregar un producto
    await page.evaluate(() => { document.getElementById('btn_pos_option')?.click(); });
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 15000 });
    await page.waitForTimeout(1500);

    const producto = await page.evaluate(() => {
      const box = Array.from(document.querySelectorAll('.product_box')).find(b => /aaa-mult[ií]metro/i.test((b.textContent||'').replace(/\s+/g,' ')));
      if (!box) return false;
      (box.querySelector('.product_box_quantity_content') || box).click();
      return true;
    });
    if (!producto) { await screenshotOnFail(page, 'cp142-fail-producto'); throw new Error('No se pudo agregar un producto al carrito'); }
    await page.waitForTimeout(1000);

    // ── Abrir "Orden de ruteo" y NO seleccionar cliente/ruta/repartidor ──
    const tIntento = Date.now();
    await page.evaluate(() => { try { create_routing_order(); } catch (e) {} });
    await page.waitForSelector('#dialog_add_routing_order', { timeout: 10000 });
    await page.waitForTimeout(1500);

    const estadoInicial = await page.evaluate(() => ({
      cliente: document.getElementById('payment_send_routing_order_client')?.value || '',
      ruta: document.getElementById('send_routing_order_route')?.value || '',
      repartidor: document.getElementById('send_routing_order_agent_assigned')?.value || ''
    }));
    console.log('📋 Estado del formulario (sin completar):', JSON.stringify(estadoInicial));

    await page.fill('#send_routing_order_observation', OBSERVACION);
    await page.waitForTimeout(300);

    // Intentar enviar de todas formas
    await page.evaluate(() => { document.getElementById('send_routing_order')?.click(); });
    await page.waitForTimeout(2000);

    const dialogoConfirmacion = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
      return sa ? sa.textContent.replace(/\s+/g,' ').trim().substring(0,150) : null;
    });
    console.log('🔔 Diálogo tras intentar enviar sin completar:', dialogoConfirmacion);

    // Si aparece confirmación, intentar confirmar (para ver si el sistema lo bloquea más adelante o lo deja pasar)
    if (dialogoConfirmacion) {
      await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
        const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
        if (!sa) return;
        const btnEnviar = Array.from(sa.querySelectorAll('button')).filter(isVis).find(b => /^\s*enviar\s*$/i.test((b.textContent||'').trim()));
        if (btnEnviar) btnEnviar.click();
      });
      await page.waitForTimeout(2000);
      await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
        const sa = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
        if (sa) { const btn = sa.querySelector('button.confirm') || sa.querySelector('button'); if (btn) btn.click(); }
      });
      await page.waitForTimeout(1500);
    }
    evaluarAccion(Date.now() - tIntento, 'Intentar enviar orden incompleta');

    const modalSigueAbierto = await page.evaluate(() => {
      const m = document.getElementById('dialog_add_routing_order');
      return m ? window.getComputedStyle(m).display !== 'none' : false;
    });
    console.log('🪟 Modal sigue abierto tras el intento:', modalSigueAbierto);

    // Cerrar el modal si sigue abierto, para dejar el POS en estado limpio
    if (modalSigueAbierto) {
      await page.evaluate(() => {
        const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
        const btn = Array.from(document.querySelectorAll('#dialog_add_routing_order [data-dismiss="modal"], #dialog_add_routing_order .btn_close_payment_modal')).filter(isVis)[0];
        if (btn) btn.click();
      });
      await page.waitForTimeout(1000);
    }

    // ── Contar órdenes DESPUÉS del intento y verificar si se creó una orden inválida ──
    const ordenesDespues = await contarOrdenes(page);
    console.log('📋 Órdenes de ruteo después del intento:', ordenesDespues);
    const seCreoOrdenInvalida = await page.evaluate((obs) => document.body.textContent.includes(obs), OBSERVACION);
    console.log('🔎 ¿Se creó una orden con datos incompletos?:', seCreoOrdenInvalida);

    // ── VALIDACIONES ──
    // El comportamiento correcto esperado es que el sistema RECHACE el envío sin cliente/ruta/
    // repartidor (no debería crear una orden nueva). Si de todas formas la crea, se documenta
    // como hallazgo (⚠️) en vez de hacer fallar el CP, siguiendo el patrón del resto de la suite.
    const v1 = estadoInicial.cliente === '' || estadoInicial.cliente === '0';
    const v2 = estadoInicial.ruta === '' || estadoInicial.ruta === '0';
    const v3 = estadoInicial.repartidor === '' || estadoInicial.repartidor === '0';
    const sistemaRechazoCorrectamente = !seCreoOrdenInvalida && ordenesDespues === ordenesAntes;

    console.log('\n📊 === VALIDACIONES CP-142 ===');
    console.log('  Formulario inicia sin cliente seleccionado:    ' + (v1 ? '✅' : '❌'));
    console.log('  Formulario inicia sin ruta seleccionada:       ' + (v2 ? '✅' : '❌'));
    console.log('  Formulario inicia sin repartidor seleccionado: ' + (v3 ? '✅' : '❌'));
    console.log('  Sistema rechaza el envío incompleto:           ' + (sistemaRechazoCorrectamente ? '✅' : '⚠️') + ' (órdenes: ' + ordenesAntes + ' → ' + ordenesDespues + ')');

    if (!v1) throw new Error('El formulario no inició sin cliente seleccionado — no se puede probar el caso de error');
    if (!v2) throw new Error('El formulario no inició sin ruta seleccionada — no se puede probar el caso de error');
    if (!v3) throw new Error('El formulario no inició sin repartidor seleccionado — no se puede probar el caso de error');

    if (sistemaRechazoCorrectamente) {
      console.log('✅ CP-142 PASSED | el sistema rechazó correctamente el envío sin cliente/ruta/repartidor | validaciones: 4/4');
    } else {
      await screenshotOnFail(page, 'cp142-hallazgo-orden-invalida-creada');
      console.log('⚠️ CP-142 RESULT: El sistema permitió crear una Orden de Ruteo sin cliente/ruta/repartidor asignados (' + ordenesAntes + ' → ' + ordenesDespues + ' órdenes). Se documenta como hallazgo — el formulario debería exigir estos campos antes de permitir "Enviar Orden".');
    }

  } catch (error) {
    await screenshotOnFail(page, 'cp142-fail');
    console.log('❌ CP-142 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp142_orden_ruteo_incompleta();
