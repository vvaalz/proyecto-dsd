const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const POS_URL = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
// Modal "Agregar Cliente" (#dialog_add_customer) del POS — flujo "cliente sencillo": solo
// Identificación, Tipo de Identificación, Nombre (único campo requerido del modal) y Correo
// electrónico, en el tab "Principal", sin tocar Opciones avanzadas/Ubicación/Vehículo.

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function navegarAModulo(browser, context, url) {
  let page = await context.newPage();
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForTimeout(3000);
  if (/\/log\/login/i.test(page.url())) {
    console.log('⚠️ Sesión expirada — regenerando y reintentando...');
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

// Selector genérico: el <select> real puede estar (a) visible tal cual, (b) envuelto por el
// widget Chosen (contenedor .chosen-container HERMANO del select, no ancestro — ver hallazgo
// CP-191), o (c) envuelto por bootstrap-select (.btn-group hermano con un <button>). Se prueba
// cada camino en orden y se usa el primero que aplique.
async function seleccionarValorSelect(page, selectId, textoOpcion) {
  const chosen = page.locator(`#${selectId} ~ .chosen-container`).first();
  const bootstrapSelect = page.locator(`#${selectId} ~ .btn-group.bootstrap-select, #${selectId} ~ .dropdown.bootstrap-select`).first();
  if (await chosen.count()) {
    await chosen.locator('.chosen-single, .chosen-single-with-deselect').first().click();
    await page.waitForTimeout(400);
    await chosen.locator('.chosen-results li.active-result', { hasText: textoOpcion }).first().click();
    await page.waitForTimeout(400);
    return 'chosen';
  }
  if (await bootstrapSelect.count()) {
    await bootstrapSelect.locator('button.dropdown-toggle').first().click();
    await page.waitForTimeout(400);
    await bootstrapSelect.locator('li a, .dropdown-menu a', { hasText: textoOpcion }).first().click();
    await page.waitForTimeout(400);
    return 'bootstrap-select';
  }
  await page.selectOption('#' + selectId, { label: textoOpcion });
  return 'nativo';
}

async function abrirModalAgregarCliente(page) {
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const btn = Array.from(document.querySelectorAll('button.dropdown-toggle')).filter(isVis).find(b => (b.textContent||'').trim() === 'Agregar');
    btn?.click();
  });
  await page.waitForTimeout(600);
  await page.click('#add_quick_customer');
  await page.waitForTimeout(1500);
  const modalOk = await page.evaluate(() => !!document.getElementById('dialog_add_customer'));
  if (!modalOk) throw new Error('No se encontró el modal #dialog_add_customer tras clic en "Nuevo Cliente"');
  return modalOk;
}

