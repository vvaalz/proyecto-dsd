const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const POS_URL = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
// Modal "Agregar Cliente" (#dialog_add_customer) del POS — flujo "cliente completo": llena TODOS
// los campos y opciones de los 3 tabs (Principal, Opciones avanzadas, Ubicación), SIN tocar
// actividades económicas múltiples (CP-195) ni información de vehículo (CP-196/197). Tras guardar,
// reabre el cliente vía el ícono de edición (lápiz) para confirmar que los datos de los 3 tabs
// realmente persistieron en el backend, no solo en el panel de la venta actual.

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

// Selector genérico de <select>: nativo visible, widget Chosen (contenedor .chosen-container
// HERMANO del select, no ancestro — hallazgo CP-191), o bootstrap-select (.btn-group hermano).
async function seleccionarValorSelect(page, selectId, textoOpcion) {
  const chosen = page.locator(`#${selectId} ~ .chosen-container`).first();
  const bootstrapSelect = page.locator(`#${selectId} ~ .btn-group.bootstrap-select, #${selectId} ~ .dropdown.bootstrap-select`).first();
  if (await chosen.count()) {
    // Chosen renderiza distinto para <select single> (.chosen-single) que para <select multiple>
    // (.chosen-choices, una lista de tags con buscador) — probar ambos.
    const disparador = chosen.locator('.chosen-single, .chosen-single-with-deselect, .chosen-choices').first();
    await disparador.click();
    await page.waitForTimeout(400);
    await chosen.locator('.chosen-results li.active-result, .chosen-drop li.active-result', { hasText: textoOpcion }).first().click();
    await page.waitForTimeout(400);
    return 'chosen';
  }
  if (await bootstrapSelect.count()) {
    await bootstrapSelect.locator('button.dropdown-toggle').first().click();
    await page.waitForTimeout(400);
    await bootstrapSelect.locator('li a, .dropdown-menu a', { hasText: textoOpcion }).first().click();
    await page.waitForTimeout(300);
    await bootstrapSelect.locator('button.dropdown-toggle').first().click(); // cerrar
    await page.waitForTimeout(300);
    return 'bootstrap-select';
  }
  await page.selectOption('#' + selectId, { label: textoOpcion });
  return 'nativo';
}

// Multi-select Chosen ("Select Some Options" con clase CSS "selectpicker" heredada de otro widget
// pero renderizada realmente como .chosen-container-multi, confirmado en vivo): cada opción se
// agrega llamando a seleccionarValorSelect una vez por texto (el buscador de Chosen reabre solo).
async function seleccionarMultiplesChosen(page, selectId, textos) {
  for (const texto of textos) {
    await seleccionarValorSelect(page, selectId, texto);
  }
}

// Toggle tipo checkbox-slider (mismo patrón que otros switches del sistema: input 0x0 oculto,
// requiere .checked + dispatchEvent('change') + dispatchEvent('click'), un click real no basta).
async function activarToggle(page, checkboxId) {
  await page.evaluate((id) => {
    const el = document.getElementById(id);
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('click', { bubbles: true }));
  }, checkboxId);
  await page.waitForTimeout(600);
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

