const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp042_aplicar_descuento_carrito() {
  console.log('🔄 Ejecutando CP-042: Verificar que aplicar un porcentaje de descuento cambie el total...');

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

    const added = await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-mult[ií]metro automotriz digital/i.test(b.textContent || ''));
      if (!target) return false;
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
      return true;
    `);
    if (!added) {
      console.log('❌ CP-042 FAILED: No se pudo agregar el producto de prueba al carrito');
      process.exit(1);
    }
    await driver.sleep(1500);

    const totalBefore = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0;
      };
      const el = Array.from(document.querySelectorAll('*')).filter(isVisible).find((e) => /^TOTAL:$/i.test((e.textContent || '').trim()));
      return el && el.nextElementSibling ? el.nextElementSibling.textContent.trim() : null;
    `);
    console.log('💰 Total antes del descuento:', totalBefore);

    await driver.executeScript(`document.getElementById('show_invoice_advanced_detail').click();`);
    await driver.sleep(1000);

    const discountInput = await driver.findElement(By.id('total_discount_input')).catch(() => null);
    if (!discountInput) {
      console.log('❌ CP-042 FAILED: No se encontró el campo de porcentaje de descuento');
      process.exit(1);
    }

    await driver.executeScript(`
      const el = document.getElementById('total_discount_input');
      el.value = '10';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    `);
    await driver.sleep(2000);

    const totalAfter = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0;
      };
      const el = Array.from(document.querySelectorAll('*')).filter(isVisible).find((e) => /^TOTAL:$/i.test((e.textContent || '').trim()));
      return el && el.nextElementSibling ? el.nextElementSibling.textContent.trim() : null;
    `);
    console.log('💰 Total después del descuento del 10%:', totalAfter);

    if (totalAfter && totalBefore && totalAfter !== totalBefore) {
      console.log('✅ CP-042 PASSED: El total cambió correctamente al aplicar el descuento (' + totalBefore + ' -> ' + totalAfter + ')');
    } else {
      console.log('❌ CP-042 FAILED: El total no cambió tras aplicar el descuento');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-042 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp042_aplicar_descuento_carrito();
