const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const URL_HISTORIAL = 'https://dev.designsoftcr.com/qa_talleralpha/public/proform/printPosProform';

const screenshotOnFail = async (page, name) => {
  try { const dir = path.join(__dirname,'..','..','..','reports','screenshots'); fs.mkdirSync(dir,{recursive:true}); await page.screenshot({path:path.join(dir,name+'-'+Date.now()+'.png'),timeout:5000}); } catch {}
};
function evaluarCargaPagina(ms, e) { if(ms>8000) console.log('❌ PERFORMANCE FAILED: '+e+' tardó '+ms+'ms'); else if(ms>3000) console.log('⚠️ LENTO: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }
function evaluarAccion(ms, e) { if(ms>4000) console.log('❌ Acción lenta: '+e+' tardó '+ms+'ms'); else if(ms>1500) console.log('⚠️ Acción algo lenta: '+e+' tardó '+ms+'ms'); else console.log('⏱ '+e+': '+ms+'ms'); }

async function cp084_historial_proformas() {
  console.log('🔄 Ejecutando CP-084: Historial de proformas — abrir y validar que carga lista...');
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

    // Navegar al historial de proformas
    const t0 = Date.now();
    await page.goto(URL_HISTORIAL, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(2500);
    evaluarCargaPagina(Date.now() - t0, 'Carga historial Cotizaciones');

    const url = page.url();
    const title = await page.title();
    console.log('📍 URL:', url);
    console.log('📋 Título:', title);

    // Validar elementos clave del historial
    const elementos = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      return {
        receip_search: !!document.getElementById('receip_search'),
        start_date: !!document.getElementById('start_date'),
        end_date: !!document.getElementById('end_date'),
        btn_search: !!document.getElementById('btn_search_receip'),
        btn_proform: !!document.getElementById('btn_proform'),
        btn_consignation: !!document.getElementById('btn_consignation_proform'),
        btn_workshop: !!document.getElementById('btn_workshop_proform'),
        header: Array.from(document.querySelectorAll('h1,h2,h3,.breadcrumb')).filter(isVis).map(el => el.textContent.replace(/\s+/g,' ').trim()).join(' | ')
      };
    });
    console.log('✔ Elementos validados:', JSON.stringify(elementos));

    // Verificar que todos los elementos esperados están presentes
    const faltantes = Object.entries(elementos).filter(([k,v]) => k !== 'header' && !v).map(([k]) => k);
    if (faltantes.length > 0) { console.log('⚠️ Elementos faltantes:', faltantes); }
    else { console.log('✔ Todos los elementos del historial están presentes'); }

    // Establecer rango de fechas y buscar proformas
    const tBuscar = Date.now();
    await page.evaluate(() => {
      const s = document.getElementById('start_date'); if (s) s.value = '2026-01-01';
      const e = document.getElementById('end_date'); if (e) e.value = '2026-07-10';
    });
    await page.evaluate(() => { document.getElementById('btn_search_receip')?.click(); });
    await page.waitForTimeout(3000);
    evaluarAccion(Date.now() - tBuscar, 'Buscar proformas (rango 2026-01 a 2026-07)');

    // Capturar lo que aparece en la lista
    const listaInfo = await page.evaluate(() => {
      const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const proformItems = Array.from(document.querySelectorAll('[id*="proform_client_name"],[class*="proform-item"],[class*="proform_item"]')).filter(isVis).length;
      const tableRows = Array.from(document.querySelectorAll('table tr')).filter(isVis).length;
      const anyContent = Array.from(document.querySelectorAll('[class*="proform"],[id*="proform"]')).filter(isVis).map(el => ({ id: el.id.substring(0,30), cls: (el.className||'').substring(0,30), txt: el.textContent.replace(/\s+/g,' ').trim().substring(0,50) })).filter(x => x.txt).slice(0,5);
      return { proformItems, tableRows, anyContent };
    });
    console.log('📊 Lista tras Buscar:', JSON.stringify(listaInfo));

    // Probar las tres pestañas de tipo
    for (const [btnId, label] of [['btn_proform','Proformas'], ['btn_consignation_proform','Prof. Consignación'], ['btn_workshop_proform','Prof. Taller']]) {
      const tTab = Date.now();
      await page.evaluate((id) => { document.getElementById(id)?.click(); }, btnId);
      await page.waitForTimeout(1500);
      evaluarAccion(Date.now() - tTab, 'Tab ' + label);
      const tabContent = await page.evaluate(() => {
        const isVis = (el) => { const r = el.getBoundingClientRect(), s = window.getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
        return Array.from(document.querySelectorAll('[class*="proform"]')).filter(isVis).length;
      });
      console.log('  Tab ' + label + ': ' + tabContent + ' elementos visibles');
    }

    const tiempoTotal = Date.now() - tiempoInicioCP;
    const elementosOk = faltantes.length === 0;
    console.log((elementosOk ? '✅' : '⚠️') + ' CP-084 ' + (elementosOk ? 'PASSED' : 'RESULT') + ' | módulo: Cotizaciones/Proformas | URL: ' + url + ' | elementos presentes: ' + (elementosOk ? 'todos' : 'faltan: '+faltantes.join(',')) + ' | header: "' + elementos.header.substring(0,60) + '" | lista items: ' + listaInfo.proformItems + ' | tiempo: ' + tiempoTotal + 'ms');

  } catch (error) {
    await screenshotOnFail(page, 'cp084-fail');
    console.log('❌ CP-084 FAILED: ' + error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}
cp084_historial_proformas();
