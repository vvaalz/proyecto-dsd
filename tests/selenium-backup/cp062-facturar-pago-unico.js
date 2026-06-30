const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp062_facturar_pago_unico() {
  console.log('🔄 Ejecutando CP-062: Verificar facturación con un solo método de pago (tarjeta)...');

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

    await driver.wait(until.elementLocated(By.css('.product_box')), 15000);
    const added = await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-mult[ií]metro automotriz digital/i.test(b.textContent || ''));
      if (!target) return false;
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
      return true;
    `);
    if (!added) {
      console.log('❌ CP-062 FAILED: No se encontró el producto de prueba');
      process.exit(1);
    }

    await driver.wait(until.elementLocated(By.id('tb_table_buy_list')), 20000);
    await driver.wait(async () => {
      const text = await driver.executeScript(`return document.getElementById('tb_table_buy_list').textContent;`);
      return /aaa-mult[ií]metro/i.test(text);
    }, 10000);

    const customerSelected = await driver.executeScript(`
      try {
        selectCustomerToPos(12735);
        return document.getElementById('customer_select') ? document.getElementById('customer_select').value : null;
      } catch (e) {
        return null;
      }
    `);
    if (customerSelected !== '12735') {
      console.log('❌ CP-062 FAILED: No se pudo asociar el cliente de prueba (id 12735) a la factura');
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
    await driver.sleep(800);

    // Usar ÚNICAMENTE Tarjeta como método de pago: desmarcar Efectivo
    // (activo por defecto) y dejar el monto completo en Tarjeta.
    const totalToPay = await driver.executeScript(`
      const totalField = document.getElementById('payment_cash_total');
      return totalField ? parseFloat(totalField.value || '0') : 0;
    `);
    if (!(totalToPay > 0)) {
      console.log('❌ CP-062 FAILED: No se pudo determinar el monto total a pagar');
      process.exit(1);
    }
    console.log('💰 Monto total a pagar con tarjeta:', totalToPay);

    await driver.executeScript(`
      const card = document.getElementById('is_payment_credit_card');
      if (card && !card.checked) { card.checked = true; card.dispatchEvent(new Event('change', { bubbles: true })); }
    `);
    await driver.sleep(500);
    await driver.executeScript(`
      const cash = document.getElementById('ck_is_payment_cash');
      if (cash && cash.checked) { cash.checked = false; cash.dispatchEvent(new Event('change', { bubbles: true })); }
      const efectivo = document.getElementById('is_payment_cash');
      if (efectivo && efectivo.checked) { efectivo.checked = false; efectivo.dispatchEvent(new Event('change', { bubbles: true })); }
    `);
    await driver.sleep(500);

    await driver.executeScript(`
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (!el) return false;
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      setVal('payment_credit_card_total', ${totalToPay});
    `);
    await driver.sleep(500);

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
      console.log('✅ CP-062 PASSED: Se facturó con un solo método de pago (tarjeta ₡' + totalToPay + ') y la venta se completó');
    } else {
      console.log('❌ CP-062 FAILED: La factura con pago único no se confirmó (el producto sigue en el carrito)');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-062 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp062_facturar_pago_unico();