async function cp193_cliente_sencillo() {
  console.log('🔄 Ejecutando CP-193: Crear Cliente (POS) — cliente sencillo (identificación, nombre, tipo de identificación, correo)...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;
  const tiempoInicioCP = Date.now();

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, POS_URL));
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    evaluarCargaPagina(Date.now() - t0, 'Carga POS');

    await refrescarConCacheLimpia(page);
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { document.getElementById('workshop-web-notification-permission-dismiss')?.click(); });
    await page.waitForTimeout(500);

    await abrirModalAgregarCliente(page);

    const sufijo = Date.now();
    const identificacion = '10' + String(sufijo).slice(-7);
    const nombre = 'Cliente Sencillo CP193 ' + sufijo;
    const correo = 'cliente.cp193.' + sufijo + '@qatest.com';

    const tLlenado = Date.now();
    await page.fill('#c_identifier', identificacion);
    const tipoUsado = await seleccionarValorSelect(page, 'c_identification_type', 'Cédula Física');
    await page.fill('#c_name', nombre);
    await page.fill('#c_email', correo);
    evaluarAccion(Date.now() - tLlenado, 'Llenar campos del cliente sencillo');
    console.log('📋 Widget usado para "Tipo de Identificación":', tipoUsado);

    await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp193-antes-guardar-'+sufijo+'.png') }).catch(()=>{});

    const tGuardar = Date.now();
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const modal = document.getElementById('dialog_add_customer');
      const btn = Array.from(modal.querySelectorAll('button')).filter(isVis).find(b => (b.textContent||'').trim() === 'Guardar y Salir');
      btn?.click();
    });
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tGuardar, 'Guardar y Salir del cliente sencillo');

    // ── Confirmar el resultado: SweetAlert de éxito y cierre del modal ──
    const confirmacion = await page.evaluate(() => {
      const sw = document.querySelector('.sweet-alert, .sweetalert');
      const texto = sw ? sw.textContent.replace(/\s+/g,' ').trim().substring(0,200) : null;
      return { textoSweetAlert: texto, modalSigueAbierto: !!document.getElementById('dialog_add_customer') && document.getElementById('dialog_add_customer').classList.contains('in') };
    });
    console.log('📋 Confirmación tras "Guardar y Salir":', JSON.stringify(confirmacion));

    // Si hay un SweetAlert de confirmación (p.ej. "Aceptar"), confirmarlo
    if (confirmacion.textoSweetAlert) {
      await page.evaluate(() => {
        const sw = document.querySelector('.sweet-alert, .sweetalert');
        const btn = sw ? sw.querySelector('button.confirm') : null;
        btn?.click();
      });
      await page.waitForTimeout(1500);
    }

    // ── Verificar el resultado: "Guardar y Salir" asocia automáticamente el cliente recién
    // creado a la venta actual, reemplazando el buscador por un panel "Cliente: ...". El panel
    // tarda en poblarse un poco tras el toast "Cliente guardado correctamente!" — esperar
    // activamente en vez de un timeout fijo. ──
    await page.waitForFunction((correoBuscado) => document.body.innerText.includes(correoBuscado), correo, { timeout: 15000 }).catch(() => {});

    // document.body.innerText refleja solo texto realmente renderizado (a diferencia de
    // textContent, que incluye nodos ocultos) — más confiable que filtrar por getBoundingClientRect
    // elemento por elemento, que dio falsos negativos aquí pese a que el panel sí era visible.
    const panelCliente = await page.evaluate(() => {
      const idx = document.body.innerText.indexOf('Buscar Cliente');
      if (idx === -1) return null;
      return document.body.innerText.substring(idx, idx + 400).replace(/\n+/g, ' | ').trim();
    });
    console.log('📋 Panel de cliente asociado a la venta tras crear:', JSON.stringify(panelCliente));
    await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp193-cliente-asociado-'+sufijo+'.png') }).catch(()=>{});

    // ── VALIDACIONES ──
    const v1 = !confirmacion.modalSigueAbierto; // el modal se cerró tras guardar (guardado exitoso, sin errores de validación)
    const v2 = !!panelCliente && panelCliente.includes(nombre); // el nombre del cliente creado aparece en el panel de la venta
    const v3 = !!panelCliente && panelCliente.includes(correo); // el correo del cliente creado también aparece en el panel

    console.log('\n📊 === VALIDACIONES CP-193 ===');
    console.log('  El modal se cerró tras "Guardar y Salir" (sin error de validación): ' + (v1 ? '✅' : '❌'));
    console.log('  El nombre del cliente creado aparece asociado a la venta actual:    ' + (v2 ? '✅' : '❌'));
    console.log('  El correo del cliente creado aparece asociado a la venta actual:    ' + (v3 ? '✅' : '❌'));

    if (!v1) throw new Error('El modal "Agregar Cliente" siguió abierto tras "Guardar y Salir" — posible error de validación no manejado');
    if (!v2) throw new Error('El nombre "' + nombre + '" no aparece en el panel de cliente asociado a la venta tras crearlo (' + JSON.stringify(panelCliente) + ')');
    if (!v3) throw new Error('El correo "' + correo + '" no aparece en el panel de cliente asociado a la venta tras crearlo (' + JSON.stringify(panelCliente) + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-193 PASSED | cliente sencillo "' + nombre + '" (id ' + identificacion + ') creado y verificado en el panel de cliente de la venta | validaciones: 3/3 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-193', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp193-fail');
    console.log('❌ CP-193 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-193', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp193_cliente_sencillo();
