const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp050_tres_puntos_carrito() {
  console.log('🔄 Ejecutando CP-050: Verificar que el menú de tres puntos del carrito muestre sus opciones...');

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

    const added = await driver.executeScript(`
      const boxes = Array.from(document.querySelectorAll('.product_box'));
      const target = boxes.find((b) => /aaa-mult[ií]metro automotriz digital/i.test(b.textContent || ''));
      if (!target) return false;
      const clickable = target.querySelector('.product_box_quantity_content') || target;
      clickable.click();
      return true;
    `);
    if (!added) {
      console.log('❌ CP-050 FAILED: No se pudo agregar el producto de prueba al carrito');
      process.exit(1);
    }
    await driver.sleep(1500);

    const menuButtonId = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const icon = Array.from(document.querySelectorAll('.material-icons')).filter(isVisible).find((el) => (el.textContent || '').trim() === 'more_horiz');
      return icon ? icon.parentElement.id : null;
    `);
    if (!menuButtonId) {
      console.log('❌ CP-050 FAILED: No se encontró el botón de tres puntos (more_horiz) en la esquina del carrito');
      process.exit(1);
    }

    await driver.executeScript(`document.getElementById(${JSON.stringify(menuButtonId)}).click();`);
    await driver.sleep(1200);

    const menuText = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVisible).find((m) => /producto externo|permisos del pos/i.test(m.textContent || ''));
      return menu ? menu.textContent.replace(/\\s+/g, ' ').trim() : null;
    `);
    console.log('⋯ Contenido del menú de tres puntos del carrito:', menuText);

    const requiredOptions = ['Producto externo', 'Historial de Facturas', 'Historial de Proformas', 'Permisos del POS'];
    const missing = menuText ? requiredOptions.filter((opt) => !menuText.includes(opt)) : requiredOptions;

    if (missing.length === 0) {
      console.log('✅ CP-050 PASSED: El menú de tres puntos del carrito muestra sus opciones correctamente');
    } else {
      console.log('❌ CP-050 FAILED: Faltan opciones en el menú: ' + JSON.stringify(missing));
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-050 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp050_tres_puntos_carrito();
