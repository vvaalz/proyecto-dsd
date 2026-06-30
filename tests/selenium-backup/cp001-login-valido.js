const { Builder, By, until } = require('selenium-webdriver');

async function cp001_login_valido() {
  console.log('🔄 Ejecutando CP-001: Login con credenciales válidas...');
  
  let driver = await new Builder().forBrowser('chrome').build();
  
  try {
    // Paso 1: Abrir el sistema
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    
    // Paso 2: Ingresar el usuario
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    
    // Paso 3: Ingresar la contraseña
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    
    // Paso 4: Clic en Iniciar Sesión
    await driver.findElement(By.id('loginButton')).click();
    
    // Paso 5: Esperar que cargue el dashboard
    await driver.wait(until.urlContains('dashboard'), 10000);
    
    // Paso 6: Verificar que llegó al dashboard
    let url = await driver.getCurrentUrl();
    if (url.includes('dashboard')) {
      console.log('✅ CP-001 PASSED: Login exitoso, redirigió al dashboard correctamente');
    } else {
      console.log('❌ CP-001 FAILED: No redirigió al dashboard');
    }
    
  } catch (error) {
    console.log('❌ CP-001 FAILED: ' + error.message);
  } finally {
    await driver.quit();
  }
}

cp001_login_valido();