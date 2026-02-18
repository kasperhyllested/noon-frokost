const puppeteer = require('puppeteer');
const ics = require('ics');
const fs = require('fs');
const { startOfISOWeek, addWeeks, addDays } = require('date-fns');

async function run() {
    console.log("Starter Version 6 (PDF & Accordion Hunter)...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("Henter Noon...");
    await page.goto('https://www.nooncph.dk/ugens-menuer', { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Tving alle menuer til at åbne sig ved at klikke på alt, der ligner en knap eller ugedag
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, .accordion-header, h3, h4'));
        buttons.forEach(b => b.click());
    });

    await new Promise(r => setTimeout(r, 5000)); // Vent på at PDF-links eller tekst loades

    const data = await page.evaluate(() => {
        const results = { pdfs: [], textMenu: [] };
        const days = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag'];
        
        // 1. Leder efter PDF-links
        const links = Array.from(document.querySelectorAll('a'));
        links.forEach(a => {
            const href = a.href.toLowerCase();
            const text = a.innerText.toLowerCase();
            if (href.endsWith('.pdf') && (text.includes('uge') || text.includes('menu'))) {
                results.pdfs.push({ title: a.innerText.trim(), url: a.href });
            }
        });

        // 2. Leder efter tekst (hvis PDF fejler)
        const allElements = Array.from(document.querySelectorAll('h1, h2, h3, h4, p, span, div, b'));
        let currentWeek = 8; // Fallback til uge 8

        days.forEach(day => {
            const dayEl = allElements.find(el => el.innerText.trim().toLowerCase() === day);
            if (dayEl) {
                let textFound = "";
                let sibling = dayEl.nextElementSibling || dayEl.parentElement.nextElementSibling;
                if (sibling && sibling.innerText.length > 5) {
                    textFound = sibling.innerText.trim().split('\n')[0];
                }
                if (textFound) results.textMenu.push({ week: currentWeek, day: day, menu: textFound });
            }
        });
        
        return results;
    });

    console.log("Fundet PDF links:", data.pdfs);
    console.log("Fundet tekst menu:", data.textMenu);

    const events = [];
    const currentYear = 2026;

    // Hvis vi fandt en tekst-menu, bruger vi den
    if (data.textMenu.length > 0) {
        data.textMenu.forEach(item => {
            let monday = startOfISOWeek(new Date(currentYear, 0, 4));
            monday = addWeeks(monday, item.week - 1);
            const dayMap = { 'mandag': 0, 'tirsdag': 1, 'onsdag': 2, 'torsdag': 3, 'fredag': 4 };
            const dayDate = addDays(monday, dayMap[item.day]);

            events.push({
                title: `Noon: ${item.menu}`,
                start: [dayDate.getFullYear(), dayDate.getMonth() + 1, dayDate.getDate(), 11, 30],
                duration: { hours: 1 },
                description: `Dagens menu: ${item.menu}`
            });
        });
    } 
    // Hvis vi KUN fandt PDF-links, laver vi ét opslag pr. PDF
    else if (data.pdfs.length > 0) {
        const today = new Date();
        data.pdfs.forEach((pdf, index) => {
            events.push({
                title: `Se Noon Menu (${pdf.title})`,
                start: [currentYear, today.getMonth() + 1, today.getDate() + index, 11, 30],
                duration: { hours: 1 },
                description: `Klik her for at se menu-PDF: ${pdf.url}`,
                url: pdf.url
            });
        });
    }

    // Opret filen uanset hvad for at undgå GitHub fejl
    const { error, value } = ics.createEvents(events.length > 0 ? events : [{
        title: 'Noon: Tjek hjemmesiden (Ingen menu fundet)',
        start: [2026, 2, 18, 11, 30],
        duration: { hours: 1 },
        description: 'Robotten kunne ikke udtrække menuen automatisk i dag.'
    }]);

    fs.writeFileSync('frokost.ics', value);
    console.log(`Kalender fil gemt med ${events.length} begivenheder.`);
    await browser.close();
}

run();
