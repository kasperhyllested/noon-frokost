const puppeteer = require('puppeteer');
const ics = require('ics');
const fs = require('fs');
const { startOfISOWeek, addWeeks, addDays } = require('date-fns');

async function run() {
    console.log("Starter Super-Scraper...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("Henter siden...");
    await page.goto('https://www.nooncph.dk/ugens-menuer', { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Vi venter på at siden er "faldet til ro"
    await new Promise(r => setTimeout(r, 5000));

    const menuData = await page.evaluate(() => {
        const found = [];
        const days = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag'];
        
        // Vi tager alle elementer der indeholder tekst
        const allElements = Array.from(document.querySelectorAll('div, span, h1, h2, h3, h4, p'));
        let currentWeek = null;

        allElements.forEach((el) => {
            const text = el.innerText ? el.innerText.trim().toLowerCase() : "";
            
            // Led efter ugenummer
            if (text.includes('uge ') && text.length < 15) {
                const num = text.match(/\d+/);
                if (num) currentWeek = parseInt(num[0]);
            }

            // Hvis vi har en uge, led efter dage
            if (currentWeek && days.includes(text)) {
                // Find den menu der hører til dagen. 
                // Vi kigger på de elementer der ligger fysisk tæt på ugedagen i koden.
                let potentialMenu = "";
                let sibling = el.nextElementSibling;
                
                // Vi tjekker de næste 3 nabo-elementer for at finde en menu-beskrivelse
                for (let i = 0; i < 3; i++) {
                    if (sibling && sibling.innerText.trim().length > 10) {
                        potentialMenu = sibling.innerText.trim();
                        break;
                    }
                    if (sibling) sibling = sibling.nextElementSibling;
                }

                if (potentialMenu) {
                    found.push({
                        week: currentWeek,
                        day: text,
                        menu: potentialMenu
                    });
                }
            }
        });
        return found;
    });

    // FJERN DUPLIKATER (Da vi kigger på mange elementer, kan vi finde det samme flere gange)
    const uniqueMenu = menuData.filter((v, i, a) => a.findIndex(t => (t.week === v.week && t.day === v.day)) === i);

    console.log("Fundet unikke dage:", uniqueMenu.length);
    console.log("Data:", JSON.stringify(uniqueMenu, null, 2));

    const events = [];
    const currentYear = 2026;

    uniqueMenu.forEach(item => {
        let monday = startOfISOWeek(new Date(currentYear, 0, 4));
        monday = addWeeks(monday, item.week - 1);
        const dayMap = { 'mandag': 0, 'tirsdag': 1, 'onsdag': 2, 'torsdag': 3, 'fredag': 4 };
        const dayDate = addDays(monday, dayMap[item.day]);

        events.push({
            title: `Noon: ${item.menu.split('\n')[0]}`,
            description: item.menu,
            start: [dayDate.getFullYear(), dayDate.getMonth() + 1, dayDate.getDate(), 11, 30],
            duration: { hours: 1 }
        });
    });

    if (events.length > 0) {
        const { error, value } = ics.createEvents(events);
        if (!error) {
            fs.writeFileSync('frokost.ics', value);
            console.log("Frokost.ics oprettet!");
        }
    } else {
        console.log("Ingen menu fundet. Prøver at gemme en tom fil for at undgå fejl.");
        fs.writeFileSync('frokost.ics', 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR');
    }

    await browser.close();
}

run();
