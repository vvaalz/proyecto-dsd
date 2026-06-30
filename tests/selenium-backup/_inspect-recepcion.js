const { Builder, By, until } = require('selenium-webdriver');

(async () => {
  let driver = await new Builder().forBrowser('chrome').build();
  try {
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();
    await driver.wait(until.urlContains('dashboard'), 15000);

    const candidates = await driver.findElements(By.xpath("//*[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚ', 'abcdefghijklmnopqrstuvwxyzáéíóú'), 'recepción vehicular') or contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚ', 'abcdefghijklmnopqrstuvwxyzáéíóú'), 'recepcion vehicular') or contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚ', 'abcdefghijklmnopqrstuvwxyzáéíóú'), 'recepción') or contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚ', 'abcdefghijklmnopqrstuvwxyzáéíóú'), 'recepcion')]") );
    console.log('candidates', candidates.length);
    for (const [i, el] of candidates.entries()) {
      try {
        const text = await el.getText();
        console.log('candidate', i, 'text=', JSON.stringify(text));
        const tag = await el.getTagName();
        const cls = await el.getAttribute('class');
        const href = await el.getAttribute('href');
        const onclick = await el.getAttribute('onclick');
        console.log('attrs', { tag, cls, href, onclick });
        await el.click();
        await driver.sleep(2000);
        console.log('after click url', await driver.getCurrentUrl());
        console.log('body', (await driver.findElement(By.css('body')).getText()).slice(0, 2000));
        await driver.navigate().back();
        await driver.wait(until.urlContains('dashboard'), 5000);
      } catch (e) {
        console.log('candidate error', i, e.message);
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    await driver.quit();
  }
})();
