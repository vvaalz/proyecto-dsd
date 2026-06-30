const { Builder, By, until } = require('selenium-webdriver');

async function cp003_campos_vacios() {
  console.log('🔄 Ejecutando CP-003: Login con campos vacíos...');
  
  let driver = await new Builder().forBrowser('chrome').build();
  
  try {
    // Paso 1: Abrir el sistema
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    
    // Paso 2: Dejar los campos vacíos y clic en Iniciar Sesión
    await driver.findElement(By.id('loginButton')).click();
    
    // Paso 3: Esperar un momento para que el sistema responda
    await driver.sleep(3000);
    
    // Paso 4: Verificar que NO redirigió al dashboard
    let url = await driver.getCurrentUrl();
    if (!url.includes('dashboard')) {
      console.log('✅ CP-003 PASSED: El sistema no permitió acceso con campos vacíos');
    } else {
      console.log('❌ CP-003 FAILED: El sistema permitió acceso sin credenciales');
    }
    
  } catch (error) {
    console.log('❌ CP-003 FAILED: ' + error.message);
  } finally {
    await driver.quit();
  }
}

cp003_campos_vacios();