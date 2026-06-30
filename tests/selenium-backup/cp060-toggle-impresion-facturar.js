const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp060_toggle_impresion_facturar() {
  console.log('🔄 Ejecutando CP-060: Deshabilitar/habilitar la impresión y generar facturas en ambos estados...');

  const options = new chrome.Options();
  options.addArguments('--disable-notifications');
  options.addArguments('--window-size=1440,1200');
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

  // El toggle de impresión de facturas se controla con la tecla F8 (no hay
  // selector visual): cada pulsación alterna el estado y el sistema muestra
  // un aviso "Impresión de facturas ACTIVADA/DESACTIVADA" (ver CP-047).
  const readPrintState = async () => {
    const body = await driver.findElement(By.css('body')).getText();
    const matches = [...body.matchAll(/impresi[oó]n de facturas (activada|desactivada)/gi)];
    if (matches.length === 0) return null;
    return matches[matches.length - 1][1].toLowerCase();
  };
  const pressF8 = async () => {
    await driver.executeScript(`
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F8', code: 'F8', keyCode: 119, which: 119, bubbles: true }));
    `);
    await driver.sleep(1500);
  };
  const facturarProductoGravado = async () => {
    await driver.wait(until.elementLocated(By.css('.product_box')), 15000);
    const added = await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-mult[ií]metro automotriz digital/i.test(b.textContent || ''));
      if (!target) return false;
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
      return true;
    `);
    if (!added) return false;

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
    if (customerSelected !== '12735') return false;
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
    return cartEmpty;
  };

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

    // Asegurar que la impresión quede DESHABILITADA antes de la primera factura
    await pressF8();
    let state = await readPrintState();
    if (state !== 'desactivada') {
      await pressF8();
      state = await readPrintState();
    }
    if (state !== 'desactivada') {
      console.log('❌ CP-060 FAILED: No se pudo confirmar el estado "Impresión de facturas DESACTIVADA" tras presionar F8');
      process.exit(1);
    }
    console.log('🖨️ Estado tras deshabilitar:', state);

    const facturaSinImpresionOk = await facturarProductoGravado();
    if (!facturaSinImpresionOk) {
      console.log('❌ CP-060 FAILED: No se pudo generar la factura con la impresión deshabilitada');
      process.exit(1);
    }

    // Volver a habilitar la impresión para la segunda factura
    await pressF8();
    const state2 = await readPrintState();
    if (state2 !== 'activada') {
      console.log('❌ CP-060 FAILED: No se pudo confirmar el estado "Impresión de facturas ACTIVADA" tras presionar F8 nuevamente');
      process.exit(1);
    }
    console.log('🖨️ Estado tras habilitar:', state2);

    const facturaConImpresionOk = await facturarProductoGravado();
    if (!facturaConImpresionOk) {
      console.log('❌ CP-060 FAILED: No se pudo generar la factura con la impresión habilitada');
      process.exit(1);
    }

    console.log('✅ CP-060 PASSED: Se deshabilitó/habilitó la impresión (F8) y se generaron facturas correctamente en ambos estados');
  } catch (error) {
    console.log('❌ CP-060 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp060_toggle_impresion_facturar();
