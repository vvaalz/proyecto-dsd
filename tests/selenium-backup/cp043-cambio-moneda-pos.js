const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp043_cambio_moneda_pos() {
  console.log('🔄 Ejecutando CP-043: Verificar que el selector de moneda muestre las opciones disponibles...');

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

    const currencyBtn = await driver.findElement(By.id('menu_type_currency')).catch(() => null);
    if (!currencyBtn) {
      console.log('❌ CP-043 FAILED: No se encontró el selector de moneda (CRC) en el encabezado');
      process.exit(1);
    }

    await driver.executeScript(`document.getElementById('menu_type_currency').click();`);
    await driver.sleep(1200);

    const menuText = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVisible).find((m) => /d[oó]lar|euro|colón/i.test(m.textContent || ''));
      return menu ? menu.textContent.replace(/\\s+/g, ' ').trim() : null;
    `);
    console.log('💱 Contenido del menú de moneda:', menuText);

    const requiredOptions = ['Dólar Americano', 'Euro', 'Peso Dominicano'];
    const missing = menuText ? requiredOptions.filter((opt) => !menuText.includes(opt)) : requiredOptions;

    if (missing.length === 0) {
      console.log('✅ CP-043 PASSED: El selector de moneda muestra Dólar Americano, Euro y Peso Dominicano');
    } else {
      console.log('❌ CP-043 FAILED: Faltan opciones de moneda: ' + JSON.stringify(missing));
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-043 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp043_cambio_moneda_pos();
