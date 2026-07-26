const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const POS_URL = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
// Modal "Agregar Cliente" (#dialog_add_customer) del POS — flujo "cliente sencillo + información
// de vehículo MÍNIMA": solo Nombre (único campo requerido) + Correo en el tab Principal (sin
// Identificación/Tipo de Identificación/Actividad Económica/Código/Provincia/Dirección, sin tocar
// Opciones avanzadas ni Ubicación), y activa el switch de vehículo llenando SOLO 4 de los 6 campos
// (Placa, Marca, Modelo, Año). Número de caso y Número de chasis se dejan deliberadamente vacíos
// — es el caso de prueba explícito para "información mínima de vehículo" (CP-197 ya cubre los 6
// campos completos). Se documenta explícitamente en las validaciones qué se dejó sin llenar.

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

async function seleccionarValorSelect(page, selectId, textoOpcion) {
  const chosen = page.locator(`#${selectId} ~ .chosen-container`).first();
  if (await chosen.count()) {
    const disparador = chosen.locator('.chosen-single, .chosen-single-with-deselect, .chosen-choices').first();
    await disparador.click();
    await page.waitForTimeout(400);
    await chosen.locator('.chosen-results li.active-result, .chosen-drop li.active-result', { hasText: textoOpcion }).first().click();
    await page.waitForTimeout(400);
    return 'chosen';
  }
  await page.selectOption('#' + selectId, { label: textoOpcion });
  return 'nativo';
}

async function activarToggle(page, checkboxId) {
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('click', { bubbles: true }));
  }, checkboxId);
  await page.waitForTimeout(800);
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

async function clickBotonModal(page, texto) {
  await page.evaluate((t) => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const modal = document.getElementById('dialog_add_customer');
    const btn = Array.from(modal.querySelectorAll('button')).filter(isVis).find(b => (b.textContent||'').trim() === t);
    btn?.click();
  }, texto);
}

