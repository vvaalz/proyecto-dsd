const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp031_carga_modulo_pos() {
  console.log('🔄 Ejecutando CP-031: Verificar que el módulo POS (Facturar) cargue correctamente...');

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
    await driver.sleep(4000);

    // Si aparece el modal de selección de compañía, seleccionar "TALLER ALPHA PREMIUM".
    // Con esta URL (company_pos=20) la compañía ya viene preseleccionada, pero
    // se maneja el modal por si en algún momento vuelve a aparecer.
    const companyOptionClicked = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const option = Array.from(document.querySelectorAll('button, a, li, div'))
        .filter(isVisible)
        .find((el) => /taller alpha premium/i.test((el.textContent || '').trim()) && (el.textContent || '').trim().length < 60);
      if (option) { option.click(); return true; }
      return false;
    `);
    if (companyOptionClicked) {
      await driver.sleep(2000);
      console.log('ℹ️ Se encontró y seleccionó "TALLER ALPHA PREMIUM" en un modal de selección.');
    } else {
      console.log('ℹ️ No apareció un modal de selección de compañía (queda preseleccionada por la URL company_pos=20).');
    }

    await driver.wait(until.elementLocated(By.id('product_search')), 20000);
    await driver.sleep(2000);

    const bodyText = await driver.findElement(By.css('body')).getText();
    const showsCompany = /taller alpha premium/i.test(bodyText);
    const showsCategories = /categorías/i.test(bodyText) && /todos/i.test(bodyText);
    const showsProducts = (await driver.findElements(By.css('.product_box'))).length > 1;

    if (showsCompany && showsCategories && showsProducts) {
      console.log('✅ CP-031 PASSED: El POS cargó con la compañía TALLER ALPHA PREMIUM, categorías y productos visibles');
    } else {
      console.log(`❌ CP-031 FAILED: showsCompany=${showsCompany}, showsCategories=${showsCategories}, showsProducts=${showsProducts}`);
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-031 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp031_carga_modulo_pos();
