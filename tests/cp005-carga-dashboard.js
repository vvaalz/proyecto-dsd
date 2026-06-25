const { Builder, By, until } = require('selenium-webdriver');

async function cp005_carga_dashboard() {
  console.log('🔄 Ejecutando CP-005: Verificar carga del dashboard...');
  
  let driver = await new Builder().forBrowser('chrome').build();
  
  try {
    // Paso 1: Abrir el sistema y hacer login válido
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();
    
    // Paso 2: Esperar que cargue el dashboard
    await driver.wait(until.urlContains('dashboard'), 10000);
    
    // Paso 3: Verificar que el dashboard cargó correctamente
    let url = await driver.getCurrentUrl();
    let title = await driver.getTitle();
    
    if (url.includes('dashboard')) {
      console.log('✅ CP-005 PASSED: Dashboard cargó correctamente');
      console.log('   URL: ' + url);
      console.log('   Título: ' + title);
    } else {
      console.log('❌ CP-005 FAILED: El dashboard no cargó correctamente');
    }
    
  } catch (error) {
    console.log('❌ CP-005 FAILED: ' + error.message);
  } finally {
    await driver.quit();
  }
}

cp005_carga_dashboard();