async function cp198_cliente_sencillo_vehiculo_minimo() {
  console.log('🔄 Ejecutando CP-198: Crear Cliente (POS) — cliente sencillo + información de vehículo MÍNIMA (placa, marca, modelo, año)...');
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
    const nombre = 'Cliente Sencillo Vehiculo CP198 ' + sufijo;
    const correo = 'cliente.cp198.' + sufijo + '@qatest.com';
    const placa = 'CP198' + String(sufijo).slice(-3);
    const MARCA = 'AUDI'; // misma marca de CP-197, confirmada con catálogo de modelos poblado en este ambiente
    const ANIO = '2020';

    // ── TAB PRINCIPAL: SOLO nombre + correo (cliente sencillo, sin tocar el resto) ──
    const tPrincipal = Date.now();
    await page.fill('#c_name', nombre);
    await page.fill('#c_email', correo);
    evaluarAccion(Date.now() - tPrincipal, 'Llenar campos del cliente sencillo (nombre + correo)');

    // ── Información de vehículo MÍNIMA: Placa + Marca + Modelo + Año — Número de caso y
    // Número de chasis se dejan DELIBERADAMENTE vacíos (ese es el propósito de este CP) ──
    const tVehiculo = Date.now();
    await activarToggle(page, 'checkbox_more_information_car_add_customer');
    await page.fill('#c_plate_number', placa);
    const marcaUsada = await seleccionarValorSelect(page, 'vehicle_brand', MARCA);
    const modeloSePobló = await page.waitForFunction(() => document.getElementById('vehicle_model').options.length > 1, { timeout: 15000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(400);
    const modeloOpciones = await page.evaluate(() => Array.from(document.getElementById('vehicle_model').options).map(o => o.textContent.trim()).filter(Boolean));
    if (!modeloSePobló || modeloOpciones.length <= 1) throw new Error('El <select> de Modelo no se pobló tras elegir Marca="' + MARCA + '"');
    const modeloElegido = modeloOpciones.find(m => m !== 'Seleccionar opción') || modeloOpciones[0];
    await seleccionarValorSelect(page, 'vehicle_model', modeloElegido);
    await seleccionarValorSelect(page, 'vehicle_year', ANIO);
    evaluarAccion(Date.now() - tVehiculo, 'Llenar información de vehículo mínima (4 de 6 campos)');
    console.log('📋 Widget usado para Marca:', marcaUsada, '| Modelo elegido:', modeloElegido);

    // Confirmar explícitamente que Número de caso y Número de chasis quedaron vacíos (a propósito)
    const camposOpcionalesVacios = await page.evaluate(() => ({
      numeroCaso: document.getElementById('c_unit_number')?.value || '',
      numeroChasis: document.getElementById('c_vehicle_chassis')?.value || '',
    }));
    console.log('📋 Campos de vehículo NO llenados a propósito (Número de caso / Número de chasis):', JSON.stringify(camposOpcionalesVacios));
    await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp198-vehiculo-minimo-'+sufijo+'.png') }).catch(()=>{});

    await clickBotonModal(page, 'Agregar');
    await page.waitForTimeout(1200);
    const vehiculoAgregadoALaTabla = await page.evaluate((placaBuscada) => {
      const modal = document.getElementById('dialog_add_customer');
      return modal.textContent.includes(placaBuscada);
    }, placa);
    console.log('📋 ¿El vehículo (solo 4 campos) quedó agregado a la tabla del modal?', vehiculoAgregadoALaTabla);

    // ── GUARDAR ──
    const tGuardar = Date.now();
    await clickBotonModal(page, 'Guardar y Salir');
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tGuardar, 'Guardar y Salir del cliente sencillo con vehículo mínimo');

    const modalCerrado = await page.evaluate(() => !document.getElementById('dialog_add_customer') || !document.getElementById('dialog_add_customer').classList.contains('in'));
    await page.waitForFunction((c) => document.body.innerText.includes(c), correo, { timeout: 15000 }).catch(() => {});
    const panelVenta = await page.evaluate(() => {
      const idx = document.body.innerText.indexOf('Buscar Cliente');
      return idx === -1 ? null : document.body.innerText.substring(idx, idx + 400).replace(/\n+/g, ' | ').trim();
    });
    console.log('📋 Panel de cliente tras guardar:', JSON.stringify(panelVenta));

    // ── Reabrir el cliente para confirmar que el vehículo (con solo 4 campos) persistió ──
    const editAbierto = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btn = Array.from(document.querySelectorAll('.i_edit_customer')).find(isVis);
      if (btn) { btn.click(); return true; }
      return false;
    });
    console.log('📋 ¿Se encontró y clickeó el ícono de editar cliente?', editAbierto);
    await page.waitForTimeout(1500);

    let vehiculoReabierto = null;
    let nombreReabierto = null;
    if (editAbierto) {
      const modalReabierto = await page.evaluate(() => !!document.getElementById('dialog_add_customer'));
      if (modalReabierto) {
        nombreReabierto = await page.evaluate(() => document.getElementById('c_name')?.value);
        vehiculoReabierto = await page.evaluate((placaBuscada) => {
          const modal = document.getElementById('dialog_add_customer');
          return { tablaIncluyePlaca: modal.textContent.includes(placaBuscada) };
        }, placa);
        console.log('📋 Vehículo reabierto:', JSON.stringify(vehiculoReabierto));
        await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp198-reabierto-'+sufijo+'.png') }).catch(()=>{});
        await clickBotonModal(page, 'Guardar y Salir');
        await page.waitForTimeout(1500);
      }
    }

    // ── VALIDACIONES ──
    const v1 = modalCerrado; // guardado exitoso pese a dejar Número de caso/chasis vacíos (confirma que NO son obligatorios)
    const v2 = !!panelVenta && panelVenta.includes(nombre) && panelVenta.includes(correo); // cliente sencillo asociado a la venta
    const v3 = vehiculoAgregadoALaTabla; // el vehículo con solo 4 campos quedó agregado a la tabla
    const v4 = !!nombreReabierto && nombreReabierto.trim() === nombre; // se reabrió el cliente correcto
    const v5 = !!vehiculoReabierto && vehiculoReabierto.tablaIncluyePlaca; // el vehículo mínimo persistió

    console.log('\n📊 === VALIDACIONES CP-198 ===');
    console.log('  El modal se cerró tras "Guardar y Salir" (Número de caso/chasis vacíos, sin error): ' + (v1 ? '✅' : '❌'));
    console.log('  El cliente sencillo aparece asociado a la venta actual:                 ' + (v2 ? '✅' : '❌'));
    console.log('  El vehículo (solo placa/marca/modelo/año) quedó agregado a la tabla:    ' + (v3 ? '✅' : '❌'));
    console.log('  Se reabrió el mismo cliente creado:                                     ' + (v4 ? '✅' : '❌ (' + nombreReabierto + ')'));
    console.log('  El vehículo mínimo persistió tras guardar (verificado reabriendo):      ' + (v5 ? '✅' : '❌ ' + JSON.stringify(vehiculoReabierto)));
    console.log('  ⚠️ Deliberadamente NO llenado (alcance de este CP): Número de caso, Número de chasis — ambos quedaron vacíos: ' + JSON.stringify(camposOpcionalesVacios));

    if (!v1) throw new Error('El modal "Agregar Cliente" siguió abierto tras "Guardar y Salir" pese a solo llenar 4 de 6 campos del vehículo');
    if (!v2) throw new Error('El cliente no aparece asociado a la venta actual tras crearlo (' + JSON.stringify(panelVenta) + ')');
    if (!v3) throw new Error('El vehículo no quedó agregado a la tabla del modal tras clic en "Agregar"');
    if (!editAbierto || !v4) throw new Error('No se pudo reabrir/confirmar el mismo cliente creado (nombre reabierto: ' + nombreReabierto + ')');
    if (!v5) throw new Error('El vehículo mínimo no persistió tras guardar el cliente (' + JSON.stringify(vehiculoReabierto) + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-198 PASSED | cliente sencillo "' + nombre + '" creado con vehículo mínimo (placa ' + placa + ', ' + MARCA + ' ' + modeloElegido + ' ' + ANIO + ', sin número de caso/chasis) verificado por reapertura | validaciones: 5/5 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-198', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp198-fail');
    console.log('❌ CP-198 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-198', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp198_cliente_sencillo_vehiculo_minimo();
