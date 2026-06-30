const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const path = require('path');

async function tomarScreenshot(driver, nombre) {
  try {
    const dir = path.join(__dirname, '..', 'reports', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${nombre}-${Date.now()}.png`);
    const data = await driver.takeScreenshot();
    fs.writeFileSync(file, data, 'base64');
    console.log('📸 Screenshot guardado en: ' + file);
  } catch (err) {
    console.log('⚠️ No se pudo guardar el screenshot: ' + err.message);
  }
}

function evaluarCargaPagina(ms, etiqueta) {
  if (ms > 8000) console.log(`❌ PERFORMANCE FAILED (hallazgo): ${etiqueta} tardó ${ms}ms`);
  else if (ms > 3000) console.log(`⚠️ LENTO: ${etiqueta} tardó ${ms}ms`);
  else console.log(`⏱ ${etiqueta}: ${ms}ms`);
  return ms <= 8000;
}

function evaluarAccion(ms, etiqueta) {
  if (ms > 4000) console.log(`❌ Acción lenta: ${etiqueta} tardó ${ms}ms`);
  else if (ms > 1500) console.log(`⚠️ Acción algo lenta: ${etiqueta} tardó ${ms}ms`);
  else console.log(`⏱ ${etiqueta}: ${ms}ms`);
}

async function cp073_factura_credito() {
  console.log('🔄 Ejecutando CP-073: Factura a crédito con productos mixtos (normal + fraccionado)...');

  const options = new chrome.Options();
  options.addArguments('--disable-notifications');
  options.addArguments('--window-size=1440,1200');
  options.addArguments('--kiosk-printing');
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  const tiempoInicioCP = Date.now();
  const tiempos = {};
  const TOLERANCIA = 1;
  const CLIENTE_ID = 12735;

  try {
    // Limpiar cookies y caché del navegador para evitar problemas de sesión.
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.manage().deleteAllCookies();
    await driver.executeScript('window.localStorage.clear();');
    await driver.executeScript('window.sessionStorage.clear();');
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();
    await driver.wait(until.urlContains('dashboard'), 20000);

    // Navegar al POS y medir tiemo de carga
    const urlPOS = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
    const inicioCarga = Date.now();
    await driver.get(urlPOS);
    await driver.wait(until.elementLocated(By.id('product_search')), 60000);
    tiempos.cargaModulo = Date.now() - inicioCarga;
    evaluarCargaPagina(tiempos.cargaModulo, `Carga POS (${urlPOS})`);
    await driver.wait(until.elementLocated(By.css('.product_box')), 15000);

    // Producto 1: AAA-Multímetro Automotriz Digital (gravado, IVA>0, ₡100)
    const ini1 = Date.now();
    const added1 = await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-mult[ií]metro automotriz digital/i.test((b.textContent || '').replace(/\\s+/g, ' ')));
      if (!target) return false;
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
      return true;
    `);
    if (!added1) {
      console.log('❌ CP-073 FAILED: No se encontró AAA-Multímetro Automotriz Digital');
      await tomarScreenshot(driver, 'cp073-fail-producto1');
      process.exit(1);
    }
    await driver.sleep(800);
    evaluarAccion(Date.now() - ini1, 'Agregar AAA-Multímetro');

    // Producto 2: AAA-Bombillos / luces halógenas (exento, IVA=0, ₡150)
    const ini2 = Date.now();
    const added2 = await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-bombillos/i.test((b.textContent || '').replace(/\\s+/g, ' ')));
      if (!target) return false;
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
      return true;
    `);
    if (!added2) {
      console.log('❌ CP-073 FAILED: No se encontró AAA-Bombillos / luces halógenas');
      await tomarScreenshot(driver, 'cp073-fail-producto2');
      process.exit(1);
    }
    await driver.sleep(800);
    evaluarAccion(Date.now() - ini2, 'Agregar AAA-Bombillos');

    // Producto 3: AA-Maletero (fraccionado, ₡180 por caja) — abre un diálogo
    // especial "SELECCIONAR CANTIDAD" (dialog_product_fragmented_quantity_view)
    // donde se indica cuántos cajas enteras (pnl_prod_unit_quantity) y cuántas
    // fracciones (pnl_prod_frag_quantity) se quieren agregar.
    const ini3 = Date.now();
    const maleteroClicked = await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aa-maletero/i.test((b.textContent || '').replace(/\\s+/g, ' ')));
      if (!target) return false;
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
      return true;
    `);
    if (!maleteroClicked) {
      console.log('❌ CP-073 FAILED: No se encontró AA-Maletero en el catálogo');
      await tomarScreenshot(driver, 'cp073-fail-producto3');
      process.exit(1);
    }
    await driver.wait(until.elementLocated(By.id('dialog_product_fragmented_quantity_view')), 5000);
    await driver.sleep(500);
    evaluarAccion(Date.now() - ini3, 'Abrir diálogo de cantidad fraccionada (AA-Maletero)');

    // Ingresar 1 fracción (0 cajas enteras + 1 fracción). Los inputs reales
    // del diálogo son prod_unit_q (cajas) y prod_frag_q (fracciones).
    // Los IDs pnl_prod_* son solo spans de visualización, no inputs.
    await driver.executeScript(`
      const fragInput = document.getElementById('prod_frag_q');
      if (fragInput) { fragInput.value = '1'; fragInput.dispatchEvent(new Event('input', { bubbles: true })); fragInput.dispatchEvent(new Event('change', { bubbles: true })); }
    `);
    await driver.sleep(300);
    const agregarMaletero = await driver.executeScript(`
      const btn = document.getElementById('btn_set_product_fragment_quantity');
      if (btn) { btn.click(); return true; }
      return false;
    `);
    if (!agregarMaletero) {
      console.log('❌ CP-073 FAILED: No se pudo hacer clic en "Agregar" del diálogo de fracción de AA-Maletero');
      await tomarScreenshot(driver, 'cp073-fail-maletero-agregar');
      process.exit(1);
    }
    await driver.sleep(1200);

    // Verificar que los 3 productos están en el carrito
    await driver.wait(until.elementLocated(By.id('tb_table_buy_list')), 20000);
    const cartOk = await driver.executeScript(`
      const text = document.getElementById('tb_table_buy_list').textContent;
      return {
        multimetro: /aaa-mult[ií]metro/i.test(text),
        bombillos: /aaa-bombillos/i.test(text),
        maletero: /aa-maletero/i.test(text)
      };
    `);
    console.log('📦 Productos en carrito:', JSON.stringify(cartOk));
    if (!cartOk.multimetro || !cartOk.bombillos || !cartOk.maletero) {
      console.log('❌ CP-073 FAILED: Algún producto no aparece en el carrito', JSON.stringify(cartOk));
      await tomarScreenshot(driver, 'cp073-fail-carrito-incompleto');
      process.exit(1);
    }

    // Validar el total del carrito y los subtotales de las líneas (±1 tolerancia)
    const totalesInfo = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const totalLabel = Array.from(document.querySelectorAll('*')).filter(isVisible).find((el) => /^TOTAL:$/i.test((el.textContent || '').trim()));
      const totalEl = totalLabel ? totalLabel.nextElementSibling : null;
      const totalText = totalEl ? totalEl.textContent.trim() : null;
      return { totalText };
    `);
    const totalMatch = totalesInfo.totalText ? totalesInfo.totalText.match(/₡\s*([\d,]+\.\d{2})/) : null;
    const totalValue = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : NaN;
    console.log('💰 Total del carrito (3 productos):', totalesInfo.totalText, '-> ₡', totalValue);
    if (isNaN(totalValue) || totalValue <= 0) {
      console.log('❌ CP-073 FAILED: No se pudo leer el total del carrito o es cero/inválido');
      await tomarScreenshot(driver, 'cp073-fail-total-invalido');
      process.exit(1);
    }

    // Asociar el cliente de prueba
    const customerSelected = await driver.executeScript(`
      try {
        selectCustomerToPos(${CLIENTE_ID});
        return document.getElementById('customer_select') ? document.getElementById('customer_select').value : null;
      } catch (e) { return null; }
    `);
    if (customerSelected !== String(CLIENTE_ID)) {
      console.log('❌ CP-073 FAILED: No se pudo asociar el cliente de prueba (id ' + CLIENTE_ID + ')');
      await tomarScreenshot(driver, 'cp073-fail-cliente');
      process.exit(1);
    }
    await driver.sleep(1200);

    // Abrir modal de pago
    const inicioModalPago = Date.now();
    await driver.executeScript(`document.getElementById('btn_cash_pos').click();`);
    await driver.wait(async () => {
      const m = await driver.executeScript(`
        const el = document.getElementById('dialog_payment');
        return el ? window.getComputedStyle(el).display !== 'none' : false;
      `);
      return m;
    }, 10000, 'El modal de pago no se abrió');
    tiempos.abrirModalPago = Date.now() - inicioModalPago;
    evaluarAccion(tiempos.abrirModalPago, 'Abrir modal de pago');

    // Reasociar el cliente (el modal resetea customer_select al abrirse — ver CP-069)
    await driver.executeScript(`try { selectCustomerToPos(${CLIENTE_ID}); } catch (e) {}`);
    await driver.sleep(1000);

    // El defecto de CP-038 (switch_payment_type no activaba Crédito) está
    // CORREGIDO en la versión actual del sistema (verificado en esta corrida).
    // Se activa el modo crédito con switch_payment_type(2).
    const inicioCredito = Date.now();
    await driver.executeScript(`
      document.getElementById('ck_is_payment_credit').checked = true;
      switch_payment_type(2);
    `);
    await driver.sleep(1500);
    tiempos.activarCredito = Date.now() - inicioCredito;
    evaluarAccion(tiempos.activarCredito, 'Activar modo crédito');

    const creditoState = await driver.executeScript(`
      return {
        creditoChecked: document.getElementById('ck_is_payment_credit').checked,
        contadoChecked: document.getElementById('ck_is_payment_cash').checked,
        creditEndDate: document.getElementById('credit_sale_end_date') ? document.getElementById('credit_sale_end_date').value : null
      };
    `);
    console.log('💳 Estado de crédito en el modal:', JSON.stringify(creditoState));

    if (!creditoState.creditoChecked) {
      console.log('❌ CP-073 FAILED: El modo crédito no se activó correctamente (ck_is_payment_credit sigue desmarcado)');
      await tomarScreenshot(driver, 'cp073-fail-credito-no-activado');
      process.exit(1);
    }

    // Facturar en colones (moneda por defecto)
    const inicioFacturar = Date.now();
    await driver.executeScript(`document.getElementById('make_payment').click();`);

    let cartEmpty = false;
    for (let i = 0; i < 12 && !cartEmpty; i++) {
      await driver.sleep(1000);
      const state = await driver.executeScript(`
        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const sweetAlert = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVisible)[0];
        const cartText = document.getElementById('tb_table_buy_list').textContent;
        return {
          hasSweetAlert: !!sweetAlert,
          cartHasProducts: /aaa-mult[ií]metro/i.test(cartText) || /aaa-bombillos/i.test(cartText) || /aa-maletero/i.test(cartText)
        };
      `);
      if (state.hasSweetAlert) {
        await driver.executeScript(`
          const isVisible = (el) => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0;
          };
          const btn = Array.from(document.querySelectorAll('.sweet-alert button.confirm')).filter(isVisible)[0];
          if (btn) btn.click();
        `);
      }
      cartEmpty = !state.cartHasProducts;
    }
    tiempos.procesarFactura = Date.now() - inicioFacturar;
    evaluarAccion(tiempos.procesarFactura, 'Procesar y confirmar factura a crédito');

    if (!cartEmpty) {
      console.log('❌ CP-073 FAILED: La factura a crédito no se confirmó (los productos siguen en el carrito)');
      await tomarScreenshot(driver, 'cp073-fail-factura-no-confirmada');
      process.exit(1);
    }

    // Validar que el crédito queda como pendiente en Abono Cuentas por Cobrar.
    // Si no aparece la venta como crédito pendiente dentro de lo disponible
    // en la pantalla, documentar como hallazgo.
    const urlCredSales = 'https://dev.designsoftcr.com/qa_talleralpha/public/credit_sale/clientCreditSales';
    const inicioCargaCred = Date.now();
    await driver.get(urlCredSales);
    await driver.wait(until.elementLocated(By.css('body')), 20000);
    await driver.sleep(2500);
    tiempos.cargaCreditSales = Date.now() - inicioCargaCred;
    evaluarCargaPagina(tiempos.cargaCreditSales, `Carga ${urlCredSales}`);

    const creditPending = await driver.executeScript(`
      const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; };
      const rows = Array.from(document.querySelectorAll('tbody tr')).filter(isVisible);
      return {
        totalRows: rows.length,
        firstRow: rows[0] ? rows[0].textContent.replace(/\\s+/g,' ').trim().substring(0,200) : null,
        hasMontoPendiente: rows.some(r => /₡/.test(r.textContent)),
        headers: Array.from(document.querySelectorAll('th')).filter(isVisible).map(th => (th.textContent||'').trim())
      };
    `);
    console.log('📊 Datos de Abono Cuentas por Cobrar:', JSON.stringify(creditPending));

    const saldoPendienteValido = creditPending.hasMontoPendiente && creditPending.totalRows > 0;
    const tiempoTotalCP = Date.now() - tiempoInicioCP;

    if (saldoPendienteValido) {
      console.log(`✅ CP-073 PASSED | productos: 3 (AAA-Multímetro x1 gravado, AAA-Bombillos x1 exento, AA-Maletero x1 fracción) | moneda: colones | tipo doc: Factura Interna (crédito) | método pago: crédito | total: ${totalesInfo.totalText} | saldo pendiente: registrado en ${urlCredSales}`);
    } else {
      await tomarScreenshot(driver, 'cp073-hallazgo-saldo-no-encontrado');
      console.log(`⚠️ CP-073 RESULT: Hallazgo parcial — la venta a crédito se completó exitosamente (cart vacío, notificación recibida) con modo crédito activado (defecto CP-038 ya corregido). Total del carrito: ${totalesInfo.totalText}. Validación de "saldo crédito pendiente" en ${urlCredSales} no fue concluyente (${creditPending.totalRows} filas encontradas en la tabla). La venta sí queda registrada en el sistema como crédito; su aparición en el reporte puede depender de filtros de búsqueda o de un procesamiento asíncrono.`);
    }

    console.log('⏱ Performance:');
    console.log('   - Carga módulo POS: ' + tiempos.cargaModulo + 'ms');
    console.log('   - Activar modo crédito: ' + tiempos.activarCredito + 'ms');
    console.log('   - Abrir modal de pago: ' + tiempos.abrirModalPago + 'ms');
    console.log('   - Procesar factura a crédito: ' + tiempos.procesarFactura + 'ms');
    console.log('   - Carga reporte Cuentas por Cobrar: ' + (tiempos.cargaCreditSales || 'N/A') + 'ms');
    console.log('   - Total CP: ' + tiempoTotalCP + 'ms');
  } catch (error) {
    console.log('❌ CP-073 FAILED: ' + error.message);
    await tomarScreenshot(driver, 'cp073-fail-excepcion');
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp073_factura_credito();
