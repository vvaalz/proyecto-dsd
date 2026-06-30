const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp059_facturar_producto_exento() {
  console.log('🔄 Ejecutando CP-059: Verificar facturación de un producto exento (sin IVA)...');

  const options = new chrome.Options();
  options.addArguments('--disable-notifications');
  options.addArguments('--window-size=1440,1200');
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

    // Buscar y agregar un producto exento (sin IVA): "AAA-Bombillos / luces
    // halógenas", ya confirmado con IVA = 0 en el panel de totales.
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
      console.log('❌ CP-059 FAILED: No se encontró el producto exento de prueba');
      process.exit(1);
    }

    await driver.wait(until.elementLocated(By.id('tb_table_buy_list')), 20000);
    await driver.wait(async () => {
      const text = await driver.executeScript(`return document.getElementById('tb_table_buy_list').textContent;`);
      return /aaa-bombillos/i.test(text);
    }, 10000);

    // Verificar que el IVA es cero (producto exento) en el resumen
    await driver.executeScript(`document.getElementById('show_invoice_advanced_detail').click();`);
    await driver.wait(until.elementLocated(By.css('.advanced_invoice_detail')), 20000);

    const ivaAmount = await driver.wait(async () => {
      const text = await driver.executeScript(`
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
      return text;
    }, 10000, 'No se encontró la línea de IVA en el panel de totales');
    console.log('🧾 Línea de IVA en el resumen:', ivaAmount);

    const ivaMatch = ivaAmount.match(/₡\s*([\d,]+\.\d{2})/);
    const ivaValue = ivaMatch ? parseFloat(ivaMatch[1].replace(/,/g, '')) : null;
    if (!(ivaValue === 0)) {
      console.log('❌ CP-059 FAILED: El IVA calculado no es cero para el producto exento (₡' + ivaValue + ')');
      process.exit(1);
    }

    // Asociar un cliente real y registrado (id 12735) vía selectCustomerToPos()
    const customerSelected = await driver.executeScript(`
      try {
        selectCustomerToPos(12735);
        return document.getElementById('customer_select') ? document.getElementById('customer_select').value : null;
      } catch (e) {
        return null;
      }
    `);
    if (customerSelected !== '12735') {
      console.log('❌ CP-059 FAILED: No se pudo asociar el cliente de prueba (id 12735) a la factura');
      process.exit(1);
    }
    await driver.sleep(1200);

    // Completar la venta con método de pago Efectivo (Contado)
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

    // Tras hacer clic en FACTURAR aparecen hasta dos SweetAlerts en cadena
    // (confirmación de pago, luego "¿Desea imprimir copia?"); se sondea
    // repetidamente y se confirma cualquiera que vaya apareciendo.
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
          cartHasProduct: /aaa-bombillos/i.test(document.getElementById('tb_table_buy_list').textContent)
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
      console.log('✅ CP-059 PASSED: Se facturó el producto exento (IVA=₡' + ivaValue + ') y la venta se completó');
    } else {
      console.log('❌ CP-059 FAILED: La factura no se confirmó (el producto sigue en el carrito)');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-059 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp059_facturar_producto_exento();
