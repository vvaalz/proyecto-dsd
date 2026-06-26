const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp032_buscar_producto_pos() {
  console.log('🔄 Ejecutando CP-032: Verificar que buscar un producto en el POS lo muestre en los resultados...');

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

    // Un clic nativo de Selenium queda interceptado por otro elemento
    // superpuesto en esta pantalla; se enfoca el campo vía JS y se escribe
    // con sendKeys (sin clic previo) para disparar los eventos de teclado reales.
    const searchInput = await driver.findElement(By.id('product_search'));
    await driver.executeScript('arguments[0].scrollIntoView(true); arguments[0].focus();', searchInput);
    await searchInput.clear();
    await searchInput.sendKeys('AAA-Multímetro Automotriz Digital');
    await driver.sleep(2500);

    const productVisible = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-mult[ií]metro automotriz digital/i.test(b.textContent || ''));
      return target ? isVisible(target) : false;
    `);

    if (productVisible) {
      console.log('✅ CP-032 PASSED: "AAA-Multímetro Automotriz Digital" aparece visible en los resultados del buscador');
    } else {
      console.log('❌ CP-032 FAILED: El producto buscado no aparece visible en los resultados');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-032 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp032_buscar_producto_pos();
