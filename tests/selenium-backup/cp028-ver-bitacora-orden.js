const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp028_ver_bitacora_orden() {
  console.log('🔄 Ejecutando CP-028: Verificar que "Ver bitácora" cargue la bitácora de la orden...');

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

    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/vehicularReception/vehicularQuickReception');
    await driver.wait(until.elementLocated(By.id('repair_order_search')), 20000);
    await driver.sleep(3000);

    const menuButton = await driver.findElement(By.css('.options-menu-button')).catch(() => null);
    if (!menuButton) {
      console.log('❌ CP-028 FAILED: No se encontró el menú de tres puntos en ninguna tarjeta de orden');
      process.exit(1);
    }

    // Un clic nativo de Selenium no abre este menú de forma confiable (ver
    // hallazgos de CP-026); se dispara el evento de clic directamente vía JS.
    await driver.executeScript(`
      document.querySelector('.options-menu-button').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
      );
    `);
    await driver.sleep(800);

    const menuOpened = await driver.executeScript(`
      const dd = document.querySelector('[id^="myDropdownListOrders_"]');
      return dd ? window.getComputedStyle(dd).display !== 'none' : false;
    `);
    if (!menuOpened) {
      console.log('❌ CP-028 FAILED: El menú de tres puntos no se desplegó');
      process.exit(1);
    }

    // "Ver bitácora" vive dentro de "Opciones avanzadas", colapsada por defecto
    const logbookFound = await driver.executeScript(`
      const dd = document.querySelector('[id^="myDropdownListOrders_"]');
      const summary = Array.from(dd.querySelectorAll('summary')).find((s) => /opciones avanzadas/i.test(s.textContent || ''));
      if (summary) summary.click();
      const link = Array.from(dd.querySelectorAll('a')).find((a) => /ver bit[aá]cora/i.test(a.textContent || ''));
      return !!link;
    `);

    if (!logbookFound) {
      console.log('❌ CP-028 FAILED: No se encontró la opción "Ver bitácora" dentro de Opciones avanzadas');
      process.exit(1);
    }

    const bodyBefore = await driver.findElement(By.css('body')).getText();

    await driver.executeScript(`
      const dd = document.querySelector('[id^="myDropdownListOrders_"]');
      const link = Array.from(dd.querySelectorAll('a')).find((a) => /ver bit[aá]cora/i.test(a.textContent || ''));
      if (link) link.click();
    `);
    await driver.sleep(2500);

    const bodyAfter = await driver.findElement(By.css('body')).getText();
    const logbookLoaded = /bit[aá]cora/i.test(bodyAfter) && bodyAfter.length !== bodyBefore.length;

    if (logbookLoaded) {
      console.log('✅ CP-028 PASSED: Se cargó la bitácora de la orden tras hacer clic en "Ver bitácora"');
    } else {
      console.log('❌ CP-028 FAILED: No se observó contenido de bitácora tras hacer clic en la opción');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-028 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp028_ver_bitacora_orden();
