const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { abrirContextoConSesion, refrescarConCacheLimpia, SESION_PATH } = require('../../../auth/usar-sesion');

const COMISIONES_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/route/adminCommission';
const TOLERANCIA = 1;
const MONTO_COMISION = (Math.floor(Math.random() * 400) + 100); // entre 100 y 500

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

function leerPrimeraFilaComision(page) {
  return page.evaluate(() => {
    const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
    const tabla = document.getElementById('table_products');
    if (!tabla) return null;
    const fila = Array.from(tabla.querySelectorAll('tr')).filter(isVis).find(tr => /tipo comisi/i.test(tr.textContent||''));
    if (!fila) return null;
    const texto = fila.textContent.replace(/\s+/g,' ').trim();
    const matchValor = texto.match(/Valor:\s*([\d.,]+|N\/A)/i);
    return { texto: texto.substring(0,150), valorTexto: matchValor ? matchValor[1] : null };
  });
}

async function cp134_editar_comision() {
  console.log('🔄 Ejecutando CP-134: Editar comisión de repartidores (validar cálculos)...');
  const browser = await chromium.launch({ headless: false });
  let context = await abrirContextoConSesion(browser);
  let page;

  try {
    const t0 = Date.now();
    ({ context, page } = await navegarAModulo(browser, context, COMISIONES_URL));
    await refrescarConCacheLimpia(page);
    await page.waitForTimeout(1500);
    evaluarCargaPagina(Date.now() - t0, 'Carga Admin. Comisiones');

    // Esperar a que la tabla de comisiones cargue vía AJAX
    for (let i = 0; i < 20; i++) {
      const hay = await page.evaluate(() => /tipo comisi/i.test(document.getElementById('table_products')?.textContent || ''));
      if (hay) break;
      await page.waitForTimeout(500);
    }

    const filaAntes = await leerPrimeraFilaComision(page);
    console.log('💰 Comisión antes de editar:', JSON.stringify(filaAntes));
    if (!filaAntes) throw new Error('No se pudo leer la primera fila de comisiones');

    // ── Abrir menú de acciones y "Editar Comision" ──
    const tEditar = Date.now();
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('#ddMenuList, button.mdl-button--icon')).filter(isVis)[0];
      if (btn) btn.click();
    });
    await page.waitForTimeout(800);
    const abrioModal = await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const link = Array.from(document.querySelectorAll('ul.dropdown-menu a')).filter(isVis).find(a => /editar comisi/i.test(a.textContent||''));
      if (link) { link.click(); return true; }
      return false;
    });
    console.log('🖱️ Click en "Editar Comision":', abrioModal);
    if (!abrioModal) throw new Error('No se encontró la opción "Editar Comision" en el menú de acciones');
    await page.waitForSelector('#dialog_add_commission', { timeout: 8000 });
    await page.waitForTimeout(800);

    // ── Ingresar el monto ──
    // HALLAZGO: el checkbox "Valor" (#modal_ck_commission_value) YA viene marcado por defecto al
    // abrir el modal. Clickearlo lo DESMARCA y oculta el campo de monto (switch_commission_option
    // actúa como toggle, no como selección) — no hay que tocarlo, solo llenar el monto vía JS directo
    await page.evaluate((monto) => {
      const el = document.getElementById('modal_input_commission_amount');
      if (el) { el.value = String(monto); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('keyup', { bubbles: true })); }
    }, MONTO_COMISION);
    await page.waitForTimeout(300);
    // El botón real es <button class="btn btn-success ..." onclick="save_document_commission()">
    // SIN type="submit" — ese selector nunca matcheaba nada y el guardado nunca se ejecutaba
    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'; };
      const btn = Array.from(document.querySelectorAll('#dialog_add_commission button')).filter(isVis).find(b => /guardar/i.test(b.textContent||''));
      if (btn) btn.click();
    });
    await page.waitForTimeout(1500);
    evaluarAccion(Date.now() - tEditar, 'Editar comisión');

    await page.evaluate(() => {
      const isVis = el => { const r = el.getBoundingClientRect(); return r.width>0&&r.height>0; };
      const btn = Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis)[0];
      if (btn) btn.click();
    });
    await page.waitForTimeout(1000);

    // ── Verificar el nuevo valor tras refrescar ──
    await refrescarConCacheLimpia(page);
    await page.waitForTimeout(1500);
    for (let i = 0; i < 20; i++) {
      const hay = await page.evaluate(() => /tipo comisi/i.test(document.getElementById('table_products')?.textContent || ''));
      if (hay) break;
      await page.waitForTimeout(500);
    }
    const filaDespues = await leerPrimeraFilaComision(page);
    console.log('💰 Comisión después de editar:', JSON.stringify(filaDespues));

    const valorNumerico = filaDespues && filaDespues.valorTexto ? parseFloat(filaDespues.valorTexto.replace(/,/g,'')) : NaN;
    const diff = isNaN(valorNumerico) ? NaN : Math.abs(valorNumerico - MONTO_COMISION);

    // ── VALIDACIONES ──
    const v1 = filaAntes !== null;
    const v2 = abrioModal;
    const v3 = filaDespues !== null && filaDespues.valorTexto !== 'N/A';
    const v4 = !isNaN(diff) && diff <= TOLERANCIA;

    console.log('\n📊 === VALIDACIONES CP-134 ===');
    console.log('  Fila de comisión leída correctamente:  ' + (v1 ? '✅' : '❌'));
    console.log('  Modal "Editar Comision" abrió:          ' + (v2 ? '✅' : '❌'));
    console.log('  Valor ya no es "N/A" tras guardar:      ' + (v3 ? '✅' : '❌') + ' (' + (filaDespues?.valorTexto) + ')');
    console.log('  Monto guardado ≈ ingresado ±1:           ' + (v4 ? '✅' : '❌') + ' (' + MONTO_COMISION + ' vs ' + valorNumerico + ')');

    if (!v1) throw new Error('No se pudo leer el estado inicial de la comisión');
    if (!v2) throw new Error('No se pudo abrir el modal "Editar Comision"');
    if (!v3) throw new Error('El valor de la comisión sigue en "N/A" tras guardar');
    if (!v4) throw new Error('El monto guardado (' + valorNumerico + ') no coincide con el ingresado (' + MONTO_COMISION + ') ±' + TOLERANCIA);

    console.log('✅ CP-134 PASSED | monto ingresado: ' + MONTO_COMISION + ' | monto guardado: ' + valorNumerico + ' | diff: ' + diff.toFixed(2) + ' | validaciones: 4/4');

  } catch (error) {
    await screenshotOnFail(page, 'cp134-fail');
    console.log('❌ CP-134 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp134_editar_comision();
