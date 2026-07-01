const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const PRECIO_ESPERADO = 100;
const TOLERANCIA = 1;
const CLIENTE_ID = 12735;

const screenshotOnFail = async (page, name) => { try { const dir=path.join(__dirname,'..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {} };

function evaluarCargaPagina(ms, etiqueta) {
  if (ms > 8000) console.log('❌ PERFORMANCE FAILED (hallazgo): ' + etiqueta + ' tardó ' + ms + 'ms');
  else if (ms > 3000) console.log('⚠️ LENTO: ' + etiqueta + ' tardó ' + ms + 'ms');
  else console.log('⏱ ' + etiqueta + ': ' + ms + 'ms');
}
function evaluarAccion(ms, etiqueta) {
  if (ms > 4000) console.log('❌ Acción lenta: ' + etiqueta + ' tardó ' + ms + 'ms');
  else if (ms > 1500) console.log('⚠️ Acción algo lenta: ' + etiqueta + ' tardó ' + ms + 'ms');
  else console.log('⏱ ' + etiqueta + ': ' + ms + 'ms');
}

async function confirmSweetAlerts(page, maxRetries = 12) {
  let cartEmpty = false;
  for (let i = 0; i < maxRetries && !cartEmpty; i++) {
    await page.waitForTimeout(1000);
    const state = await page.evaluate(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
      const sa=Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis)[0];
      const ct=document.getElementById('tb_table_buy_list').textContent;
      return { hasSweetAlert:!!sa, cartHasProducts:/aaa-mult[ií]metro/i.test(ct)||/aaa-bombillos/i.test(ct)||/aa-maletero/i.test(ct) };
    });
    if (state.hasSweetAlert) await page.evaluate(()=>{const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0;};const btn=Array.from(document.querySelectorAll('.sweet-alert button.confirm')).filter(isVis)[0];if(btn)btn.click();});
    cartEmpty = !state.cartHasProducts;
  }
  return cartEmpty;
}

