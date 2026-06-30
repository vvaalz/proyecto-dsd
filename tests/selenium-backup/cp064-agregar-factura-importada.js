const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp064_agregar_factura_importada() {
  console.log('🔄 Ejecutando CP-064: Agregar productos a una factura importada y luego facturar...');

  const options = new chrome.Options();
  options.addArguments('--disable-notifications');
  options.addArguments('--window-size=1440,1200');
  options.addArguments('--kiosk-printing');
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

  try {
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
    await driver.sleep(2000);

    // (F5) Importar factura: abrir el detalle de la primera factura del
    // historial y usar el botón "IMPORTAR" (add_pos_invoice_import_to_table)
    // para traer sus líneas al carrito.
    await driver.executeScript(`document.getElementById('btn_import_invoice_option').click();`);
    await driver.sleep(2500);

    const showViewOnclick = await driver.executeScript(`
      const el = document.querySelector('[onclick^="show_invoice_import_view"]');
      return el ? el.getAttribute('onclick') : null;
    `);
    if (!showViewOnclick) {
      console.log('❌ CP-064 FAILED: No se encontró ninguna factura en el historial de (F5) Importar factura');
      process.exit(1);
    }
    await driver.executeScript(showViewOnclick);
    await driver.wait(until.elementLocated(By.id('dialog_invoice_import_detail_view')), 10000);
    await driver.sleep(1500);

    const importOnclick = await driver.executeScript(`
      const modal = document.getElementById('dialog_invoice_import_detail_view');
      if (!modal) return null;
      const btn = Array.from(modal.querySelectorAll('a.import-button')).find((a) => /importar/i.test(a.textContent || ''));
      return btn ? btn.getAttribute('onclick') : null;
    `);
    if (!importOnclick) {
      console.log('❌ CP-064 FAILED: No se encontró el botón "IMPORTAR" en el detalle de la factura');
      process.exit(1);
    }
    await driver.executeScript(importOnclick);
    await driver.sleep(2000);

    // Volver a (F1) POS Facturación para ver el carrito con las líneas importadas
    await driver.executeScript(`document.getElementById('btn_pos_option').click();`);
    await driver.wait(until.elementLocated(By.id('product_search')), 15000);
    await driver.sleep(1500);

    const rowsFromInvoice = await driver.executeScript(`return document.querySelectorAll('#table_buy_list tr.main_row').length;`);
    if (!(rowsFromInvoice > 0)) {
      console.log('❌ CP-064 FAILED: La factura importada no agregó líneas al carrito');
      process.exit(1);
    }
    console.log('🧾 Filas en el carrito provenientes de la factura importada:', rowsFromInvoice);

    // Agregar un producto adicional a la factura importada
    await driver.wait(until.elementLocated(By.css('.product_box')), 15000);
    const added = await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-bombillos/i.test(b.textContent || ''));
      if (!target) return false;
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
      return true;
    `);
    if (!added) {
      console.log('❌ CP-064 FAILED: No se pudo agregar el producto adicional a la factura importada');
      process.exit(1);
    }

    const productAddedToCart = await driver.wait(async () => {
      const text = await driver.executeScript(`return document.getElementById('tb_table_buy_list').textContent;`);
      return /aaa-bombillos/i.test(text);
    }, 8000).catch(() => false);
    if (!productAddedToCart) {
      console.log('❌ CP-064 FAILED: El producto adicional no se reflejó en el carrito de la factura importada');
      process.exit(1);
    }
    console.log('🧾 Producto adicional agregado correctamente a la factura importada');

    // La factura importada ya trae su propio cliente; solo se fuerza el
    // cliente de prueba (12735) si no quedó ninguno seleccionado.
    const existingCustomer = await driver.executeScript(`
      const el = document.getElementById('customer_select');
      return el ? el.value : null;
    `);
    console.log('👤 Cliente ya asociado por la factura importada:', existingCustomer);

    let customerOk = existingCustomer && existingCustomer !== '0' && existingCustomer !== '';
    if (!customerOk) {
      const customerSelected = await driver.executeScript(`
        try {
          selectCustomerToPos(12735);
          return document.getElementById('customer_select') ? document.getElementById('customer_select').value : null;
        } catch (e) {
          return null;
        }
      `);
      customerOk = customerSelected === '12735';
    }
    if (!customerOk) {
      console.log('❌ CP-064 FAILED: No se pudo asociar ningún cliente a la factura');
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

    await driver.executeScript(`
      const cash = document.getElementById('ck_is_payment_cash');
      if (cash && !cash.checked) { cash.checked = true; cash.dispatchEvent(new Event('change', { bubbles: true })); }
      const efectivo = document.getElementById('is_payment_cash');
      if (efectivo && !efectivo.checked) { efectivo.checked = true; efectivo.dispatchEvent(new Event('change', { bubbles: true })); }
    `);
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
        return {
          hasSweetAlert: !!sweetAlert,
          rows: document.querySelectorAll('#table_buy_list tr.main_row').length
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
      cartEmpty = state.rows === 0;
    }

    if (cartEmpty) {
      console.log('✅ CP-064 PASSED: Se agregaron productos a la factura importada y se completó la factura');
    } else {
      console.log('❌ CP-064 FAILED: La factura importada con productos agregados no se confirmó');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-064 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp064_agregar_factura_importada();
