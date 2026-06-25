const { Builder, By, until } = require('selenium-webdriver');

(async () => {
  let driver = await new Builder().forBrowser('chrome').build();
  try {
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await driver.findElement(By.id('email')).sendKeys('qadesignsoftcr@gmail.com');
    await driver.findElement(By.id('password')).sendKeys('qa0000');
    await driver.findElement(By.id('loginButton')).click();
    await driver.wait(until.urlContains('dashboard'), 20000);

    const texts = ['Recepción', 'recepción', 'Recepcion', 'recepcion', 'vehicular', 'Vehicular'];
    for (const term of texts) {
      const elems = await driver.findElements(By.xpath(`//*[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZÁÉÍÓÚ', 'abcdefghijklmnopqrstuvwxyzáéíóú'), '${term.toLowerCase()}')]`));
      console.log('\nTERM:', term, 'count=', elems.length);
      for (const [i, el] of elems.entries()) {
        try {
          const text = await el.getText();
          const tag = await el.getTagName();
          const cls = await el.getAttribute('class');
          const id = await el.getAttribute('id');
          const href = await el.getAttribute('href');
          const onclick = await el.getAttribute('onclick');
          const dataTarget = await el.getAttribute('data-target');
          if (text && text.trim()) {
            console.log(i, { tag, text: text.trim(), cls, id, href, onclick, dataTarget });
          }
        } catch (e) {
          console.log('err', i, e.message);
        }
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    await driver.quit();
  }
})();
