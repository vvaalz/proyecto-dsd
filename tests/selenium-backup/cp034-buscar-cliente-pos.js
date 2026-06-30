const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp034_buscar_cliente_pos() {
  console.log('🔄 Ejecutando CP-034: Verificar que se pueda asociar un cliente a la factura del POS...');

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

    // El buscador de cliente existente (#search_pos_customer) no devolvió
    // resultados con ningún método probado (nombre, correo, cédula exacta) —
    // parece un defecto del sistema en este momento. Se usa la vía alterna
    // confirmada por el usuario: "Agregar" -> "Nombre del cliente", que
    // registra un cliente nuevo directamente desde el POS.
    const customerName = 'Cliente Prueba CP034';

    const agregarClicked = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVisible).find((b) => (b.textContent || '').trim() === 'Agregar');
      if (btn) { btn.click(); return true; }
      return false;
    `);
    if (!agregarClicked) {
      console.log('❌ CP-034 FAILED: No se encontró el botón "Agregar" junto al buscador de cliente');
      process.exit(1);
    }
    await driver.sleep(800);

    await driver.executeScript(`if (typeof editQuickCustomerName === 'function') editQuickCustomerName();`);
    await driver.sleep(1000);

    const tempInputExists = await driver.executeScript(`return !!document.getElementById('temporal_customer_name');`);
    if (!tempInputExists) {
      console.log('❌ CP-034 FAILED: No apareció el campo "Nombre del cliente" tras hacer clic en Agregar');
      process.exit(1);
    }

    // sendKeys de Selenium no logra escribir en este campo (problema ya
    // observado de interceptación del foco); se fija el valor por JS y se
    // invoca el manejador onchange real para registrar el cliente.
    await driver.executeScript(`
      const el = document.getElementById('temporal_customer_name');
      el.value = ${JSON.stringify(customerName)};
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof setTemporalCustomerName === 'function') setTemporalCustomerName();
    `);
    await driver.sleep(2000);

    const customerAssociated = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const inText = Array.from(document.querySelectorAll('*')).filter(isVisible).some((el) => (el.textContent || '').includes(${JSON.stringify(customerName)}) && el.children.length === 0);
      const inValue = Array.from(document.querySelectorAll('input')).filter(isVisible).some((el) => (el.value || '').includes(${JSON.stringify(customerName)}));
      return inText || inValue;
    `);

    if (customerAssociated) {
      console.log('✅ CP-034 PASSED: El cliente "' + customerName + '" quedó asociado a la factura del POS');
    } else {
      console.log('❌ CP-034 FAILED: No se observó la información del cliente asociada a la factura tras registrarlo');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-034 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp034_buscar_cliente_pos();
