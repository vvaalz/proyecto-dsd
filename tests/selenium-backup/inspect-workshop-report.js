const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

(async () => {
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
    await driver.get('https://dev.designsoftcr.com/qa_talleralpha/public/reports/order_report');
    await driver.sleep(8000);

    const bodyText = await driver.findElement(By.css('body')).getText();
    console.log('BODY_SNIPPET_BEGIN');
    console.log(bodyText.slice(0, 6000));
    console.log('BODY_SNIPPET_END');

    const elements = await driver.executeScript(`
      return Array.from(document.querySelectorAll('input,button,select,a,table,div')).slice(0, 400).map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        className: (el.className || '').toString(),
        type: el.type || '',
        name: el.name || '',
        placeholder: el.placeholder || '',
        value: el.value || '',
        text: (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 200),
        href: el.href || ''
      })).filter((el) => el.id || el.text || el.placeholder || el.name || el.tag === 'input' || el.tag === 'button' || el.tag === 'select');
    `);
    console.log(JSON.stringify(elements, null, 2));
  } catch (error) {
    console.error(error);
  } finally {
    await driver.quit();
  }
})();
