const { Builder, By } = require('selenium-webdriver');

async function cp004_usuario_inexistente() {
  console.log('🔄 Ejecutando CP-004: Login con usuario inexistente...');
  
  let driver = await new Builder().forBrowser('chrome').build();
  
  try {
    // Paso 1: Abrir el sistema
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    
    // Paso 2: Ingresar usuario que no existe
    await driver.findElement(By.id('email')).sendKeys('usuario_falso@noexiste.com');
    
    // Paso 3: Ingresar cualquier contraseña
    await driver.findElement(By.id('password')).sendKeys('cualquier123');
    
    // Paso 4: Clic en Iniciar Sesión
    await driver.findElement(By.id('loginButton')).click();
    
    // Paso 5: Esperar respuesta del sistema
    await driver.sleep(3000);
    
    // Paso 6: Verificar que NO redirigió al dashboard
    let url = await driver.getCurrentUrl();
    if (!url.includes('dashboard')) {
      console.log('✅ CP-004 PASSED: El sistema rechazó el usuario inexistente correctamente');
    } else {
      console.log('❌ CP-004 FAILED: El sistema permitió acceso con usuario inexistente');
    }
    
  } catch (error) {
    console.log('❌ CP-004 FAILED: ' + error.message);
  } finally {
    await driver.quit();
  }
}

cp004_usuario_inexistente();