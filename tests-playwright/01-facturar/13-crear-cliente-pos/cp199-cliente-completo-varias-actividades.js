const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');
const { BASE_URL } = require('../../../config');
const { registrarResultado, moduloDesdeRuta } = require('../../../utils/registrar-tiempo');

const POS_URL = `${BASE_URL}/pos/pointOfSale?company_pos=20&pos_type_option=1`;
// Modal "Agregar Cliente" (#dialog_add_customer) del POS — flujo "cliente completo con VARIAS
// actividades económicas": llena los 3 tabs igual que CP-195, pero además hace clic en "+
// Actividad" DOS veces para agregar 2 actividades económicas secundarias (además de la
// principal), cada una con un valor distinto, y confirma que las 3 (principal + 2 secundarias)
// persisten tras reabrir el cliente.

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

// Selector genérico de <select>: nativo visible o widget Chosen (contenedor .chosen-container
// HERMANO del select, no ancestro — hallazgo CP-191; soporta single y multi).
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

async function seleccionarMultiplesChosen(page, selectId, textos) {
  for (const texto of textos) {
    await seleccionarValorSelect(page, selectId, texto);
  }
}

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

// Clic en "+ Actividad" (el botón AGREGAR, texto exacto "Actividad" — distinto de los botones
// de eliminar cada fila secundaria, que están vacíos de texto pero comparten la clase
// .btn_activity) y selecciona un valor en el <select> secundario recién insertado.
async function agregarActividadSecundaria(page, texto) {
  await page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const modal = document.getElementById('dialog_add_customer');
    const btn = Array.from(modal.querySelectorAll('a.btn_activity, button.btn_activity')).filter(isVis).find(b => (b.textContent||'').trim() === 'Actividad');
    btn?.click();
  });
  await page.waitForTimeout(800);
  const nuevoId = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('select[id^="secundary_activity_sector_"]'));
    const vacio = selects.reverse().find(s => !s.value || s.selectedIndex <= 0);
    return vacio ? vacio.id : null;
  });
  if (!nuevoId) throw new Error('No se encontró un <select> de actividad secundaria vacío tras clic en "+ Actividad"');
  await seleccionarValorSelect(page, nuevoId, texto);
  return nuevoId;
}

