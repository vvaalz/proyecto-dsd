const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SETTINGS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/invoiceSetting/invoiceSetting';

const screenshotOnFail = async (page, name) => { try { const dir=path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {} };

function evaluarCargaPagina(ms, etiqueta) {
  if (ms > 8000) { console.log('❌ PERFORMANCE FAILED (hallazgo, no corta la prueba): ' + etiqueta + ' tardó ' + ms + 'ms'); return false; }
  if (ms > 3000) console.log('⚠️ LENTO: ' + etiqueta + ' tardó ' + ms + 'ms');
  else console.log('⏱ ' + etiqueta + ': ' + ms + 'ms');
  return true;
}

function evaluarAccion(ms, etiqueta) {
  if (ms > 4000) console.log('❌ Acción lenta: ' + etiqueta + ' tardó ' + ms + 'ms');
  else if (ms > 1500) console.log('⚠️ Acción algo lenta: ' + etiqueta + ' tardó ' + ms + 'ms');
  else console.log('⏱ ' + etiqueta + ': ' + ms + 'ms');
}

async function cp072_planillas_factura_configuracion() {
  console.log('🔄 Ejecutando CP-072: Verificar planillas de factura en Configuración...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.clearCookies();
  const page = await context.newPage();
  const tiempoInicioCP = Date.now();
  const tiempos = {};
  try {
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    await page.fill('#email', 'qadesignsoftcr@gmail.com');
    await page.fill('#password', 'qa0000');
    await page.click('#loginButton');
    await page.waitForURL('**/dashboard**', { timeout: 40000 });

    const inicioCarga = Date.now();
    await page.goto(SETTINGS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#step_invoice', { state: 'attached', timeout: 20000 });
    tiempos.cargaModulo = Date.now() - inicioCarga;
    const cargaDentroDeUmbral = evaluarCargaPagina(tiempos.cargaModulo, 'Carga ' + SETTINGS_URL);
    if (!cargaDentroDeUmbral) await screenshotOnFail(page,'cp072-hallazgo-performance-carga');
    await page.waitForTimeout(1500);

    const tabFacturaActivo = await page.evaluate(() => document.getElementById('step_invoice').className.includes('active'));
    if (!tabFacturaActivo) { await screenshotOnFail(page,'cp072-fail-tab-factura-no-activo'); throw new Error('El tab "Factura" no está activo por defecto al entrar a Admin. factura'); }
    console.log('✔ Tab "Factura" activo por defecto');

    for (const tab of [{ id:'step_proform', nombre:'Proforma' },{ id:'step_ticket', nombre:'Ticket' },{ id:'step_invoice', nombre:'Factura' }]) {
      const t1 = Date.now();
      await page.evaluate((id) => { const li=document.getElementById(id); const a=li.querySelector('a')||li; a.click(); }, tab.id);
      await page.waitForTimeout(700);
      evaluarAccion(Date.now()-t1, 'Cambiar a tab "' + tab.nombre + '"');
      const activo = await page.evaluate((id) => document.getElementById(id).className.includes('active'), tab.id);
      if (!activo) { await screenshotOnFail(page,'cp072-fail-tab-'+tab.id); throw new Error('El tab "' + tab.nombre + '" no respondió al hacer clic (no quedó activo)'); }
      console.log('✔ Tab "' + tab.nombre + '" responde correctamente al hacer clic');
    }

    const inicioRecorrido = Date.now();
    const botonesNumerados = await page.evaluate(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
      return Array.from(document.querySelectorAll('.btn_element_number_config_panel')).filter(isVis).map((_,i)=>i);
    });
    console.log('📋 Opciones de plantilla encontradas en tab "Factura": ' + botonesNumerados.length);
    if (botonesNumerados.length === 0) { await screenshotOnFail(page,'cp072-fail-sin-opciones'); throw new Error('No se encontraron opciones de plantilla (botones numerados) en el tab "Factura"'); }

    let erroresAlRecorrer = 0;
    for (let i = 0; i < botonesNumerados.length; i++) {
      const ok = await page.evaluate((idx) => {
        const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
        const btns=Array.from(document.querySelectorAll('.btn_element_number_config_panel')).filter(isVis);
        const btn=btns[idx]; if(!btn)return false;
        try{btn.click();return true;}catch(e){return false;}
      }, i);
      if (!ok) erroresAlRecorrer++;
    }
    tiempos.recorrerOpciones = Date.now() - inicioRecorrido;
    evaluarAccion(tiempos.recorrerOpciones, 'Recorrer las ' + botonesNumerados.length + ' opciones de plantilla');
    if (erroresAlRecorrer > 0) { await screenshotOnFail(page,'cp072-fail-opciones-no-responden'); throw new Error(erroresAlRecorrer + ' de ' + botonesNumerados.length + ' opciones de plantilla no respondieron al clic'); }
    console.log('✔ Las ' + botonesNumerados.length + ' opciones de plantilla respondieron al clic sin errores');

    const inicioGuardar = Date.now();
    await page.evaluate(() => document.getElementById('save_settings_invoice').click());
    const guardadoConfirmado = await page.waitForFunction(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
      const el=Array.from(document.querySelectorAll('.noty_text')).filter(isVis)[0];
      return el?el.textContent.trim():null;
    }, null, { timeout: 10000 }).then(h=>h.jsonValue()).catch(()=>null);
    tiempos.guardarCambios = Date.now() - inicioGuardar;
    evaluarAccion(tiempos.guardarCambios, 'Guardar cambios de plantilla');
    if (!guardadoConfirmado||!/guardad/i.test(guardadoConfirmado)) { await screenshotOnFail(page,'cp072-fail-guardado-no-confirmado'); throw new Error('No se confirmó el guardado de los cambios de la plantilla (mensaje: ' + guardadoConfirmado + ')'); }
    console.log('✔ Confirmación de guardado recibida: "' + guardadoConfirmado + '"');

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    if (cargaDentroDeUmbral) {
      console.log('✅ CP-072 PASSED | tabs verificados: Factura, Proforma, Ticket | opciones de plantilla recorridas: ' + botonesNumerados.length + ' | guardado: confirmado');
    } else {
      console.log('⚠️ CP-072 RESULT: Hallazgo de performance — toda la funcionalidad responde correctamente (tabs Factura/Proforma/Ticket, ' + botonesNumerados.length + ' opciones de plantilla, guardado confirmado), pero la carga de invoiceSetting tardó ' + tiempos.cargaModulo + 'ms, muy por encima del umbral de 8000ms.');
    }
    console.log('⏱ Performance:');
    console.log('   - Carga módulo (invoiceSetting): ' + tiempos.cargaModulo + 'ms' + (cargaDentroDeUmbral?'':' ❌'));
    console.log('   - Recorrer opciones de plantilla: ' + tiempos.recorrerOpciones + 'ms');
    console.log('   - Guardar cambios: ' + tiempos.guardarCambios + 'ms');
    console.log('   - Total CP: ' + tiempoTotalCP + 'ms');
  } catch (error) {
    await screenshotOnFail(page,'cp072-fail-excepcion');
    console.log('❌ CP-072 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp072_planillas_factura_configuracion();
