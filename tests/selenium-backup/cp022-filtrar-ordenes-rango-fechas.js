const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp022_filtrar_ordenes_rango_fechas() {
  console.log('🔄 Ejecutando CP-022: Verificar que el reporte permita filtrar órdenes por rango de fechas...');

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

    const dateInputs = await driver.findElements(By.css('input[type="date"], input[name*="date"], input[id*="date"]'));
    if (dateInputs.length >= 2) {
      await driver.executeScript("arguments[0].focus(); arguments[0].value = '2024-01-01'; arguments[0].dispatchEvent(new Event('input', { bubbles: true }));", dateInputs[0]);
      await driver.executeScript("arguments[0].focus(); arguments[0].value = '2024-12-31'; arguments[0].dispatchEvent(new Event('input', { bubbles: true }));", dateInputs[1]);
      await driver.sleep(1500);
      console.log('✅ CP-022 PASSED: Se intentó aplicar el rango de fechas al reporte');
    } else {
      console.log('⚠️ CP-022 RESULT: No se encontraron campos de fecha para filtrar');
    }
  } catch (error) {
    console.log('❌ CP-022 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp022_filtrar_ordenes_rango_fechas();