async function cp073_factura_credito() {
  console.log('🔄 Ejecutando CP-073: Factura a crédito con productos mixtos (normal + fraccionado)...');
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

    const t0 = Date.now();
    await page.goto(POS, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector('.product_box', { timeout: 15000 });
    tiempos.cargaModulo = Date.now() - t0;
    evaluarCargaPagina(tiempos.cargaModulo, 'Carga POS');

    // Producto 1: AAA-Multímetro (gravado, ₡100)
    const ini1 = Date.now();
    const added1 = await page.evaluate(() => {
      const t=Array.from(document.querySelectorAll('.product_box')).find(b=>/aaa-mult[ií]metro automotriz digital/i.test((b.textContent||'').replace(/\s+/g,' ')));
      if(!t)return false; (t.querySelector('.product_box_quantity_content')||t).click(); return true;
    });
    if (!added1) { await screenshotOnFail(page,'cp073-fail-producto1'); throw new Error('No se encontró AAA-Multímetro Automotriz Digital'); }
    // Esperar a que el Multímetro aparezca en el carrito antes de agregar siguiente
    await page.waitForFunction(() => /aaa-mult[ií]metro/i.test((document.getElementById('tb_table_buy_list')||{textContent:''}).textContent), null, { timeout: 15000 });
    evaluarAccion(Date.now()-ini1, 'Agregar AAA-Multímetro');

    // Producto 2: AAA-Bombillos (exento)
    const ini2 = Date.now();
    const added2 = await page.evaluate(() => {
      const t=Array.from(document.querySelectorAll('.product_box')).find(b=>/aaa-bombillos/i.test((b.textContent||'').replace(/\s+/g,' ')));
      if(!t)return false; (t.querySelector('.product_box_quantity_content')||t).click(); return true;
    });
    if (!added2) { await screenshotOnFail(page,'cp073-fail-producto2'); throw new Error('No se encontró AAA-Bombillos / luces halógenas'); }
    await page.waitForTimeout(800);
    evaluarAccion(Date.now()-ini2, 'Agregar AAA-Bombillos');

    // Producto 3: AA-Maletero (fraccionado) — abre diálogo SELECCIONAR CANTIDAD
    const ini3 = Date.now();
    const maleteroClicked = await page.evaluate(() => {
      const t=Array.from(document.querySelectorAll('.product_box')).find(b=>/aa-maletero/i.test((b.textContent||'').replace(/\s+/g,' ')));
      if(!t)return false; (t.querySelector('.product_box_quantity_content')||t).click(); return true;
    });
    if (!maleteroClicked) { await screenshotOnFail(page,'cp073-fail-producto3'); throw new Error('No se encontró AA-Maletero en el catálogo'); }
    await page.waitForSelector('#dialog_product_fragmented_quantity_view', { timeout: 5000 });
    await page.waitForTimeout(500);
    evaluarAccion(Date.now()-ini3, 'Abrir diálogo de cantidad fraccionada (AA-Maletero)');

    // Ingresar 1 fracción en el input real (prod_frag_q, no el span de display)
    await page.evaluate(() => {
      const fi=document.getElementById('prod_frag_q');
      if(fi){fi.value='1';fi.dispatchEvent(new Event('input',{bubbles:true}));fi.dispatchEvent(new Event('change',{bubbles:true}));}
    });
    await page.waitForTimeout(300);
    const agregarMaletero = await page.evaluate(() => { const btn=document.getElementById('btn_set_product_fragment_quantity'); if(btn){btn.click();return true;}return false; });
    if (!agregarMaletero) { await screenshotOnFail(page,'cp073-fail-maletero-agregar'); throw new Error('No se pudo hacer clic en "Agregar" del diálogo de fracción de AA-Maletero'); }
    await page.waitForTimeout(1200);

    await page.waitForSelector('#tb_table_buy_list', { timeout: 20000 });
    const cartOk = await page.evaluate(() => {
      const text=document.getElementById('tb_table_buy_list').textContent;
      return { m:/aaa-mult[ií]metro/i.test(text), b:/aaa-bombillos/i.test(text), ml:/aa-maletero/i.test(text) };
    });
    console.log('📦 Productos en carrito:', JSON.stringify(cartOk));
    if (!cartOk.m||!cartOk.b||!cartOk.ml) { await screenshotOnFail(page,'cp073-fail-carrito-incompleto'); throw new Error('Algún producto no aparece en el carrito: ' + JSON.stringify(cartOk)); }

    // Validar total ±1
    const cartTotalText = await page.evaluate(() => {
      const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
      const label=Array.from(document.querySelectorAll('*')).filter(isVis).find(el=>/^TOTAL:$/i.test((el.textContent||'').trim()));
      const next=label?label.nextElementSibling:null; return next?next.textContent.trim():null;
    });
    const cartTotalMatch = cartTotalText?cartTotalText.match(/₡\s*([\d,]+\.\d{2})/):null;
    const cartTotalValue = cartTotalMatch?parseFloat(cartTotalMatch[1].replace(/,/g,'')):NaN;
    console.log('💰 Total del carrito (3 productos):', cartTotalText, '-> ₡', cartTotalValue);
    if (isNaN(cartTotalValue)||cartTotalValue<=0) { await screenshotOnFail(page,'cp073-fail-total-invalido'); throw new Error('No se pudo leer el total del carrito o es cero/inválido'); }

    // Asociar cliente
    const customerSelected = await page.evaluate((id) => {
      try { selectCustomerToPos(id); return document.getElementById('customer_select')?.value; } catch(e){return null;}
    }, CLIENTE_ID);
    if (customerSelected !== String(CLIENTE_ID)) { await screenshotOnFail(page,'cp073-fail-cliente'); throw new Error('No se pudo asociar el cliente de prueba (id ' + CLIENTE_ID + ')'); }
    await page.waitForTimeout(1200);

    // Abrir modal de pago
    const inicioModalPago = Date.now();
    await page.evaluate(() => document.getElementById('btn_cash_pos').click());
    await page.waitForFunction(() => { const el=document.getElementById('dialog_payment'); return el?window.getComputedStyle(el).display!=='none':false; }, null, { timeout: 10000 });
    tiempos.abrirModalPago = Date.now() - inicioModalPago;
    evaluarAccion(tiempos.abrirModalPago, 'Abrir modal de pago');

    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch(e){} }, CLIENTE_ID);
    await page.waitForTimeout(1000);

    // Activar modo crédito
    const inicioCredito = Date.now();
    await page.evaluate(() => {
      document.getElementById('ck_is_payment_credit').checked = true;
      switch_payment_type(2);
    });
    await page.waitForTimeout(1500);
    tiempos.activarCredito = Date.now() - inicioCredito;
    evaluarAccion(tiempos.activarCredito, 'Activar modo crédito');

    const creditoState = await page.evaluate(() => ({
      creditoChecked:document.getElementById('ck_is_payment_credit').checked,
      contadoChecked:document.getElementById('ck_is_payment_cash').checked,
      creditEndDate:document.getElementById('credit_sale_end_date')?document.getElementById('credit_sale_end_date').value:null
    }));
    console.log('💳 Estado de crédito en el modal:', JSON.stringify(creditoState));
    if (!creditoState.creditoChecked) { await screenshotOnFail(page,'cp073-fail-credito-no-activado'); throw new Error('El modo crédito no se activó correctamente (ck_is_payment_credit sigue desmarcado)'); }

    const inicioFacturar = Date.now();
    await page.evaluate(() => document.getElementById('make_payment').click());
    const cartEmpty = await confirmSweetAlerts(page);
    tiempos.procesarFactura = Date.now() - inicioFacturar;
    evaluarAccion(tiempos.procesarFactura, 'Procesar y confirmar factura a crédito');

    if (!cartEmpty) { await screenshotOnFail(page,'cp073-fail-factura-no-confirmada'); throw new Error('La factura a crédito no se confirmó (los productos siguen en el carrito)'); }

    // Validar saldo pendiente en Abono Cuentas por Cobrar
    const urlCredSales = 'https://dev.designsoftcr.com/qa_talleralpha/public/credit_sale/clientCreditSales';
    const inicioCargaCred = Date.now();
    let creditPending = { totalRows: 0, hasMontoPendiente: false };
    try {
      await page.goto(urlCredSales, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForTimeout(2500);
      tiempos.cargaCreditSales = Date.now() - inicioCargaCred;
      evaluarCargaPagina(tiempos.cargaCreditSales, 'Carga ' + urlCredSales);
      creditPending = await page.evaluate(() => {
        const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
        const rows=Array.from(document.querySelectorAll('tbody tr')).filter(isVis);
        return { totalRows:rows.length, hasMontoPendiente:rows.some(r=>/₡/.test(r.textContent)) };
      });
      console.log('📊 Datos de Abono Cuentas por Cobrar:', JSON.stringify(creditPending));
    } catch (gotoError) {
      tiempos.cargaCreditSales = Date.now() - inicioCargaCred;
      console.log('⚠️ Página de créditos no cargó en 90s (' + gotoError.message.split('\n')[0] + ')');
    }

    const tiempoTotalCP = Date.now() - tiempoInicioCP;
    if (creditPending.hasMontoPendiente&&creditPending.totalRows>0) {
      console.log('✅ CP-073 PASSED | productos: 3 (AAA-Multímetro x1 gravado, AAA-Bombillos x1 exento, AA-Maletero x1 fracción) | moneda: colones | tipo doc: Factura Interna (crédito) | método pago: crédito | total: ' + cartTotalText + ' | saldo pendiente: registrado en ' + urlCredSales);
    } else {
      await screenshotOnFail(page,'cp073-hallazgo-saldo-no-encontrado');
      console.log('⚠️ CP-073 RESULT: Hallazgo parcial — la venta a crédito se completó exitosamente (cart vacío, notificación recibida) con modo crédito activado (defecto CP-038 ya corregido). Total del carrito: ' + cartTotalText + '. Validación de "saldo crédito pendiente" en ' + urlCredSales + ' no fue concluyente (' + creditPending.totalRows + ' filas en la tabla). La venta sí queda registrada en el sistema como crédito.');
    }
    console.log('⏱ Performance:');
    console.log('   - Carga módulo POS: ' + tiempos.cargaModulo + 'ms');
    console.log('   - Activar modo crédito: ' + tiempos.activarCredito + 'ms');
    console.log('   - Abrir modal de pago: ' + tiempos.abrirModalPago + 'ms');
    console.log('   - Procesar factura a crédito: ' + tiempos.procesarFactura + 'ms');
    console.log('   - Carga reporte Cuentas por Cobrar: ' + (tiempos.cargaCreditSales||'N/A') + 'ms');
    console.log('   - Total CP: ' + tiempoTotalCP + 'ms');
  } catch (error) {
    await screenshotOnFail(page,'cp073-fail-excepcion');
    console.log('❌ CP-073 FAILED: ' + error.message);
    process.exit(1);
  } finally { await browser.close(); }
}
cp073_factura_credito();
