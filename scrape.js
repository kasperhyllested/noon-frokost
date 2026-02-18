const puppeteer = require('puppeteer');
const ics = require('ics');
const fs = require('fs');
const { startOfISOWeek, addWeeks, addDays } = require('date-fns');

async function run() {
    console.log("Starter Deep Scan (Version 5)...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });
    const page = await browser.newPage();
    
    // Vi lader som om vi er en helt almindelig Chrome på en Mac
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    console.log("Henter Noon...");
    await page.goto('https://www.nooncph.dk/ugens-menuer', { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Vi venter 8 sekunder – Noon er tung at loade færdig
    await new Promise(r => setTimeout(r, 8000));

    const menuData = await page.evaluate(() => {
        const results = [];
        const days = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag'];
        
        // Find ugenummeret først (led efter tekst der indeholder "Uge")
        let currentWeek = null;
        const allTextElements = Array.from(document.querySelectorAll('h1, h2, h3, h4, p, span, div, b'));
        
        for (const el of allTextElements) {
            const txt = el.innerText.trim();
            if (txt.toLowerCase().includes('uge ')) {
                const match = txt.match(/\d+/);
                if (match) currentWeek = parseInt(match[0]);
            }
        }

        // Hvis vi ikke fandt en uge, gætter vi på denne uge (uge 8 i 2026)
        if (!currentWeek) currentWeek = 8; 

        // Nu leder vi efter dagene
        days.forEach(day => {
            // Find det element der præcis hedder ugedagen
            const dayElement = allTextElements.find(el => el.innerText.trim().toLowerCase() === day);
            
            if (dayElement) {
                // Vi leder i de næste 15 elementer i HTML-koden efter mad-tekst
                let foodFound = "";
                let current = dayElement.nextElementSibling;
                
                // Hvis der ikke er en nabo, kigger vi opad og finder forældrens nabo
                if (!current) current = dayElement.parentElement.nextElementSibling;

                for (let i = 0; i < 5; i++) {
                    if (current && current.innerText.trim().length > 10) {
                        foodFound = current.innerText.trim().split('\n')[0];
                        break;
                    }
                    if (current) current = current.nextElementSibling;
                }

                if (foodFound) {
                    results.push({ week: currentWeek, day: day, menu: foodFound });
                }
            }
        });
        
        return results;
    });

    console.log("Robotten fandt disse retter:", JSON.stringify(menuData, null, 2));

    const events = [];
    const currentYear = 2026;

    menuData.forEach(item => {
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

    if (events.length > 0) {
        const { error, value } = ics.createEvents(events);
        if (!error) {
            fs.writeFileSync('frokost.ics', value);
            console.log(`SUCCESS: Kalender oprettet med ${events.length} entries.`);
        }
    } else {
        console.log("FEJL: Menuen blev fundet, men teksten var tom. Gemmer fallback.");
        fs.writeFileSync('frokost.ics', 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR');
    }

    await browser.close();
}

run();
