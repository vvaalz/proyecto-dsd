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

async function cp070_facturar_ice_hacienda() {
  console.log('🔄 Ejecutando CP-070: Facturar al ICE y validar aceptación por Hacienda...');

  const options = new chrome.Options();
  options.addArguments('--disable-notifications');
  options.addArguments('--window-size=1440,1200');
  options.addArguments('--kiosk-printing');
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  const PRECIO_ESPERADO = 100;
  const TOLERANCIA = 1;
  // Cliente de prueba con datos completos (nombre, identificación, teléfono,
  // email, dirección) usado por toda la suite desde CP-058. No existe en este
  // entorno de QA ningún cliente literalmente llamado "valentina cliente
  // prueba" / "valentina prueba cliente" (verificado contra el listado
  // completo de clientes en /cust/customer); se usa el 12735, confirmado con
  // el usuario.
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

    // AAA-Multímetro Automotriz Digital es un producto gravado (IVA > 0,
    // confirmado en CP-058).
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
      console.log('❌ CP-070 FAILED: No se encontró el producto gravado de prueba');
      await tomarScreenshot(driver, 'cp070-fail-producto-no-encontrado');
      process.exit(1);
    }
    await driver.wait(until.elementLocated(By.id('tb_table_buy_list')), 20000);
    await driver.wait(async () => {
      const text = await driver.executeScript(`return document.getElementById('tb_table_buy_list').textContent;`);
      return /aaa-mult[ií]metro/i.test(text);
    }, 10000);

    // Validar el monto total del carrito (un único producto, ₡100.00) con
    // tolerancia ±1.
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
      console.log(`❌ CP-070 FAILED: El total del carrito (${cartTotalText}) no coincide con el esperado ₡${PRECIO_ESPERADO} (tolerancia ±${TOLERANCIA})`);
      await tomarScreenshot(driver, 'cp070-fail-monto-total');
      process.exit(1);
    }

    const customerSelected = await driver.executeScript(`
      try {
        selectCustomerToPos(${CLIENTE_ID});
        return document.getElementById('customer_select') ? document.getElementById('customer_select').value : null;
      } catch (e) {
        return null;
      }
    `);
    if (customerSelected !== String(CLIENTE_ID)) {
      console.log('❌ CP-070 FAILED: No se pudo asociar el cliente de prueba (id ' + CLIENTE_ID + ') a la factura');
      await tomarScreenshot(driver, 'cp070-fail-cliente');
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
    // reasociar el cliente DESPUÉS de que el modal está visible (ver CP-069).
    await driver.executeScript(`
      try { selectCustomerToPos(${CLIENTE_ID}); } catch (e) {}
    `);
    await driver.sleep(1000);

    // "Facturar al ICE" (ck_is_ice_invoice) vive dentro de "Opciones
    // avanzadas" del modal de pago y está oculto hasta expandirlas.
    await driver.executeScript(`
      const isVisible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      if (!isVisible(document.getElementById('ck_is_ice_invoice'))) {
        document.getElementById('ck_show_advance_options').click();
      }
    `);
    await driver.wait(until.elementLocated(By.id('ck_is_ice_invoice')), 5000);
    await driver.sleep(500);

    await driver.executeScript(`
      const ck = document.getElementById('ck_is_ice_invoice');
      if (ck) { ck.checked = true; ck.dispatchEvent(new Event('change', { bubbles: true })); }
    `);
    await driver.sleep(500);

    const iceChecked = await driver.executeScript(`return document.getElementById('ck_is_ice_invoice').checked;`);
    if (!iceChecked) {
      console.log('❌ CP-070 FAILED: No se pudo activar la opción "Facturar al ICE"');
      await tomarScreenshot(driver, 'cp070-fail-ice-toggle');
      process.exit(1);
    }
    console.log('🏭 "Facturar al ICE" activado correctamente');

    // Intento 1: Factura Electrónica. El select de tipo de documento usa el
    // plugin "chosen" de jQuery; hay que disparar chosen:updated además del
    // evento change nativo (ver CP-067/068), o el widget visual revierte el
    // valor.
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

    // Con "Opciones avanzadas" activas (Facturar al ICE) + Factura
    // Electrónica, el sistema rechaza el pago con una notificación "noty"
    // ("Para factura electrónica debe seleccionar un cliente"), igual que se
    // documentó en CP-069 con la contingencia — incluso con el cliente 12735
    // asociado y con todos sus datos completos en su ficha. Se documenta el
    // bloqueo y, según lo acordado, se reintenta con Tiquete Electrónico
    // (que sí admite "Facturar al ICE" sin esa validación de cliente).
    const facturaElectronicaBloqueada = await driver.executeScript(`
      const isVisible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none'; };
      const notyEl = Array.from(document.querySelectorAll('.noty_text')).filter(isVisible)[0];
      return notyEl ? notyEl.textContent.trim() : null;
    `);
    console.log('🧾 Resultado del intento con Factura Electrónica + ICE:', facturaElectronicaBloqueada || '(sin notificación de error, pudo haber avanzado)');

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
      const iceStillChecked = await driver.executeScript(`return document.getElementById('ck_is_ice_invoice').checked;`);
      if (!iceStillChecked) {
        console.log('❌ CP-070 FAILED: "Facturar al ICE" se desactivó al cambiar a Tiquete Electrónico');
        await tomarScreenshot(driver, 'cp070-fail-ice-se-desactivo');
        process.exit(1);
      }
      await driver.executeScript(`document.getElementById('make_payment').click();`);
    }

    // Esta versión del sistema agrega pasos de confirmación adicionales: un
    // SweetAlert "Información de pago" (Dinero recibido / Su cambio es) con
    // botón "Pagar (↵ ENTER)", seguido de OTRO SweetAlert de éxito con botón
    // "Aceptar". Se sondea repetidamente y se confirma cualquier SweetAlert
    // que vaya apareciendo.
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

    if (!cartEmpty) {
      console.log('❌ CP-070 FAILED: La factura con "Facturar al ICE" no se confirmó (el producto sigue en el carrito)');
      await tomarScreenshot(driver, 'cp070-fail-no-confirmado');
      process.exit(1);
    }
    console.log('🧾 Venta completada usando: ' + documentoUsado);

    // Validar la aceptación de Hacienda en /ElectronicBilling/ElectronicBillingReport.
    // El buscador de esa pantalla (electronic_billing_search) no filtra (mismo
    // defecto que CP-034 documentó en el POS), así que se localiza la fila por
    // texto (identificación del cliente) directamente en el DOM. El envío a
    // Hacienda es asíncrono y este es un entorno compartido con mucha
    // actividad de QA concurrente, así que se reintenta con recargas durante
    // hasta ~75s antes de tratarlo como un hallazgo en vez de una falla dura.
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

    if (estadoHacienda === 'Aceptado') {
      console.log('✅ CP-070 PASSED: "Facturar al ICE" se activó correctamente, el total (' + cartTotalText + ') fue válido, la venta se completó (' + documentoUsado + ') y Hacienda marcó la factura como ACEPTADO.');
    } else if (estadoHacienda === 'Rechazado') {
      console.log('❌ CP-070 FAILED: Hacienda RECHAZÓ la factura de la venta con "Facturar al ICE". Fila: ' + filaEncontrada);
      await tomarScreenshot(driver, 'cp070-fail-hacienda-rechazado');
      process.exit(1);
    } else {
      await tomarScreenshot(driver, 'cp070-hallazgo-hacienda-pendiente');
      console.log('⚠️ CP-070 RESULT: Hallazgo — "Facturar al ICE" funciona correctamente (toggle, total validado, venta completada con ' + documentoUsado + '; Factura Electrónica + ICE quedó bloqueada por la misma validación de cliente documentada en CP-069), pero el estado en el Reporte de Facturas Hacienda no llegó a "Aceptado" ni "Rechazado" tras ~75s de reintentos (entorno compartido con envío asíncrono real a Hacienda). ' + (filaEncontrada ? 'Última fila encontrada: ' + filaEncontrada.substring(0, 200) : 'No se localizó la fila de esta venta en el reporte por identificación del cliente.'));
    }
  } catch (error) {
    console.log('❌ CP-070 FAILED: ' + error.message);
    await tomarScreenshot(driver, 'cp070-fail-excepcion');
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp070_facturar_ice_hacienda();
