const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp045_abrir_cerrar_caja() {
  console.log('🔄 Ejecutando CP-045: Verificar que (F12) Abrir/Cerrar Caja abra el modal de gestión de caja...');

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
      const li = Array.from(menu.querySelectorAll('li')).find((el) => /abrir\\/cerrar caja/i.test(el.textContent || ''));
      if (!li) return false;
      li.click();
      return true;
    `);
    if (!clicked) {
      console.log('❌ CP-045 FAILED: No se encontró la opción "(F12) Abrir/Cerrar Caja" en el menú de Caja');
      process.exit(1);
    }
    await driver.sleep(2000);

    // Según el estado actual de la caja, abre el modal de apertura
    // (dialog_cash_opening) o de cierre/detalle (dialog_cash_closing) — ambos
    // son el modal de "gestión de caja".
    const modalOpen = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const opening = document.getElementById('dialog_cash_opening');
      const closing = document.getElementById('dialog_cash_closing');
      return (opening && isVisible(opening)) || (closing && isVisible(closing));
    `);

    if (modalOpen) {
      console.log('✅ CP-045 PASSED: Se abrió el modal de gestión de caja (apertura o cierre, según el estado actual)');
    } else {
      console.log('❌ CP-045 FAILED: No se abrió ningún modal de gestión de caja');
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-045 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp045_abrir_cerrar_caja();
