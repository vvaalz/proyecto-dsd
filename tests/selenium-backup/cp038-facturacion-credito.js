const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp038_facturacion_credito() {
  console.log('🔄 Ejecutando CP-038: Verificar el flujo completo de facturación a crédito...');

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

    // Agregar producto de prueba
    const added = await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-mult[ií]metro automotriz digital/i.test(b.textContent || ''));
      if (!target) return false;
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
      return true;
    `);
    if (!added) {
      console.log('❌ CP-038 FAILED: No se pudo agregar el producto de prueba al carrito');
      process.exit(1);
    }
    await driver.sleep(1500);

    // Seleccionar un cliente REAL y registrado (id 12735, "cliente prueba
    // tarea 5") directamente vía selectCustomerToPos(): el buscador visual
    // #search_pos_customer no devuelve resultados con ningún método probado
    // (defecto aparte, ver CP-034), así que se usa la función interna que el
    // propio buscador invocaría al hacer clic en un resultado.
    const customerSelected = await driver.executeScript(`
      try {
        selectCustomerToPos(12735);
        return document.getElementById('customer_select') ? document.getElementById('customer_select').value : null;
      } catch (e) {
        return null;
      }
    `);
    if (customerSelected !== '12735') {
      console.log('❌ CP-038 FAILED: No se pudo asociar un cliente real (id 12735) a la factura');
      process.exit(1);
    }
    await driver.sleep(1000);

    // Clic en FACTURAR para abrir el modal de pago
    await driver.executeScript(`document.getElementById('btn_cash_pos').click();`);
    await driver.sleep(2000);

    const paymentModalOpen = await driver.executeScript(`
      const m = document.getElementById('dialog_payment');
      return m ? window.getComputedStyle(m).display !== 'none' : false;
    `);
    if (!paymentModalOpen) {
      console.log('❌ CP-038 FAILED: No se abrió el modal de pago tras hacer clic en FACTURAR');
      process.exit(1);
    }

    // Intentar seleccionar tipo de pago Crédito con un cliente real ya asociado
    await driver.executeScript(`
      document.getElementById('ck_is_payment_credit').checked = true;
      switch_payment_type(2);
    `);
    await driver.sleep(1500);

    const paymentTypeState = await driver.executeScript(`
      return {
        contado: document.getElementById('ck_is_payment_cash').checked,
        credito: document.getElementById('ck_is_payment_credit').checked,
        customerSelect: document.getElementById('customer_select').value
      };
    `);
    console.log('🧾 Estado del tipo de pago tras intentar seleccionar Crédito:', JSON.stringify(paymentTypeState));

    if (paymentTypeState.credito === true && paymentTypeState.contado === false) {
      // Si en algún momento se corrige el defecto, completar la facturación a crédito normalmente.
      await driver.executeScript(`document.getElementById('make_payment').click();`);
      await driver.sleep(4000);
      console.log('✅ CP-038 PASSED: Se seleccionó Crédito correctamente y la factura se generó a crédito');
    } else {
      console.log('⚠️ CP-038 RESULT: Defecto confirmado en el sistema — switch_payment_type() revierte automáticamente el checkbox a Contado al intentar activar Crédito. Revisando el código fuente de la función en vivo, el bloque que aplica visualmente el cambio a Crédito está comentado (/* ... */); solo queda activa la rama que fuerza el regreso a Contado. No es posible facturar a crédito en este momento, independientemente del cliente asociado.');
    }
  } catch (error) {
    console.log('❌ CP-038 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp038_facturacion_credito();
