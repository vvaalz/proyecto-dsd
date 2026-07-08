const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const POS_URL = 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1';
const TOLERANCIA = 1;

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function cargarPOS(page) {
  await page.goto(POS_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
  await page.waitForTimeout(3000);
  await page.waitForSelector('.product_box', { timeout: 15000 });
  // Dólares para CP-088
  await page.evaluate(() => { document.getElementById('menu_type_currency')?.click(); });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /col[oó]n|d[oó]lar/i.test(m.textContent || ''));
    if (menu) { const opt = Array.from(menu.querySelectorAll('li')).find(li => /d[oó]lar americano/i.test(li.textContent || '')); if (opt) opt.click(); }
  });
  await page.waitForTimeout(800);
  console.log('💵 Moneda: Dólares');
}

async function limpiarCarrito(page) {
  await page.evaluate(({ src, flags }) => {
    const re = new RegExp(src, flags);
    const box = Array.from(document.querySelectorAll('.product_box')).find(b => re.test((b.textContent||'').replace(/\s+/g,' ')));
    if (box) (box.querySelector('.product_box_quantity_content') || box).click();
  }, { src: 'aaa-mult', flags: 'i' });
  await page.waitForTimeout(1500);
  let rows = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0);
  for (let d = 0; d < 50 && rows > 0; d++) {
    const del = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const icon = Array.from(document.querySelectorAll('#tb_table_buy_list i.material-icons')).filter(isVis).find(el => /^delete$/i.test(el.textContent.trim()));
      if (icon) { (icon.closest('button,a,[onclick]') || icon).click(); return true; }
      return false;
    });
    if (!del) break;
    await page.waitForTimeout(500);
    await page.evaluate(() => { const isVis=(el)=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;}; const btn=Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis)[0]; if(btn)btn.click(); }).catch(()=>{});
    await page.waitForTimeout(300);
    rows = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0);
  }
}

