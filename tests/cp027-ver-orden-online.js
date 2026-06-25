const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp027_ver_orden_online() {
  console.log('🔄 Ejecutando CP-027: Verificar que "Ver orden online" abra la orden en una nueva pestaña o URL...');

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
      console.log('❌ CP-027 FAILED: No se encontró el menú de tres puntos en ninguna tarjeta de orden');
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
      console.log('❌ CP-027 FAILED: El menú de tres puntos no se desplegó');
      process.exit(1);
    }

    // "Ver orden online" vive dentro de "Opciones avanzadas", colapsada por defecto
    const onlineLink = await driver.executeScript(`
      const dd = document.querySelector('[id^="myDropdownListOrders_"]');
      const summary = Array.from(dd.querySelectorAll('summary')).find((s) => /opciones avanzadas/i.test(s.textContent || ''));
      if (summary) summary.click();
      const link = Array.from(dd.querySelectorAll('a')).find((a) => /ver orden online/i.test(a.textContent || ''));
      return link ? { href: link.getAttribute('href') } : null;
    `);

    if (!onlineLink || !onlineLink.href) {
      console.log('❌ CP-027 FAILED: No se encontró la opción "Ver orden online" dentro de Opciones avanzadas');
      process.exit(1);
    }

    const handlesBefore = await driver.getAllWindowHandles();

    await driver.executeScript(`
      const dd = document.querySelector('[id^="myDropdownListOrders_"]');
      const link = Array.from(dd.querySelectorAll('a')).find((a) => /ver orden online/i.test(a.textContent || ''));
      if (link) link.click();
    `);
    await driver.sleep(2500);

    const handlesAfter = await driver.getAllWindowHandles();
    let finalUrl;
    let finalBodyText;

    if (handlesAfter.length > handlesBefore.length) {
      const newHandle = handlesAfter.find((h) => !handlesBefore.includes(h));
      await driver.switchTo().window(newHandle);
      finalUrl = await driver.getCurrentUrl();
      finalBodyText = await driver.findElement(By.css('body')).getText();
      await driver.close();
      await driver.switchTo().window(handlesBefore[0]);
    } else {
      finalUrl = await driver.getCurrentUrl();
      finalBodyText = await driver.findElement(By.css('body')).getText();
    }

    const openedOrderView = /get_repair_order_by_hash_key|repair_order/i.test(finalUrl) &&
      !/error\/404/i.test(finalUrl) &&
      !/página no encontrada/i.test(finalBodyText);

    if (openedOrderView) {
      console.log('✅ CP-027 PASSED: "Ver orden online" abrió la vista de la orden (' + finalUrl + ')');
    } else {
      console.log('❌ CP-027 FAILED: No se abrió una vista válida de la orden. URL final: ' + finalUrl);
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-027 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp027_ver_orden_online();
