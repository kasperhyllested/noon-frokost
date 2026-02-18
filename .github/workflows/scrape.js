const puppeteer = require('puppeteer');
const ics = require('ics');
const fs = require('fs');
const { startOfISOWeek, addWeeks, addDays } = require('date-fns');

async function run() {
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();
    
    // Gå til siden og vent på at indholdet er indlæst
    await page.goto('https://www.nooncph.dk/ugens-menuer', { waitUntil: 'networkidle2' });

    const menuData = await page.evaluate(() => {
        const results = [];
        // Vi leder efter overskrifter der indeholder "Uge"
        const elements = Array.from(document.querySelectorAll('h1, h2, h3, div'));
        
        let currentWeek = null;
        
        elements.forEach(el => {
            const text = el.innerText.trim();
            if (text.match(/Uge\s+\d+/i)) {
                currentWeek = parseInt(text.match(/\d+/)[0]);
            }
            
            // Vi leder efter ugedage og tager teksten lige efter dem
            const days = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag'];
            days.forEach(day => {
                if (text.toLowerCase() === day && currentWeek) {
                    // Vi finder det næste element (selve maden)
                    const foodText = el.nextElementSibling ? el.nextElementSibling.innerText : "Menu ikke fundet";
                    results.push({
                        week: currentWeek,
                        day: day,
                        menu: foodText.split('\n')[0] // Vi tager kun den første linje som titel
                    });
                }
            });
        });
        return results;
    });

    const events = [];
    const currentYear = new Date().getFullYear();

    menuData.forEach(item => {
        let monday = startOfISOWeek(new Date(currentYear, 0, 4));
        monday = addWeeks(monday, item.week - 1);
        
        const dayMap = { 'mandag': 0, 'tirsdag': 1, 'onsdag': 2, 'torsdag': 3, 'fredag': 4 };
        const dayDate = addDays(monday, dayMap[item.day]);

        events.push({
            title: `Noon: ${item.menu}`,
            description: `Dagens menu (${item.day}):\n${item.menu}`,
            start: [dayDate.getFullYear(), dayDate.getMonth() + 1, dayDate.getDate(), 11, 30],
            duration: { hours: 1 },
            location: 'Kantine'
        });
    });

    if (events.length > 0) {
        const { error, value } = ics.createEvents(events);
        if (!error) {
            fs.writeFileSync('frokost.ics', value);
            console.log(`Succes! Lavede ${events.length} begivenheder.`);
        }
    } else {
        console.log("Kunne ikke finde nogen menu-data. Tjek om Noon har ændret layout.");
    }
    
    await browser.close();
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
