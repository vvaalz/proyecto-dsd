const { Builder, By, until } = require('selenium-webdriver');

async function cp002_login_invalido() {
  console.log('🔄 Ejecutando CP-002: Login con contraseña incorrecta...');
  
  let driver = await new Builder().forBrowser('chrome').build();
  
  try {
    // Paso 1: Abrir el sistema
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    
    // Paso 2: Ingresar usuario válido
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    
    // Paso 3: Ingresar contraseña incorrecta
    await driver.findElement(By.id('password')).sendKeys('contraseña_incorrecta');
    
    // Paso 4: Clic en Iniciar Sesión
    await driver.findElement(By.id('loginButton')).click();
    
    // Paso 5: Esperar un momento para que el sistema responda
    await driver.sleep(3000);
    
    // Paso 6: Verificar que NO redirigió al dashboard
    let url = await driver.getCurrentUrl();
    if (!url.includes('dashboard')) {
      console.log('✅ CP-002 PASSED: El sistema rechazó las credenciales incorrectas correctamente');
    } else {
      console.log('❌ CP-002 FAILED: El sistema permitió acceso con contraseña incorrecta');
    }
    
  } catch (error) {
    console.log('❌ CP-002 FAILED: ' + error.message);
  } finally {
    await driver.quit();
  }
}

cp002_login_invalido();