async function cp199_cliente_completo_varias_actividades() {
  console.log('🔄 Ejecutando CP-199: Crear Cliente (POS) — cliente completo con VARIAS actividades económicas (principal + 2 secundarias)...');
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
    const identificacion = '12' + String(sufijo).slice(-7);
    const nombre = 'Cliente Multi Actividad CP199 ' + sufijo;
    const correo = 'cliente.cp199.' + sufijo + '@qatest.com';
    const codigo = 'COD199-' + sufijo;
    const direccion = 'Dirección de prueba CP199, contiguo a la escuela';
    const whatsapp = '88882222';
    const telefono = '22222222';
    const limiteCredito = '75000';
    const lugar = 'Bodega CP199';
    const direccionEscrita = 'Detrás de la iglesia';

    const ACTIVIDAD_PRINCIPAL = 'CULTIVO Y VENTA DE CEREALES';
    const ACTIVIDAD_SECUNDARIA_1 = 'CULTIVO DE PALMA AFRICANA';
    const ACTIVIDAD_SECUNDARIA_2 = 'CULTIVO Y COMERCIALIZACION DE CESPED';

    // ── TAB PRINCIPAL: campos base + actividad principal + 2 actividades secundarias ──
    const tPrincipal = Date.now();
    await page.fill('#c_identifier', identificacion);
    await seleccionarValorSelect(page, 'c_identification_type', 'Cédula Física');
    await page.fill('#c_name', nombre);
    await page.fill('#c_email', correo);
    await seleccionarValorSelect(page, 'c_principal_economic_activity', ACTIVIDAD_PRINCIPAL);
    const idSecundaria1 = await agregarActividadSecundaria(page, ACTIVIDAD_SECUNDARIA_1);
    const idSecundaria2 = await agregarActividadSecundaria(page, ACTIVIDAD_SECUNDARIA_2);
    console.log('📋 IDs de actividades secundarias agregadas:', idSecundaria1, idSecundaria2);
    await page.fill('#c_code', codigo);
    await seleccionarValorSelect(page, 'c_province_pos_modal', 'Alajuela');
    await page.fill('#c_address', direccion);
    await page.fill('#c_whatsapp', whatsapp);
    await page.fill('#c_telefono_1', telefono);
    evaluarAccion(Date.now() - tPrincipal, 'Llenar tab Principal con 3 actividades económicas (1 principal + 2 secundarias)');
    await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp199-tab-principal-'+sufijo+'.png') }).catch(()=>{});

    // ── TAB OPCIONES AVANZADAS ──
    await clickBotonModal(page, 'Siguiente');
    await page.waitForTimeout(1000);
    const tAvanzadas = Date.now();
    await seleccionarValorSelect(page, 'c_agent', 'Jorvendedor');
    await seleccionarValorSelect(page, 'c_recurrence', 'Semanal');
    await page.fill('#c_limit', limiteCredito);
    evaluarAccion(Date.now() - tAvanzadas, 'Llenar tab Opciones avanzadas');
    await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp199-tab-avanzadas-'+sufijo+'.png') }).catch(()=>{});

    // ── TAB UBICACIÓN ──
    await clickBotonModal(page, 'Siguiente');
    await page.waitForTimeout(1000);
    const tUbicacion = Date.now();
    await page.fill('#c_address_name', lugar);
    await page.fill('#c_written_address', direccionEscrita);
    await clickBotonModal(page, 'Agregar dirección');
    await page.waitForTimeout(1200);
    evaluarAccion(Date.now() - tUbicacion, 'Llenar y agregar dirección en tab Ubicación');
    const direccionAgregada = await page.evaluate((lugarBuscado) => {
      const modal = document.getElementById('dialog_add_customer');
      return modal.textContent.includes('Direcciones Guardadas') && modal.textContent.includes(lugarBuscado);
    }, lugar);
    console.log('📋 ¿La dirección quedó agregada?', direccionAgregada);
    await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp199-tab-ubicacion-'+sufijo+'.png') }).catch(()=>{});

    // ── GUARDAR ──
    const tGuardar = Date.now();
    await clickBotonModal(page, 'Guardar y Salir');
    await page.waitForTimeout(2500);
    evaluarAccion(Date.now() - tGuardar, 'Guardar y Salir del cliente con varias actividades');

    const modalCerrado = await page.evaluate(() => !document.getElementById('dialog_add_customer') || !document.getElementById('dialog_add_customer').classList.contains('in'));
    await page.waitForFunction((c) => document.body.innerText.includes(c), correo, { timeout: 15000 }).catch(() => {});
    const panelVenta = await page.evaluate(() => {
      const idx = document.body.innerText.indexOf('Buscar Cliente');
      return idx === -1 ? null : document.body.innerText.substring(idx, idx + 400).replace(/\n+/g, ' | ').trim();
    });
    console.log('📋 Panel de cliente tras guardar:', JSON.stringify(panelVenta));

    // ── Reabrir el cliente para confirmar que las 3 actividades (1 principal + 2 secundarias)
    // persistieron realmente ──
    const editAbierto = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const btn = Array.from(document.querySelectorAll('.i_edit_customer')).find(isVis);
      if (btn) { btn.click(); return true; }
      return false;
    });
    console.log('📋 ¿Se encontró y clickeó el ícono de editar cliente?', editAbierto);
    await page.waitForTimeout(1500);

    let actividadesReabiertas = null;
    let nombreReabierto = null;
    if (editAbierto) {
      const modalReabierto = await page.evaluate(() => !!document.getElementById('dialog_add_customer'));
      if (modalReabierto) {
        const datos = await page.evaluate(() => {
          const principal = document.getElementById('c_principal_economic_activity');
          const secundarios = Array.from(document.querySelectorAll('select[id^="secundary_activity_sector_"]'))
            .filter(s => s.value && s.selectedIndex > 0)
            .map(s => s.options[s.selectedIndex].textContent.trim());
          return {
            nombre: document.getElementById('c_name')?.value,
            principal: principal && principal.selectedIndex > -1 ? principal.options[principal.selectedIndex].textContent.trim() : null,
            secundarios,
          };
        });
        nombreReabierto = datos.nombre;
        actividadesReabiertas = datos;
        console.log('📋 Actividades reabiertas:', JSON.stringify(actividadesReabiertas));
        await page.screenshot({ path: path.join(__dirname,'..','..','..','reports','screenshots','cp199-reabierto-'+sufijo+'.png') }).catch(()=>{});
        await clickBotonModal(page, 'Guardar y Salir');
        await page.waitForTimeout(1500);
      }
    }

    // ── VALIDACIONES ──
    const v1 = modalCerrado; // guardado exitoso sin error de validación
    const v2 = !!panelVenta && panelVenta.includes(nombre) && panelVenta.includes(correo); // asociado a la venta actual
    const v3 = !!nombreReabierto && nombreReabierto.trim() === nombre; // el cliente reabierto es el mismo que se creó
    const v4 = !!actividadesReabiertas && actividadesReabiertas.principal && actividadesReabiertas.principal.includes(ACTIVIDAD_PRINCIPAL.split(' ')[0]); // actividad principal persistió
    const v5 = !!actividadesReabiertas && actividadesReabiertas.secundarios.length === 2
      && actividadesReabiertas.secundarios.some(a => a.includes('PALMA'))
      && actividadesReabiertas.secundarios.some(a => a.includes('CESPED')); // AMBAS actividades secundarias persistieron

    console.log('\n📊 === VALIDACIONES CP-199 ===');
    console.log('  El modal se cerró tras "Guardar y Salir" (sin error de validación): ' + (v1 ? '✅' : '❌'));
    console.log('  El cliente creado aparece asociado a la venta actual:               ' + (v2 ? '✅' : '❌'));
    console.log('  El cliente reabierto corresponde al mismo cliente creado:           ' + (v3 ? '✅' : '❌ (' + nombreReabierto + ')'));
    console.log('  La actividad económica PRINCIPAL persistió:                        ' + (v4 ? '✅' : '❌ ' + JSON.stringify(actividadesReabiertas?.principal)));
    console.log('  Las 2 actividades económicas SECUNDARIAS persistieron:             ' + (v5 ? '✅' : '❌ ' + JSON.stringify(actividadesReabiertas?.secundarios)));

    if (!v1) throw new Error('El modal "Agregar Cliente" siguió abierto tras "Guardar y Salir"');
    if (!v2) throw new Error('El cliente no aparece asociado a la venta actual tras crearlo (' + JSON.stringify(panelVenta) + ')');
    if (!editAbierto || !v3) throw new Error('No se pudo reabrir/confirmar el mismo cliente creado (nombre reabierto: ' + nombreReabierto + ')');
    if (!v4) throw new Error('La actividad económica principal no persistió correctamente (' + JSON.stringify(actividadesReabiertas?.principal) + ')');
    if (!v5) throw new Error('Las 2 actividades económicas secundarias no persistieron correctamente (' + JSON.stringify(actividadesReabiertas?.secundarios) + ')');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-199 PASSED | cliente "' + nombre + '" (id ' + identificacion + ') creado con 1 actividad principal + 2 secundarias, ambas verificadas por reapertura | validaciones: 5/5 | tiempo: ' + tiempoTotal + 'ms');
    registrarResultado({ cp: 'CP-199', modulo: moduloDesdeRuta(__dirname), estado: 'pass', tiempoMs: tiempoTotal });

  } catch (error) {
    await screenshotOnFail(page, 'cp199-fail');
    console.log('❌ CP-199 FAILED: ' + error.message);
    registrarResultado({ cp: 'CP-199', modulo: moduloDesdeRuta(__dirname), estado: 'fail', tiempoMs: Date.now() - tiempoInicioCP });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

cp199_cliente_completo_varias_actividades();
