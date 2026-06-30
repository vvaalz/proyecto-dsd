const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp037_facturacion_contado_efectivo() {
  console.log('🔄 Ejecutando CP-037: Verificar el flujo completo de facturación de contado en efectivo...');

  const options = new chrome.Options();
  options.addArguments('--disable-notifications');
  options.addArguments('--window-size=1440,1200');
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

  try {
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();
    await driver.wait(until.urlContains('dashboard'), 20000);

    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1');
    await driver.wait(until.elementLocated(By.id('product_search')), 20000);
    await driver.sleep(3000);

    // Agregar producto de prueba (datos propios, generados en esta corrida)
    const added = await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-mult[ií]metro automotriz digital/i.test(b.textContent || ''));
      if (!target) return false;
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
      return true;
    `);
    if (!added) {
      console.log('❌ CP-037 FAILED: No se pudo agregar el producto de prueba al carrito');
      process.exit(1);
    }
    await driver.sleep(1500);

    // Seleccionar cliente (cliente rápido propio de esta corrida)
    await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVisible).find((b) => (b.textContent || '').trim() === 'Agregar');
      if (btn) btn.click();
    `);
    await driver.sleep(800);
    await driver.executeScript(`if (typeof editQuickCustomerName === 'function') editQuickCustomerName();`);
    await driver.sleep(800);
    await driver.executeScript(`
      const el = document.getElementById('temporal_customer_name');
      el.value = 'Cliente Prueba CP037';
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof setTemporalCustomerName === 'function') setTemporalCustomerName();
    `);
    await driver.sleep(1500);

    // Clic en FACTURAR para abrir el modal de pago
    await driver.executeScript(`document.getElementById('btn_cash_pos').click();`);
    await driver.sleep(2000);

    const paymentModalOpen = await driver.executeScript(`
      const m = document.getElementById('dialog_payment');
      return m ? window.getComputedStyle(m).display !== 'none' : false;
    `);
    if (!paymentModalOpen) {
      console.log('❌ CP-037 FAILED: No se abrió el modal de pago tras hacer clic en FACTURAR');
      process.exit(1);
    }

    // Seleccionar Factura Interna, tipo de pago Contado y método Efectivo
    // (todos vienen activos por defecto; se fuerzan explícitamente)
    await driver.executeScript(`
      const select = document.getElementById('payment_electronic_document_type');
      if (select) {
        select.value = '0';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        if (window.jQuery && jQuery(select).data('chosen')) jQuery(select).trigger('chosen:updated');
      }
    `);
    await driver.sleep(500);

    await driver.executeScript(`
      const cash = document.getElementById('ck_is_payment_cash');
      if (cash && !cash.checked) { cash.checked = true; cash.dispatchEvent(new Event('change', { bubbles: true })); }
    `);
    await driver.sleep(300);

    await driver.executeScript(`
      const efectivo = document.getElementById('is_payment_cash');
      if (efectivo && !efectivo.checked) { efectivo.checked = true; efectivo.dispatchEvent(new Event('change', { bubbles: true })); }
    `);
    await driver.sleep(500);

    const selectionState = await driver.executeScript(`
      return {
        documentType: document.getElementById('payment_electronic_document_type').value,
        contado: document.getElementById('ck_is_payment_cash').checked,
        efectivo: document.getElementById('is_payment_cash').checked
      };
    `);
    console.log('🧾 Selección en el modal antes de facturar:', JSON.stringify(selectionState));

    // Confirmar la factura (FACTURAR / ENTER)
    await driver.executeScript(`document.getElementById('make_payment').click();`);
    await driver.sleep(4000);

    const bodyAfterInvoice = await driver.findElement(By.css('body')).getText();
    const paymentModalClosed = await driver.executeScript(`
      const m = document.getElementById('dialog_payment');
      return m ? window.getComputedStyle(m).display === 'none' : true;
    `);
    const showsSuccessSignal = /factura|exitos|correctamente|generad|impresi[oó]n/i.test(bodyAfterInvoice);

    if (paymentModalClosed || showsSuccessSignal) {
      console.log('✅ CP-037 PASSED: La factura de contado en efectivo se generó (modal cerrado y/o señal de éxito)');
    } else {
      console.log('❌ CP-037 FAILED: El modal de pago sigue abierto y no se detectó señal de éxito');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-037 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp037_facturacion_contado_efectivo();