async function cp195_cliente_completo_avanzadas_ubicacion() {
  console.log('🔄 Ejecutando CP-195: Crear Cliente (POS) — cliente completo (Principal + Opciones avanzadas + Ubicación)...');
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
    const identificacion = '11' + String(sufijo).slice(-7);
    const nombre = 'Cliente Completo CP195 ' + sufijo;
    const correo = 'cliente.cp195.' + sufijo + '@qatest.com';
    const codigo = 'COD195-' + sufijo;
    const batch = 'BATCH195-' + sufijo;
    const direccion = 'Dirección de prueba CP195, 200m norte del parque';
    const whatsapp = '88881111';
    const telefono = '22221111';
    const limiteCredito = '50000';
    const lugar = 'Oficina CP195';
    const direccionEscrita = 'Frente a la plaza central';

    // ── TAB PRINCIPAL: todos los campos ──
    const tPrincipal = Date.now();
    await page.fill('#c_identifier', identificacion);
    await seleccionarValorSelect(page, 'c_identification_type', 'Cédula Física');
    await page.fill('#c_name', nombre);
    await page.fill('#c_email', correo);
    const actividadUsada = await seleccionarValorSelect(page, 'c_principal_economic_activity', 'CULTIVO Y VENTA DE CEREALES');
    await page.fill('#c_code', codigo);
    await page.fill('#c_batch', batch);
    const provinciaUsada = await seleccionarValorSelect(page, 'c_province_pos_modal', 'San José');
    await page.fill('#c_address', direccion);
    await page.fill('#c_whatsapp', whatsapp);
    await page.fill('#c_telefono_1', telefono);
    evaluarAccion(Date.now() - tPrincipal, 'Llenar tab Principal completo');
    console.log('📋 Widgets usados — Actividad Económica:', actividadUsada, '| Provincia:', provinciaUsada);
    await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp195-tab-principal-'+sufijo+'.png') }).catch(()=>{});

    // ── TAB OPCIONES AVANZADAS: todos los campos ──
    await clickBotonModal(page, 'Siguiente');
    await page.waitForTimeout(1000);
    const tAvanzadas = Date.now();
    await activarToggle(page, 'ck_is_exempt');
    const vendedorUsado = await seleccionarValorSelect(page, 'c_agent', 'Drinjol');
    const zonaUsada = await seleccionarValorSelect(page, 'c_zone', 'Cedral');
    const rutaUsada = await seleccionarValorSelect(page, 'c_route', 'RUTA 2');
    const documentoUsado = await seleccionarValorSelect(page, 'c_default_document_type', 'Tiquete Electrónico');
    await seleccionarMultiplesChosen(page, 'c_paydate', ['Lunes', 'Miércoles']);
    await seleccionarMultiplesChosen(page, 'c_trammitdate', ['Martes', 'Jueves']);
    const recurrenciaUsada = await seleccionarValorSelect(page, 'c_recurrence', 'Mensual');
    await page.fill('#c_limit', limiteCredito);
    evaluarAccion(Date.now() - tAvanzadas, 'Llenar tab Opciones avanzadas completo');
    console.log('📋 Widgets usados — Vendedor:', vendedorUsado, '| Zona:', zonaUsada, '| Ruta:', rutaUsada, '| Doc.:', documentoUsado, '| Recurrencia:', recurrenciaUsada);
    await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp195-tab-avanzadas-'+sufijo+'.png') }).catch(()=>{});

    // ── TAB UBICACIÓN: agregar una dirección nueva ──
    await clickBotonModal(page, 'Siguiente');
    await page.waitForTimeout(1000);
    const tUbicacion = Date.now();
    await page.fill('#c_address_name', lugar);
    await page.fill('#c_written_address', direccionEscrita);
    await activarToggle(page, 'c_default_address');
    await clickBotonModal(page, 'Agregar dirección');
    await page.waitForTimeout(1200);
    evaluarAccion(Date.now() - tUbicacion, 'Llenar y agregar dirección en tab Ubicación');
    const direccionAgregada = await page.evaluate((lugarBuscado) => {
      const modal = document.getElementById('dialog_add_customer');
      return modal.textContent.includes('Direcciones Guardadas') && modal.textContent.includes(lugarBuscado);
    }, lugar);
    console.log('📋 ¿La dirección quedó agregada a la tabla "Direcciones Guardadas"?', direccionAgregada);
    await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp195-tab-ubicacion-'+sufijo+'.png') }).catch(()=>{});

    // ── GUARDAR ──
    const tGuardar = Date.now();
    await clickBotonModal(page, 'Guardar y Salir');
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tGuardar, 'Guardar y Salir del cliente completo');

    const modalCerrado = await page.evaluate(() => !document.getElementById('dialog_add_customer') || !document.getElementById('dialog_add_customer').classList.contains('in'));
    await page.waitForFunction((c) => document.body.innerText.includes(c), correo, { timeout: 15000 }).catch(() => {});
    const panelVenta = await page.evaluate(() => {
      const idx = document.body.innerText.indexOf('Buscar Cliente');
      return idx === -1 ? null : document.body.innerText.substring(idx, idx + 400).replace(/\n+/g, ' | ').trim();
    });
    console.log('📋 Panel de cliente tras guardar:', JSON.stringify(panelVenta));

    // ── Reabrir el cliente (ícono de editar, clase real ".i_edit_customer" confirmada en vivo)
    // para confirmar persistencia real de los 3 tabs ──
    const editAbierto = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btn = Array.from(document.querySelectorAll('.i_edit_customer')).find(isVis);
      if (btn) { btn.click(); return true; }
      return false;
    });
    console.log('📋 ¿Se encontró y clickeó el ícono de editar cliente?', editAbierto);
    await page.waitForTimeout(1500);

    let datosReabiertos = { principal: null, avanzadas: null, ubicacion: null };
    if (editAbierto) {
      const modalReabierto = await page.evaluate(() => !!document.getElementById('dialog_add_customer'));
      if (modalReabierto) {
        datosReabiertos.principal = await page.evaluate(() => ({
          identificacion: document.getElementById('c_identifier')?.value,
          nombre: document.getElementById('c_name')?.value,
          correo: document.getElementById('c_email')?.value,
          codigo: document.getElementById('c_code')?.value,
          batch: document.getElementById('c_batch')?.value,
          direccion: document.getElementById('c_address')?.value,
          whatsapp: document.getElementById('c_whatsapp')?.value,
          telefono: document.getElementById('c_telefono_1')?.value,
        }));
        await clickBotonModal(page, 'Siguiente');
        await page.waitForTimeout(1000);
        datosReabiertos.avanzadas = await page.evaluate(() => ({
          limite: document.getElementById('c_limit')?.value,
          exento: document.getElementById('ck_is_exempt')?.checked,
        }));
        await clickBotonModal(page, 'Siguiente');
        await page.waitForTimeout(1000);
        datosReabiertos.ubicacion = await page.evaluate((lugarBuscado) => {
          const modal = document.getElementById('dialog_add_customer');
          return { direccionGuardada: modal.textContent.includes('Direcciones Guardadas') && modal.textContent.includes(lugarBuscado) };
        }, lugar);
        console.log('📋 Datos reabiertos:', JSON.stringify(datosReabiertos));
        await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp195-reabierto-'+sufijo+'.png') }).catch(()=>{});
        await clickBotonModal(page, 'Guardar y Salir');
        await page.waitForTimeout(1500);
      }
    }

    // ── VALIDACIONES ──
    const v1 = modalCerrado; // guardado exitoso sin error de validación
    const v2 = !!panelVenta && panelVenta.includes(nombre) && panelVenta.includes(correo); // asociado a la venta actual
    // Normalizar antes de comparar: el nombre vuelve con espacios extra al final, y
    // whatsapp/teléfono vuelven con un espacio de máscara ("8888 1111" en vez de "88881111").
    const p = datosReabiertos.principal;
    const v3 = editAbierto && p && p.nombre.trim() === nombre && p.correo === correo && p.codigo === codigo
      && p.direccion === direccion && (p.whatsapp||'').replace(/\s+/g,'') === whatsapp && (p.telefono||'').replace(/\s+/g,'') === telefono; // tab Principal persistió
    const v4 = datosReabiertos.avanzadas && parseFloat(datosReabiertos.avanzadas.limite) === parseFloat(limiteCredito) && datosReabiertos.avanzadas.exento === true; // tab Opciones avanzadas persistió
    const v5 = datosReabiertos.ubicacion && datosReabiertos.ubicacion.direccionGuardada === true; // tab Ubicación persistió

    console.log('\n📊 === VALIDACIONES CP-195 ===');
    console.log('  El modal se cerró tras "Guardar y Salir" (sin error de validación):     ' + (v1 ? '✅' : '❌'));
    console.log('  El cliente creado aparece asociado a la venta actual:                   ' + (v2 ? '✅' : '❌'));
    console.log('  Los datos del tab Principal persistieron (reabriendo el cliente):       ' + (v3 ? '✅' : '❌ ' + JSON.stringify(datosReabiertos.principal)));
    console.log('  Los datos del tab Opciones avanzadas persistieron (límite y exento):    ' + (v4 ? '✅' : '❌ ' + JSON.stringify(datosReabiertos.avanzadas)));
    console.log('  La dirección del tab Ubicación persistió:                               ' + (v5 ? '✅' : '❌ ' + JSON.stringify(datosReabiertos.ubicacion)));

    if (!v1) throw new Error('El modal "Agregar Cliente" siguió abierto tras "Guardar y Salir"');
    if (!v2) throw new Error('El cliente no aparece asociado a la venta actual tras crearlo (' + JSON.stringify(panelVenta) + ')');
    if (!editAbierto) throw new Error('No se pudo reabrir el cliente para confirmar persistencia (no se encontró el ícono de editar)');
    if (!v3) throw new Error('Los datos del tab Principal no persistieron correctamente (' + JSON.stringify(datosReabiertos.principal) + ')');
    if (!v4) throw new Error('Los datos del tab Opciones avanzadas no persistieron correctamente (' + JSON.stringify(datosReabiertos.avanzadas) + ')');
    if (!v5) throw new Error('La dirección agregada en el tab Ubicación no persistió (' + JSON.stringify(datosReabiertos.ubicacion) + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-195 PASSED | cliente completo "' + nombre + '" (id ' + identificacion + ') creado con los 3 tabs llenos y verificado por reapertura | validaciones: 5/5 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-195', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp195-fail');
    console.log('❌ CP-195 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-195', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp195_cliente_completo_avanzadas_ubicacion();
