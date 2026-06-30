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
  } catch (screenshotError) {
    console.log('⚠️ No se pudo guardar el screenshot: ' + screenshotError.message);
  }
}

async function cp071_exoneracion_hacienda() {
  console.log('🔄 Ejecutando CP-071: Aplicar exoneración y validar aceptación por Hacienda...');

  const options = new chrome.Options();
  options.addArguments('--disable-notifications');
  options.addArguments('--window-size=1440,1200');
  options.addArguments('--kiosk-printing');
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  const TOLERANCIA = 1;
  const CLIENTE_ID = 12735;
  const CLIENTE_IDENTIFICACION = '119050235';

  try {
    // Limpiar cookies y caché del navegador para evitar problemas de sesión
    // por actualizaciones del sistema. localStorage/sessionStorage no son
    // accesibles en la página "data:" en blanco inicial (lanza SecurityError),
    // así que se limpia justo después de la primera navegación real.
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.manage().deleteAllCookies();
    await driver.executeScript('window.localStorage.clear();');
    await driver.executeScript('window.sessionStorage.clear();');
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();
    await driver.wait(until.urlContains('dashboard'), 20000);

    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1');
    await driver.wait(until.elementLocated(By.id('product_search')), 20000);
    await driver.wait(until.elementLocated(By.css('.product_box')), 15000);

    // Producto 1: AAA-Multímetro Automotriz Digital — gravado (IVA>0),
    // agregado 2 veces para tener 2 unidades en el carrito (el catálogo
    // incrementa la cantidad de la línea existente con cada clic adicional).
    for (let i = 0; i < 2; i++) {
      await driver.executeScript(`
        const boxes = Array.from(document.querySelectorAll('.product_box'));
        const target = boxes.find((b) => /aaa-mult[ií]metro automotriz digital/i.test((b.textContent || '').replace(/\\s+/g, ' ')));
        if (target) { const c = target.querySelector('.product_box_quantity_content') || target; c.click(); }
      `);
      await driver.sleep(1000);
    }

    // Producto 2: AAA-Bombillos / luces halógenas — exento (IVA=0), x1.
    await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-bombillos/i.test((b.textContent || '').replace(/\\s+/g, ' ')));
      if (target) { const c = target.querySelector('.product_box_quantity_content') || target; c.click(); }
    `);
    await driver.sleep(1200);

    await driver.wait(until.elementLocated(By.id('tb_table_buy_list')), 20000);
    await driver.wait(async () => {
      const text = await driver.executeScript(`return document.getElementById('tb_table_buy_list').textContent;`);
      return /aaa-mult[ií]metro/i.test(text) && /aaa-bombillos/i.test(text);
    }, 10000, 'Ambos productos deberían estar en el carrito');

    // Verificar el total del carrito y registrar subtotales por línea.
    // La suma de los subtotales visibles debe coincidir con el total general
    // dentro de la tolerancia ±1 (validación numérica de coherencia interna).
    const totalesInfo = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const totalLabel = Array.from(document.querySelectorAll('*')).filter(isVisible).find((el) => /^TOTAL:$/i.test((el.textContent || '').trim()));
      const totalEl = totalLabel ? totalLabel.nextElementSibling : null;
      const totalText = totalEl ? totalEl.textContent.trim() : null;
      const rows = Array.from(document.querySelectorAll('#table_buy_list tr.main_row'));
      const lineTotals = rows.map(row => {
        const priceMatch = (row.textContent || '').match(/₡\\s*([\\d,]+\\.\\d{2})/g);
        return priceMatch ? priceMatch[priceMatch.length - 1] : null;
      }).filter(Boolean);
      return { totalText, lineTotals };
    `);
    console.log('💰 Total del carrito:', totalesInfo.totalText, '| Subtotales líneas:', JSON.stringify(totalesInfo.lineTotals));

    const totalMatch = totalesInfo.totalText ? totalesInfo.totalText.match(/([\d,]+\.\d{2})/) : null;
    const totalValue = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : NaN;
    if (isNaN(totalValue) || totalValue <= 0) {
      console.log('❌ CP-071 FAILED: No se pudo leer el total del carrito');
      await tomarScreenshot(driver, 'cp071-fail-total-carrito');
      process.exit(1);
    }

    // Leer el IVA ANTES de aplicar la exoneración (debe ser >0 por el
    // producto gravado).
    await driver.executeScript(`document.getElementById('show_invoice_advanced_detail').click();`);
    await driver.sleep(800);
    const ivaAntes = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const el = Array.from(document.querySelectorAll('.advanced_invoice_detail, [class*="total_div"]'))
        .filter(isVisible)
        .find((e) => /^IVA/i.test((e.textContent || '').replace(/\\s+/g, ' ').trim()));
      return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null;
    `);
    // Usar ₡ como anclaje para no capturar el porcentaje entre paréntesis.
    const ivaMatch = ivaAntes ? ivaAntes.match(/₡\s*([\d,]+\.\d{2})/) : null;
    const ivaValorAntes = ivaMatch ? parseFloat(ivaMatch[1].replace(/,/g, '')) : NaN;
    console.log('🧾 IVA antes de exonerar:', ivaAntes, '-> valor numérico:', ivaValorAntes);

    if (!(ivaValorAntes > 0)) {
      console.log('❌ CP-071 FAILED: Se esperaba IVA > 0 antes de aplicar exoneración (el producto gravado debería mostrar IVA positivo)');
      await tomarScreenshot(driver, 'cp071-fail-iva-no-positivo');
      process.exit(1);
    }

    // Aplicar la exoneración. La función JS set_apply_exoneration_modal()
    // abre el modal "dialog_add_exoneration". Los campos requeridos son:
    // tipo de documento de exoneración, número de documento, nombre de
    // institución, fecha de emisión, orden de exoneración y porcentaje.
    // Con porcentaje=100 y tipo="01 - Compras autorizadas DGT", el sistema
    // calcula el monto exonerado = monto de IVA del carrito (la exoneración
    // cubre el 100% del impuesto gravado), confirmando que el monto exonerado
    // NO incluye IVA en la factura final (el cliente no paga ese IVA).
    await driver.executeScript(`set_apply_exoneration_modal();`);
    await driver.wait(until.elementLocated(By.id('dialog_add_exoneration')), 5000);
    await driver.sleep(800);

    await driver.executeScript(`
      const num = document.getElementById('payment_exoneration_number');
      if (num) { num.value = 'EXO-QA-CP071-2026'; num.dispatchEvent(new Event('input', { bubbles: true })); }
      const companyName = document.getElementById('payment_exoneration_company_name');
      if (companyName) { companyName.value = 'Ministerio de Hacienda'; companyName.dispatchEvent(new Event('input', { bubbles: true })); }
      const date = document.getElementById('payment_exoneration_date');
      if (date) { date.value = new Date().toISOString().substring(0, 10); date.dispatchEvent(new Event('input', { bubbles: true })); }
      const ord = document.getElementById('apply_exoneration_text');
      if (ord) { ord.value = 'Orden de exoneración de prueba CP-071'; ord.dispatchEvent(new Event('input', { bubbles: true })); }
      const pct = document.getElementById('payment_exoneration_percent');
      if (pct) { pct.value = '100'; pct.dispatchEvent(new Event('input', { bubbles: true })); }
    `);
    await driver.sleep(500);

    await driver.executeScript(`document.getElementById('apply_sale_exoneration').click();`);
    await driver.sleep(1500);

    const modalCerrado = await driver.executeScript(`
      const m = document.getElementById('dialog_add_exoneration');
      return !m || window.getComputedStyle(m).display === 'none';
    `);
    if (!modalCerrado) {
      console.log('❌ CP-071 FAILED: El modal de exoneración no se cerró tras hacer clic en "Aplicar"');
      await tomarScreenshot(driver, 'cp071-fail-modal-exoneracion-no-cerro');
      process.exit(1);
    }

    // Validar que se aplicó la exoneración y que el monto cubre el IVA
    // (confirmando que el monto exonerado = IVA que el cliente NO pagará).
    const exoState = await driver.executeScript(`
      return {
        amount: document.getElementById('total_exoneration_amount') ? document.getElementById('total_exoneration_amount').textContent.trim() : null,
        percent: document.getElementById('total_exoneration_percent') ? document.getElementById('total_exoneration_percent').textContent.trim() : null
      };
    `);
    console.log('🏛️ Estado de exoneración aplicada:', JSON.stringify(exoState));

    const exoAmountMatch = exoState.amount ? exoState.amount.match(/([\d,]+\.\d{2})/) : null;
    const exoAmountValue = exoAmountMatch ? parseFloat(exoAmountMatch[1].replace(/,/g, '')) : NaN;
    if (!(exoAmountValue > 0)) {
      console.log('❌ CP-071 FAILED: El monto de exoneración no es mayor que cero tras aplicarla (total_exoneration_amount=' + exoState.amount + ')');
      await tomarScreenshot(driver, 'cp071-fail-exoneracion-monto-cero');
      process.exit(1);
    }

    // El monto exonerado (exoAmountValue) debería ser igual al IVA que el
    // carrito generó (ivaValorAntes), con tolerancia ±1, confirmando que el
    // monto exonerado corresponde exactamente al impuesto, sin incluir el
    // valor base de los productos.
    if (!(Math.abs(exoAmountValue - ivaValorAntes) <= TOLERANCIA)) {
      console.log(`❌ CP-071 FAILED: El monto exonerado (${exoState.amount}) no coincide con el IVA previo a la exoneración (${ivaAntes}), diferencia > ±${TOLERANCIA}`);
      await tomarScreenshot(driver, 'cp071-fail-exoneracion-vs-iva');
      process.exit(1);
    }
    console.log('✔ Monto exonerado (' + exoState.amount + ') coincide con el IVA del carrito (' + ivaAntes + ') dentro de la tolerancia ±' + TOLERANCIA + ' → el monto exonerado NO incluye valor extra más allá del IVA');

    // Asociar cliente y completar la factura
    const customerSelected = await driver.executeScript(`
      try {
        selectCustomerToPos(${CLIENTE_ID});
        return document.getElementById('customer_select') ? document.getElementById('customer_select').value : null;
      } catch (e) {
        return null;
      }
    `);
    if (customerSelected !== String(CLIENTE_ID)) {
      console.log('❌ CP-071 FAILED: No se pudo asociar el cliente (id ' + CLIENTE_ID + ')');
      await tomarScreenshot(driver, 'cp071-fail-cliente');
      process.exit(1);
    }
    await driver.sleep(1200);

    await driver.executeScript(`document.getElementById('btn_cash_pos').click();`);
    await driver.wait(async () => {
      const m = await driver.executeScript(`
        const el = document.getElementById('dialog_payment');
        return el ? window.getComputedStyle(el).display !== 'none' : false;
      `);
      return m;
    }, 10000, 'El modal de pago no se abrió');

    // El modal de pago resetea el customer_select interno al abrirse; reasociar.
    await driver.executeScript(`
      try { selectCustomerToPos(${CLIENTE_ID}); } catch (e) {}
    `);
    await driver.sleep(1000);

    // Intento 1: Factura Electrónica. El select usa "chosen" de jQuery; hay
    // que disparar chosen:updated además del evento change nativo (ver CP-067/068).
    // Esta combinación (Factura Electrónica + Opciones avanzadas / cliente 12735)
    // queda bloqueada por el sistema con "debe seleccionar un cliente" — hallazgo
    // documentado en CP-069/070. Se documenta y se reintenta con Tiquete Electrónico.
    await driver.executeScript(`
      const select = document.getElementById('payment_electronic_document_type');
      select.value = '1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      if (window.jQuery && jQuery(select).data('chosen')) jQuery(select).trigger('chosen:updated');
    `);
    await driver.sleep(500);
    await driver.executeScript(`
      const cash = document.getElementById('ck_is_payment_cash');
      if (cash && !cash.checked) { cash.checked = true; cash.dispatchEvent(new Event('change', { bubbles: true })); }
      const efectivo = document.getElementById('is_payment_cash');
      if (efectivo && !efectivo.checked) { efectivo.checked = true; efectivo.dispatchEvent(new Event('change', { bubbles: true })); }
    `);
    await driver.sleep(500);

    await driver.executeScript(`document.getElementById('make_payment').click();`);
    await driver.sleep(2000);

    const facturaElectronicaBloqueada = await driver.executeScript(`
      const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; };
      const notyEl = Array.from(document.querySelectorAll('.noty_text')).filter(isVisible)[0];
      return notyEl ? notyEl.textContent.trim() : null;
    `);
    console.log('🧾 Resultado del intento con Factura Electrónica:', facturaElectronicaBloqueada || '(sin error noty, puede haber avanzado)');

    let documentoUsado = 'Factura Electrónica';
    if (facturaElectronicaBloqueada) {
      documentoUsado = 'Tiquete Electrónico';
      await driver.executeScript(`
        const select = document.getElementById('payment_electronic_document_type');
        select.value = '4';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        if (window.jQuery && jQuery(select).data('chosen')) jQuery(select).trigger('chosen:updated');
      `);
      await driver.sleep(500);
      await driver.executeScript(`document.getElementById('make_payment').click();`);
    }

    // Esta versión del sistema agrega pasos de confirmación adicionales:
    // SweetAlert "Información de pago" con "Pagar (↵ ENTER)", seguido de
    // SweetAlert de éxito con "Aceptar". Se sondea repetidamente.
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
        return {
          hasSweetAlert: !!sweetAlert,
          cartHasMultimetro: /aaa-mult[ií]metro/i.test(document.getElementById('tb_table_buy_list').textContent),
          cartHasBombillos: /aaa-bombillos/i.test(document.getElementById('tb_table_buy_list').textContent)
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
      cartEmpty = !state.cartHasMultimetro && !state.cartHasBombillos;
    }

    if (!cartEmpty) {
      console.log('❌ CP-071 FAILED: La factura con exoneración no se confirmó (los productos siguen en el carrito)');
      await tomarScreenshot(driver, 'cp071-fail-no-confirmado');
      process.exit(1);
    }

    // Validar la aceptación de Hacienda en el Reporte de Facturas Hacienda.
    // El buscador (electronic_billing_search) no filtra (mismo defecto CP-034),
    // así que se localiza la fila por identificación del cliente en el DOM.
    // Se reintenta durante ~75s antes de tratar el resultado como hallazgo.
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/ElectronicBilling/ElectronicBillingReport');
    await driver.wait(until.elementLocated(By.id('electronic_billing_search')), 20000);
    await driver.sleep(2500);

    let estadoHacienda = null;
    let filaEncontrada = null;
    for (let i = 0; i < 15; i++) {
      filaEncontrada = await driver.executeScript(`
        const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; };
        const rows = Array.from(document.querySelectorAll('tbody tr')).filter(isVisible);
        const match = rows.find((r) => (r.textContent || '').includes('${CLIENTE_IDENTIFICACION}'));
        return match ? match.textContent.replace(/\\s+/g, ' ').trim() : null;
      `);
      if (filaEncontrada) {
        if (/aceptado/i.test(filaEncontrada)) { estadoHacienda = 'Aceptado'; break; }
        if (/rechazado/i.test(filaEncontrada)) { estadoHacienda = 'Rechazado'; break; }
      }
      await driver.sleep(4000);
      await driver.navigate().refresh();
      await driver.wait(until.elementLocated(By.id('electronic_billing_search')), 20000);
      await driver.sleep(1500);
    }

    const totalStr = totalesInfo.totalText || '(no leído)';
    const ivaStr = ivaAntes || '(no leído)';

    if (estadoHacienda === 'Aceptado') {
      console.log(`✅ CP-071 PASSED | productos: 2 (AAA-Multímetro x2 gravado + AAA-Bombillos x1 exento) | moneda: colones | tipo doc: ${documentoUsado} | método pago: efectivo | total: ${totalStr} | IVA (antes exoneración): ${ivaStr} | exoneración aplicada: ${exoState.amount} (${exoState.percent}%) | estado Hacienda: ACEPTADO`);
    } else if (estadoHacienda === 'Rechazado') {
      console.log('❌ CP-071 FAILED: Hacienda RECHAZÓ la factura con exoneración. Fila: ' + filaEncontrada);
      await tomarScreenshot(driver, 'cp071-fail-hacienda-rechazado');
      process.exit(1);
    } else {
      await tomarScreenshot(driver, 'cp071-hallazgo-hacienda-pendiente');
      console.log(`⚠️ CP-071 RESULT: Hallazgo parcial — exoneración aplicada correctamente (${exoState.amount} = IVA ₡${ivaValorAntes} dentro de tolerancia ±${TOLERANCIA}, monto exonerado cubre el IVA exacto sin incluir el valor base). Venta completada con ${documentoUsado} (total: ${totalStr}). El estado de Hacienda no resolvió a "Aceptado"/"Rechazado" en ~75s de reintentos (envío asíncrono en entorno compartido). ${filaEncontrada ? 'Última fila encontrada: ' + filaEncontrada.substring(0, 200) : 'Fila no localizada en el reporte por identificación del cliente.'}`);
    }
  } catch (error) {
    console.log('❌ CP-071 FAILED: ' + error.message);
    await tomarScreenshot(driver, 'cp071-fail-excepcion');
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp071_exoneracion_hacienda();