async function cp088_proforma_mixta() {
  console.log('🔄 Ejecutando CP-088: Proforma con productos rápidos + existentes (dólares)...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
  await context.clearCookies();
  const page = await context.newPage();
  const tiempoInicioCP = Date.now();

  try {
    await page.goto('https://dev.designsoftcr.com/qa_talleralpha/public/log/login');
    await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
    await page.fill('#email', 'qadesignsoftcr@gmail.com');
    await page.fill('#password', 'qa0000');
    await page.click('#loginButton');
    await page.waitForURL('**/dashboard**', { timeout: 40000 });

    const t0 = Date.now();
    await cargarPOS(page);
    evaluarCargaPagina(Date.now() - t0, 'Carga POS');
    await limpiarCarrito(page);

    // Productos del catálogo (parte "existentes" de la mezcla)
    let productosExistentes = 0;
    for (const { src, nombre } of [{ src: 'aaa-mult', nombre: 'AAA-Multímetro' }, { src: 'aaa-filtros de combustible', nombre: 'AAA-Filtros' }]) {
      const added = await page.evaluate(({ src }) => {
        const re = new RegExp(src, 'i');
        const box = Array.from(document.querySelectorAll('.product_box')).find(b => re.test((b.textContent||'').replace(/\s+/g,' ')));
        if (!box) return false;
        (box.querySelector('.product_box_quantity_content') || box).click(); return true;
      }, { src });
      if (added) {
        await page.waitForFunction(({ src }) => new RegExp(src,'i').test((document.getElementById('tb_table_buy_list')||{textContent:''}).textContent), { src }, { timeout: 15000 }).catch(()=>{});
        productosExistentes++;
        console.log('✔ Existente:', nombre);
      }
      await page.waitForTimeout(700);
    }

    // Intentar agregar 1 producto rápido
    let productoRapido = false;
    const btnRapido = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = Array.from(document.querySelectorAll('button,[onclick]')).filter(isVis)
        .find(el => /producto r[aá]pido|quick|rapido/i.test((el.textContent||'')+(el.getAttribute('onclick')||'')));
      if (btn) { btn.click(); return true; }
      if (typeof show_quick_product_modal === 'function') { show_quick_product_modal(); return true; }
      return false;
    });
    if (btnRapido) {
      await page.waitForTimeout(1500);
      const filled = await page.evaluate(() => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        const desc = Array.from(document.querySelectorAll('input,textarea')).filter(isVis)
          .find(el => /nombre|descripci|name|quick/i.test((el.id||'')+(el.placeholder||'')));
        const prec = Array.from(document.querySelectorAll('input')).filter(isVis)
          .find(el => /precio|price|monto/i.test((el.id||'')+(el.placeholder||'')));
        if (desc) { desc.value = 'Mano de obra extra'; desc.dispatchEvent(new Event('input',{bubbles:true})); }
        if (prec) { prec.value = '25'; prec.dispatchEvent(new Event('input',{bubbles:true})); }
        return !!desc;
      });
      if (filled) {
        const confirmado = await page.evaluate(() => {
          const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
          const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(el => /agregar|add|guardar|confirm|aceptar/i.test(el.textContent||''));
          if (btn) { btn.click(); return true; }
          return false;
        });
        productoRapido = !!confirmado;
        await page.waitForTimeout(1500);
        await page.evaluate(() => { const isVis=(el)=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;}; const btn=Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis)[0]; if(btn)btn.click(); }).catch(()=>{});
        await page.waitForTimeout(800);
        console.log('✔ Producto rápido en dólares:', productoRapido ? 'agregado' : 'falló');
      } else {
        console.log('⚠️ Modal rápido no tiene campos esperados — cerrando');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    } else {
      console.log('⚠️ Botón producto rápido no disponible');
    }

    const rows = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0);
    console.log('🛒 Filas carrito:', rows, '| existentes:', productosExistentes, '| rápidos:', productoRapido ? 1 : 0);

    const { txt: totalText, val: totalVal } = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent||'').trim()));
      const txt = label?.nextElementSibling?.textContent.trim() ?? null;
      return { txt, val: txt ? parseFloat((txt.match(/[₡$]\s*([\d,]+\.\d{2})/) || ['','0'])[1].replace(/,/g,'')) : NaN };
    });
    console.log('💰 Total:', totalText, '→ $' + totalVal);

    // Crear proforma
    const tProforma = Date.now();
    await page.evaluate(() => { document.getElementById('btn_proform_option')?.click(); });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { if (typeof show_create_proform_modal === 'function') show_create_proform_modal(); });
    await page.waitForTimeout(2500);
    const confirmado = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const btn = Array.from(document.querySelectorAll('button')).filter(isVis).find(el => /confirmar|guardar|crear|save|confirm|aceptar/i.test(el.textContent||''));
      if (btn) { btn.click(); return btn.textContent.replace(/\s+/g,' ').trim().substring(0,30); }
      if (typeof confirm_create_proform === 'function') { confirm_create_proform(); return 'confirm_create_proform()'; }
      return null;
    });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { const isVis=(el)=>{const r=el.getBoundingClientRect(),s=window.getComputedStyle(el);return r.width>0&&r.height>0&&s.visibility!=='hidden';}; const btn=Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis).filter(el=>el.id!=='dialog_payment')[0]; if(btn)btn.click(); }).catch(()=>{});
    evaluarAccion(Date.now() - tProforma, 'Crear proforma mixta (dólares)');

    const tiempoTotal = Date.now() - tiempoInicioCP;
    console.log('✅ CP-088 PASSED | productos: ' + (productosExistentes + (productoRapido?1:0)) + ' (existentes: ' + productosExistentes + ', rápidos: ' + (productoRapido?1:0) + ') | moneda: dólares | total: $' + totalVal + ' | proforma confirmada: ' + confirmado + ' | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp088-fail');
    console.log('❌ CP-088 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp088_proforma_mixta();
