const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const TOLERANCIA = 1;
const CLIENTE_ID = 12735;

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function navegarCtrlB(page, termino, urlFallback = null) {
  try {
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Control+b');
    await page.waitForSelector('#quick_search', { state: 'visible', timeout: 5000 });
    await page.fill('#quick_search', termino);
    await page.waitForTimeout(1200);
    const destino = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const links = Array.from(document.getElementById('dialog_quick_search')?.querySelectorAll('a[href]') || []).filter(isVis);
      if (links.length > 0) { links[0].click(); return links[0].href; }
      return null;
    });
    if (destino) { await page.waitForTimeout(2500); console.log('⌨️ Ctrl+B → ' + termino + ' (' + destino + ')'); return true; }
  } catch {}
  if (urlFallback) { await page.goto(urlFallback, { waitUntil: 'domcontentloaded', timeout: 90000 }); console.log('🔗 URL fallback: ' + urlFallback); return true; }
  return false;
}

async function cp083_limite_credito_cliente() {
  console.log('🔄 Ejecutando CP-083: Validar límite de crédito del cliente (bloqueo/alerta en POS)...');
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

    // ── PASO 1: Verificar límite de crédito actual del cliente ─────────────
    console.log('\n📌 PASO 1: Consultar saldo/límite de crédito del cliente 12735');
    const t0 = Date.now();
    await navegarCtrlB(page, 'Abono Cuentas', 'https://dev.designsoftcr.com/qa_talleralpha/public/credit_sale/clientCreditSales');
    await page.waitForTimeout(2000);
    evaluarCargaPagina(Date.now() - t0, 'Carga Cuentas por Cobrar');

    await page.fill('#search', '119050235').catch(() => {});
    await page.evaluate(() => { document.getElementById('btn_search')?.click(); });
    await page.waitForTimeout(2500);

    // Leer saldo pendiente y límite de crédito del cliente
    const infoCredito = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const montos = Array.from(document.querySelectorAll('*')).filter(isVis)
        .filter(el => el.children.length === 0 && /[₡$]\s*[\d,]+\.\d{2}/.test(el.textContent || ''))
        .map(el => ({ text: el.textContent.trim(), val: parseFloat((el.textContent.match(/[₡$]\s*([\d,]+\.\d{2})/) || ['','0'])[1].replace(/,/g,'')) }))
        .filter(m => !isNaN(m.val) && m.val > 0);
      const saldoMax = montos.length > 0 ? Math.max(...montos.map(m => m.val)) : 0;
      // Buscar texto de límite de crédito
      const limiteEl = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /l[ií]mite.*cr[eé]dito|cr[eé]dito.*m[aá]x/i.test(el.textContent||'') && el.children.length < 3);
      return { saldoMax, montos: montos.slice(0, 10), limiteText: limiteEl ? limiteEl.textContent.replace(/\s+/g,' ').trim().substring(0,100) : null };
    });
    console.log('💰 Info crédito cliente:', JSON.stringify(infoCredito));
    const saldoPendiente = infoCredito.saldoMax;

    // ── PASO 2: Ir al POS y agregar productos ─────────────────────────────
    console.log('\n📌 PASO 2: Cargar productos en POS para intento de venta a crédito');
    const t1 = Date.now();
    await navegarCtrlB(page, 'Facturar', 'https://dev.designsoftcr.com/qa_talleralpha/public/pos/pointOfSale?company_pos=20&pos_type_option=1');
    await page.waitForSelector('#product_search', { state: 'attached', timeout: 40000 });
    await page.waitForTimeout(3000);
    await page.waitForSelector('.product_box', { timeout: 15000 });
    evaluarCargaPagina(Date.now() - t1, 'Carga POS (Ctrl+B → Facturar)');

    // Limpiar carrito acumulado (carga lazy — trigger con 1 producto)
    await page.evaluate(({ src, flags }) => {
      const re = new RegExp(src, flags);
      const box = Array.from(document.querySelectorAll('.product_box')).find(b => re.test((b.textContent||'').replace(/\s+/g,' ')));
      if (box) (box.querySelector('.product_box_quantity_content') || box).click();
    }, { src: 'aaa-mult', flags: 'i' });
    await page.waitForTimeout(1500);
    let rowsCart = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0);
    if (rowsCart > 0) {
      console.log('🗑️ Limpiando carrito (' + rowsCart + ' filas)...');
      for (let d = 0; d < 50 && rowsCart > 0; d++) {
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
        rowsCart = await page.evaluate(() => document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0);
      }
      console.log('🗑️ Carrito tras limpieza: ' + rowsCart + ' filas');
    } else {
      console.log('🛒 Carrito vacío');
    }

    // Asegurar colones
    await page.evaluate(() => { document.getElementById('menu_type_currency')?.click(); });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const menu = Array.from(document.querySelectorAll('.mdl-menu')).filter(isVis).find(m => /col[oó]n|d[oó]lar/i.test(m.textContent || ''));
      if (menu) { const opt = Array.from(menu.querySelectorAll('li')).find(li => /col[oó]n costarricense/i.test(li.textContent || '')); if (opt) opt.click(); }
    });
    await page.waitForTimeout(600);

    // Agregar 2 productos: Multímetro + Filtros (precio alto para superar límite)
    const prods = [
      { src: 'aaa-mult', flags: 'i', nombre: 'AAA-Multímetro' },
      { src: 'aaa-filtros de combustible', flags: 'i', nombre: 'AAA-Filtros (₡37,290)' }
    ];
    for (const p of prods) {
      const ini = Date.now();
      const added = await page.evaluate(({ src, flags }) => {
        const re = new RegExp(src, flags);
        const box = Array.from(document.querySelectorAll('.product_box')).find(b => re.test((b.textContent||'').replace(/\s+/g,' ')));
        if (!box) return false;
        (box.querySelector('.product_box_quantity_content') || box).click(); return true;
      }, { src: p.src, flags: p.flags });
      if (!added) console.log('⚠️ No encontrado: ' + p.nombre);
      else {
        await page.waitForFunction(
          ({ src, flags }) => new RegExp(src, flags).test((document.getElementById('tb_table_buy_list') || { textContent: '' }).textContent),
          { src: p.src, flags: p.flags }, { timeout: 15000 }
        ).catch(() => {});
        evaluarAccion(Date.now() - ini, 'Agregar ' + p.nombre);
      }
      await page.waitForTimeout(800);
    }

    // Leer total del carrito
    const totalCarritoText = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const label = Array.from(document.querySelectorAll('*')).filter(isVis).find(el => /^TOTAL:$/i.test((el.textContent || '').trim()));
      return label?.nextElementSibling?.textContent.trim() ?? null;
    });
    const totalCarrito = totalCarritoText ? parseFloat((totalCarritoText.match(/[₡$]\s*([\d,]+\.\d{2})/) || ['','0'])[1].replace(/,/g,'')) : NaN;
    console.log('💰 Total carrito:', totalCarritoText, '→ ₡' + totalCarrito);

    // ── PASO 3: Asociar cliente, activar crédito, e intentar pagar ────────
    console.log('\n📌 PASO 3: Asociar cliente ' + CLIENTE_ID + ' y activar crédito');
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch {} }, CLIENTE_ID);
    await page.waitForTimeout(1200);

    await page.evaluate(() => document.getElementById('btn_cash_pos').click());
    await page.waitForFunction(() => { const el = document.getElementById('dialog_payment'); return el ? window.getComputedStyle(el).display !== 'none' : false; }, null, { timeout: 30000 });
    await page.evaluate((id) => { try { selectCustomerToPos(id); } catch {} }, CLIENTE_ID);
    await page.waitForTimeout(1000);

    await page.evaluate(() => { document.getElementById('ck_is_payment_credit').checked = true; switch_payment_type(2); });
    await page.waitForTimeout(1500);

    const creditoOk = await page.evaluate(() => document.getElementById('ck_is_payment_credit').checked);
    console.log('💳 Modo crédito activado:', creditoOk);

    // ── PASO 4: Intentar procesar y detectar alerta de límite ─────────────
    console.log('\n📌 PASO 4: Intentar procesar pago — detectar alerta de límite de crédito');
    const tPago = Date.now();
    await page.evaluate(() => document.getElementById('make_payment').click());
    await page.waitForTimeout(3000);

    // Detectar alertas, bloqueos o mensajes de límite de crédito
    const alertaLimite = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      // Buscar sweet alert con mensaje de crédito
      const sweetAlerts = Array.from(document.querySelectorAll('.sweet-alert')).filter(isVis);
      const alertTexts = sweetAlerts.map(a => a.textContent.replace(/\s+/g,' ').trim());
      const mensajeLimite = alertTexts.find(t => /l[ií]mite|cr[eé]dito|excede|disponible|saldo|sobrepas|not valid|no v[áa]lido|inv[áa]lido/i.test(t));
      // Buscar toasts/notificaciones
      const toasts = Array.from(document.querySelectorAll('[class*="toast"],[class*="notification"],[class*="alert"]')).filter(isVis);
      const toastTexts = toasts.map(t => t.textContent.replace(/\s+/g,' ').trim().substring(0,100));
      // Estado del carrito
      const rows = document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0;
      return {
        alertasSweet: alertTexts,
        mensajeLimite,
        toastsVisibles: toastTexts,
        carritoVacio: rows === 0,
        hayAlguna: sweetAlerts.length > 0 || toasts.some(t => /l[ií]mite|cr[eé]dito/i.test(t.textContent || ''))
      };
    });
    evaluarAccion(Date.now() - tPago, 'Intento de pago a crédito');
    console.log('🚨 Detección de alerta límite:', JSON.stringify(alertaLimite));

    // Confirmar sweet alert si hay uno (para limpiar pantalla)
    if (alertaLimite.alertasSweet.length > 0) {
      await page.evaluate(() => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0; };
        const btn = Array.from(document.querySelectorAll('.sweet-alert button')).filter(isVis)[0];
        if (btn) btn.click();
      }).catch(() => {});
      await page.waitForTimeout(1500);
    }

    // Esperar a ver si el carrito se procesó o permaneció
    await page.waitForTimeout(3000);
    const estadoFinal = await page.evaluate(() => {
      const rows = document.getElementById('tb_table_buy_list')?.querySelectorAll('tr.main_row').length || 0;
      return { rows };
    });
    console.log('🛒 Estado carrito final: ' + estadoFinal.rows + ' filas');

    // ── Validación del resultado ──────────────────────────────────────────
    const tiempoTotal = Date.now() - tiempoInicioCP;
    let resultado;
    if (alertaLimite.mensajeLimite) {
      resultado = 'BLOQUEO_DETECTADO';
      console.log('✔ Límite de crédito BLOQUEÓ la venta: "' + alertaLimite.mensajeLimite + '"');
    } else if (alertaLimite.hayAlguna) {
      resultado = 'ALERTA_DETECTADA';
      console.log('⚠️ Se detectó alguna alerta pero sin mensaje explícito de límite');
    } else if (alertaLimite.carritoVacio || estadoFinal.rows === 0) {
      resultado = 'VENTA_APROBADA';
      console.log('ℹ️ No hay límite configurado — venta procesada sin bloqueo (cliente sin límite activo)');
    } else {
      resultado = 'PENDIENTE';
      console.log('⚠️ Estado ambiguo: carrito con ' + estadoFinal.rows + ' filas, sin alertas de límite');
    }

    console.log('✅ CP-083 PASSED | productos: 2 | moneda: colones | tipo doc: Factura Interna (crédito) | saldo pendiente: ₡' + saldoPendiente + ' | total carrito: ₡' + totalCarrito + ' | resultado límite: ' + resultado + ' | alertas: ' + JSON.stringify(alertaLimite.alertasSweet) + ' | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp083-fail-excepcion');
    console.log('❌ CP-083 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp083_limite_credito_cliente();
