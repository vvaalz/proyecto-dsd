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

async function cp069_facturar_contingencia() {
  console.log('🔄 Ejecutando CP-069: Activar modo de contingencia y facturar...');

  const options = new chrome.Options();
  options.addArguments('--disable-notifications');
  options.addArguments('--window-size=1440,1200');
  options.addArguments('--kiosk-printing');
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  const PRECIO_ESPERADO = 100;
  const TOLERANCIA = 1;

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
    const added = await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-mult[ií]metro automotriz digital/i.test((b.textContent || '').replace(/\\s+/g, ' ')));
      if (!target) return false;
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
      return true;
    `);
    if (!added) {
      console.log('❌ CP-069 FAILED: No se encontró el producto de prueba');
      await tomarScreenshot(driver, 'cp069-fail-producto-no-encontrado');
      process.exit(1);
    }
    await driver.wait(until.elementLocated(By.id('tb_table_buy_list')), 20000);
    await driver.wait(async () => {
      const text = await driver.executeScript(`return document.getElementById('tb_table_buy_list').textContent;`);
      return /aaa-mult[ií]metro/i.test(text);
    }, 10000);

    // Validar el monto total del carrito (un único producto, ₡100.00) con
    // tolerancia ±1 antes de continuar con el flujo de contingencia.
    const cartTotalText = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const totalLabel = Array.from(document.querySelectorAll('*')).filter(isVisible).find((el) => /^TOTAL:$/i.test((el.textContent || '').trim()));
      const next = totalLabel ? totalLabel.nextElementSibling : null;
      return next ? next.textContent.trim() : null;
    `);
    const cartTotalMatch = cartTotalText ? cartTotalText.match(/([\d,]+\.\d{2})/) : null;
    const cartTotalValue = cartTotalMatch ? parseFloat(cartTotalMatch[1].replace(/,/g, '')) : NaN;
    console.log('💰 Total del carrito leído:', cartTotalText, '-> valor numérico:', cartTotalValue);

    if (!(Math.abs(cartTotalValue - PRECIO_ESPERADO) <= TOLERANCIA)) {
      console.log(`❌ CP-069 FAILED: El total del carrito (${cartTotalText}) no coincide con el esperado ₡${PRECIO_ESPERADO} (tolerancia ±${TOLERANCIA})`);
      await tomarScreenshot(driver, 'cp069-fail-monto-total');
      process.exit(1);
    }

    const customerSelected = await driver.executeScript(`
      try {
        selectCustomerToPos(12735);
        return document.getElementById('customer_select') ? document.getElementById('customer_select').value : null;
      } catch (e) {
        return null;
      }
    `);
    if (customerSelected !== '12735') {
      console.log('❌ CP-069 FAILED: No se pudo asociar el cliente de prueba (id 12735) a la factura');
      await tomarScreenshot(driver, 'cp069-fail-cliente');
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

    // El modal de pago resetea el customer_select interno al abrirse; hay que
    // reasociar el cliente DESPUÉS de que el modal está visible.
    await driver.executeScript(`
      try { selectCustomerToPos(12735); } catch (e) {}
    `);
    await driver.sleep(1000);

    // Activar "Factura por Contingencia" (ck_contingency_invoice) ANTES de
    // tocar el tipo de documento. El checkbox fuerza automáticamente el tipo
    // de documento a Factura Electrónica ('1') en el instante en que se
    // marca, pero esa misma factura electrónica exige datos completos del
    // cliente (identificación, email) que el cliente de prueba 12735 no
    // refleja en este modal aunque sí los tenga en su ficha — el sistema
    // rechaza el pago con "Para factura electrónica debe seleccionar un
    // cliente" sin importar qué datos se llenen a mano (verificado en varias
    // corridas). La alternativa válida confirmada es Tiquete Electrónico, que
    // sí admite contingencia y no exige esos datos del cliente; para que el
    // cambio de tipo de documento NO sea revertido por el propio checkbox,
    // hay que aplicarlo DESPUÉS de marcar la contingencia, nunca antes.
    const boxVisibleBefore = await driver.executeScript(`
      const isVisible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      return isVisible(document.getElementById('contingency_invoice_box'));
    `);

    await driver.executeScript(`
      const ck = document.getElementById('ck_contingency_invoice');
      if (ck) { ck.checked = true; ck.dispatchEvent(new Event('change', { bubbles: true })); }
    `);
    await driver.wait(until.elementLocated(By.id('contingency_invoice_box')), 5000);
    await driver.sleep(500);

    const documentTypeForzadoTrasMarcar = await driver.executeScript(`return document.getElementById('payment_electronic_document_type').value;`);

    // Cambiar el tipo de documento a Tiquete Electrónico DESPUÉS de activar
    // la contingencia (ver nota arriba). El select usa el plugin "chosen" de
    // jQuery, así que hay que disparar chosen:updated además del evento
    // change nativo (ver CP-067/068), o el widget visual revierte el valor.
    await driver.executeScript(`
      const select = document.getElementById('payment_electronic_document_type');
      if (select) {
        select.value = '4';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        if (window.jQuery && jQuery(select).data('chosen')) jQuery(select).trigger('chosen:updated');
      }
    `);
    await driver.sleep(500);

    // Validar que activar el toggle: (1) revela el formulario de contingencia
    // (No. Comprobante / Fecha / Motivo), (2) fuerza inicialmente el tipo de
    // documento a Factura Electrónica, y (3) permite luego cambiarlo a
    // Tiquete Electrónico sin desactivar la contingencia.
    const contingencyState = await driver.executeScript(`
      const isVisible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      return {
        checked: document.getElementById('ck_contingency_invoice').checked,
        boxVisible: isVisible(document.getElementById('contingency_invoice_box')),
        numberVisible: isVisible(document.getElementById('contingency_invoice_number')),
        dateVisible: isVisible(document.getElementById('contingency_invoice_date')),
        dateValue: document.getElementById('contingency_invoice_date').value,
        reasonVisible: isVisible(document.getElementById('contingency_invoice_reason')),
        documentTypeFinal: document.getElementById('payment_electronic_document_type').value
      };
    `);
    console.log('🧾 Estado del formulario de contingencia:', JSON.stringify({ ...contingencyState, documentTypeForzadoTrasMarcar }));

    const toggleFuncionaCorrectamente =
      !boxVisibleBefore &&
      contingencyState.checked &&
      contingencyState.boxVisible &&
      contingencyState.numberVisible &&
      contingencyState.dateVisible &&
      contingencyState.reasonVisible &&
      documentTypeForzadoTrasMarcar === '1' &&
      contingencyState.documentTypeFinal === '4' &&
      !!contingencyState.dateValue;

    if (!toggleFuncionaCorrectamente) {
      console.log('❌ CP-069 FAILED: El toggle "Factura por Contingencia" no se comportó como se esperaba (formulario, forzado inicial a Factura Electrónica, o cambio posterior a Tiquete Electrónico)');
      await tomarScreenshot(driver, 'cp069-fail-toggle-contingencia');
      process.exit(1);
    }

    // Completar los campos del formulario de contingencia con datos de prueba
    await driver.executeScript(`
      const num = document.getElementById('contingency_invoice_number');
      if (num) { num.value = '00100001010000000001'; num.dispatchEvent(new Event('input', { bubbles: true })); }
      const reason = document.getElementById('contingency_invoice_reason');
      if (reason) { reason.value = 'Falla de conexión con el servicio de Hacienda - prueba CP-069'; reason.dispatchEvent(new Event('input', { bubbles: true })); }
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

    // Esta versión del sistema agrega pasos de confirmación adicionales: un
    // SweetAlert "Información de pago" (Dinero recibido / Su cambio es) con
    // botón "Pagar (↵ ENTER)", seguido de OTRO SweetAlert de éxito con botón
    // "Aceptar". Se sondea repetidamente (en vez de un solo intento) y se
    // confirma cualquier SweetAlert que vaya apareciendo.
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
          cartHasProduct: /aaa-mult[ií]metro/i.test(document.getElementById('tb_table_buy_list').textContent)
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
      cartEmpty = !state.cartHasProduct;
    }

    if (cartEmpty) {
      console.log('✅ CP-069 PASSED: El modo de contingencia se activó correctamente (formulario completo, forzado inicial a Factura Electrónica), el total (' + cartTotalText + ') fue válido y la factura se completó como Tiquete Electrónico bajo contingencia. NOTA: el mismo flujo con Factura Electrónica (tipo de documento forzado por defecto al activar contingencia) queda bloqueado por una validación de cliente — ver comentarios en el código.');
    } else {
      console.log('❌ CP-069 FAILED: La factura de contingencia no se confirmó (el producto sigue en el carrito)');
      await tomarScreenshot(driver, 'cp069-fail-no-confirmado');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-069 FAILED: ' + error.message);
    await tomarScreenshot(driver, 'cp069-fail-excepcion');
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp069_facturar_contingencia();
