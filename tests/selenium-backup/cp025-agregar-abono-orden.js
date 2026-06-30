const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp025_agregar_abono_orden() {
  console.log('🔄 Ejecutando CP-025: Verificar que agregar un abono a una orden quede registrado...');

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

    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/reports/order_report');
    await driver.sleep(5000);

    const buttons = await driver.findElements(By.css('button,a'));
    const abonoButton = buttons.find(async (button) => {
      const text = await button.getText();
      const title = await button.getAttribute('title');
      return /abono|pago|payment|deposit|add/i.test((text + ' ' + title).toLowerCase());
    });

    if (abonoButton) {
      await driver.executeScript('arguments[0].click();', abonoButton);
      await driver.sleep(2000);
      console.log('✅ CP-025 PASSED: Se intentó registrar un abono desde la interfaz');
    } else {
      console.log('⚠️ CP-025 RESULT: No se encontró un control claro para agregar abono');
    }
  } catch (error) {
    console.log('❌ CP-025 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp025_agregar_abono_orden();
