const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp046_movimientos_caja() {
  console.log('🔄 Ejecutando CP-046: Verificar que (F9) Movimientos de caja cargue la pantalla de movimientos...');

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

    await driver.executeScript(`document.getElementById('menu_cash').click();`);
    await driver.sleep(1000);

    const clicked = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVisible).find((m) => /caja/i.test(m.textContent || ''));
      if (!menu) return false;
      const li = Array.from(menu.querySelectorAll('li')).find((el) => /movimientos de caja/i.test(el.textContent || ''));
      if (!li) return false;
      li.click();
      return true;
    `);
    if (!clicked) {
      console.log('❌ CP-046 FAILED: No se encontró la opción "(F9) Movimientos de caja" en el menú de Caja');
      process.exit(1);
    }
    await driver.sleep(2000);

    const modalOpen = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const m = document.getElementById('dialog_cash_movement');
      return m ? isVisible(m) : false;
    `);

    if (modalOpen) {
      console.log('✅ CP-046 PASSED: Se cargó la pantalla de "Movimientos de caja"');
    } else {
      console.log('❌ CP-046 FAILED: No se cargó la pantalla de movimientos de caja');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-046 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp046_movimientos_caja();
