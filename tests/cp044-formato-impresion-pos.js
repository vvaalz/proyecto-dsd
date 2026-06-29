const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp044_formato_impresion_pos() {
  console.log('🔄 Ejecutando CP-044: Verificar que el selector de formato de impresión muestre todas las opciones...');

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

    const printBtn = await driver.findElement(By.id('menu_type_print')).catch(() => null);
    if (!printBtn) {
      console.log('❌ CP-044 FAILED: No se encontró el ícono de impresora en el encabezado');
      process.exit(1);
    }

    await driver.executeScript(`document.getElementById('menu_type_print').click();`);
    await driver.sleep(1200);

    const menuText = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVisible).find((m) => /tipo de impresi[oó]n/i.test(m.textContent || ''));
      return menu ? menu.textContent.replace(/\\s+/g, ' ').trim() : null;
    `);
    console.log('🖨️ Contenido del menú de formato de impresión:', menuText);

    const requiredFormats = [
      'A4', 'Punto de Venta', 'Impresora - Driver Genérico', 'Impresión Aduanas',
      'Impresión MZ', 'A4 Plantilla 2', 'Punto de Venta v2', 'Factura Matricial', 'A4 custom Honduras'
    ];
    const missing = menuText ? requiredFormats.filter((opt) => !menuText.includes(opt)) : requiredFormats;

    if (missing.length === 0) {
      console.log('✅ CP-044 PASSED: El selector de impresión muestra los 9 formatos esperados');
    } else {
      console.log('❌ CP-044 FAILED: Faltan formatos de impresión: ' + JSON.stringify(missing));
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-044 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp044_formato_impresion_pos();
