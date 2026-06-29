const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

async function cp049_filtro_vehiculos_pos() {
  console.log('🔄 Ejecutando CP-049: Verificar que "Filtros de Vehículos" despliegue las opciones de filtrado...');

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

    const filterBtn = await driver.findElement(By.id('btn_toggle_pos_vehicle_filters')).catch(() => null);
    if (!filterBtn) {
      console.log('❌ CP-049 FAILED: No se encontró el botón "Filtros de Vehículos"');
      process.exit(1);
    }

    await driver.executeScript(`document.getElementById('btn_toggle_pos_vehicle_filters').click();`);
    await driver.sleep(1500);

    const filtersText = await driver.executeScript(`
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const container = document.getElementById('pos_vehicle_filters_container');
      return container && isVisible(container) ? container.textContent.replace(/\\s+/g, ' ').trim() : null;
    `);
    console.log('🚗 Contenido visible del panel de filtros de vehículos:', filtersText);

    const requiredFilters = ['Marca', 'Modelo', 'Año', 'Transmisión', 'Motor', 'Categoría'];
    const missing = filtersText ? requiredFilters.filter((f) => !filtersText.includes(f)) : requiredFilters;

    if (missing.length === 0) {
      console.log('✅ CP-049 PASSED: El panel de filtros de vehículos despliega Marca, Modelo, Año, Transmisión, Motor y Categoría');
    } else {
      console.log('❌ CP-049 FAILED: Faltan filtros en el panel: ' + JSON.stringify(missing));
      process.exit(1);
    }
  } catch (error) {
    console.log('❌ CP-049 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await driver.quit();
  }
}

cp049_filtro_vehiculos_pos();
