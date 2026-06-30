const { Builder, By, until } = require('selenium-webdriver');

(async () => {
  const driver = await new Builder().forBrowser('chrome').build();
  try {
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();
    await driver.wait(until.urlContains('dashboard'), 15000);

    const pageSource = await driver.getPageSource();
    const lower = pageSource.toLowerCase();
    console.log('contains recepcion?', lower.includes('recepcion'));
    console.log('contains vehiculo?', lower.includes('vehiculo'));

    const anchors = await driver.findElements(By.css('a'));
    for (const anchor of anchors) {
      try {
        const href = await anchor.getAttribute('href');
        const text = await anchor.getText();
        if (href && /recep|vehic|reception|vehicle/i.test(href)) {
          console.log('LINK', { href, text });
        }
      } catch (e) {}
    }

    const buttons = await driver.findElements(By.css('button'));
    for (const button of buttons) {
      try {
        const text = await button.getText();
        const onclick = await button.getAttribute('onclick');
        if (text && /recep|vehic|reception|vehicle/i.test(text)) {
          console.log('BUTTON', { text, onclick });
        }
      } catch (e) {}
    }
  } finally {
    await driver.quit();
  }
})();
