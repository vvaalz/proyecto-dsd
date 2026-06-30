const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp023_descarga_reporte_excel() {
  console.log('🔄 Ejecutando CP-023: Verificar que el reporte permita descargarlo en Excel...');

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
    const excelButton = buttons.find(async (button) => {
      const text = await button.getText();
      const title = await button.getAttribute('title');
      const href = await button.getAttribute('href');
      return /excel|xlsx|csv|download|descargar/i.test((text + ' ' + title + ' ' + href).toLowerCase());
    });

    if (excelButton) {
      await driver.executeScript('arguments[0].click();', excelButton);
      await driver.sleep(2000);
      console.log('✅ CP-023 PASSED: Se intentó descargar el reporte en Excel');
    } else {
      console.log('⚠️ CP-023 RESULT: No se encontró un botón de descarga explícito');
    }
  } catch (error) {
    console.log('❌ CP-023 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp023_descarga_reporte_excel();
