const puppeteer = require('puppeteer');
const ics = require('ics');
const fs = require('fs');
const { startOfISOWeek, addWeeks, addDays } = require('date-fns');

async function run() {
    console.log("Starter robotten...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });
    const page = await browser.newPage();
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
    
    console.log("Besøger Noon...");
    await page.goto('https://www.nooncph.dk/ugens-menuer', { waitUntil: 'networkidle2' });

    const menuData = await page.evaluate(() => {
        const results = [];
        const days = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag'];
        
        // Find alle overskrifter (h2, h3) og tekststykker
        const allElements = Array.from(document.querySelectorAll('h1, h2, h3, p, span, div'));
        let currentWeek = null;

        allElements.forEach((el, index) => {
            const text = el.innerText.trim().toLowerCase();
            
            // Find ugenummer
            if (text.includes('uge ')) {
                const match = text.match(/uge\s+(\d+)/);
                if (match) currentWeek = parseInt(match[1]);
            }

            // Hvis vi har fundet en uge, så led efter dage
            if (currentWeek && days.includes(text)) {
                // Vi tager teksten fra de næste par elementer for at være sikre på at få maden med
                let foodText = "";
                for (let i = 1; i <= 3; i++) {
                    const nextEl = allElements[index + i];
                    if (nextEl && nextEl.innerText.length > 10 && !days.includes(nextEl.innerText.toLowerCase())) {
                        foodText = nextEl.innerText.split('\n')[0]; // Tag første linje
                        break;
                    }
                }
                
                if (foodText) {
                    results.push({ week: currentWeek, day: text, menu: foodText });
                }
            }
        });
        return results;
    });

    console.log("Fundet data:", menuData);

    const events = [];
    const currentYear = 2026; // Vi tvinger den til 2026 som du bad om

    menuData.forEach(item => {
        let monday = startOfISOWeek(new Date(currentYear, 0, 4));
        monday = addWeeks(monday, item.week - 1);
        
        const dayMap = { 'mandag': 0, 'tirsdag': 1, 'onsdag': 2, 'torsdag': 3, 'fredag': 4 };
        const dayDate = addDays(monday, dayMap[item.day]);

        events.push({
            title: `Lunch: ${item.menu}`,
            description: `Menu: ${item.menu} (Uge ${item.week})`,
            start: [dayDate.getFullYear(), dayDate.getMonth() + 1, dayDate.getDate(), 11, 30],
            duration: { hours: 1 }
        });
    });

    if (events.length > 0) {
        const { error, value } = ics.createEvents(events);
        if (!error) {
            fs.writeFileSync('frokost.ics', value);
            console.log("SUCCESS: frokost.ics er oprettet!");
        }
    } else {
        console.log("FEJL: Ingen menu fundet på siden.");
    }
    await browser.close();
}

run();
