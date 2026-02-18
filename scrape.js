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
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log("Besøger Noon...");
    // Vi venter til siden er helt færdig med at loade alt
    await page.goto('https://www.nooncph.dk/ugens-menuer', { waitUntil: 'networkidle0', timeout: 60000 });

    // Vi giver siden 2 sekunder ekstra til at "tegne" menuen
    await new Promise(r => setTimeout(r, 2000));

    console.log("Læser menu-data...");
    const menuData = await page.evaluate(() => {
        const results = [];
        const days = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag'];
        
        // Vi finder alle tekst-elementer på siden
        const elements = Array.from(document.querySelectorAll('h1, h2, h3, h4, p, span, div'));
        let currentWeek = null;

        for (let i = 0; i < elements.length; i++) {
            const el = elements[i];
            const text = el.innerText.trim().toLowerCase();
            
            // Find ugenummer (f.eks. "Uge 8")
            if (text.includes('uge ')) {
                const match = text.match(/uge\s+(\d+)/);
                if (match) {
                    currentWeek = parseInt(match[1]);
                    console.log("Fandt uge:", currentWeek);
                }
            }

            // Hvis vi har en uge, og vi finder en ugedag
            if (currentWeek && days.includes(text)) {
                // Vi leder efter den første tekstblok efter ugedagen, som er lang nok til at være mad
                let foodText = "";
                for (let j = 1; j <= 10; j++) {
                    const nextEl = elements[i + j];
                    if (nextEl) {
                        const nextText = nextEl.innerText.trim();
                        // Mad-beskrivelser er typisk længere end blot ugedagen eller hjælpetekst
                        if (nextText.length > 15 && !days.includes(nextText.toLowerCase())) {
                            foodText = nextText;
                            break; 
                        }
                    }
                }
                
                if (foodText) {
                    results.push({ week: currentWeek, day: text, menu: foodText });
                }
            }
        }
        return results;
    });

    console.log("Fundet data antal:", menuData.length);
    console.log("Data detaljer:", JSON.stringify(menuData, null, 2));

    const events = [];
    const currentYear = 2026;

    menuData.forEach(item => {
        let monday = startOfISOWeek(new Date(currentYear, 0, 4));
        monday = addWeeks(monday, item.week - 1);
        
        const dayMap = { 'mandag': 0, 'tirsdag': 1, 'onsdag': 2, 'torsdag': 3, 'fredag': 4 };
        const dayDate = addDays(monday, dayMap[item.day]);

        // Vi gør titlen lidt pænere ved at tage den første linje af maden
        const title = item.menu.split('\n')[0].substring(0, 50);

        events.push({
            title: `Noon: ${title}`,
            description: item.menu,
            start: [dayDate.getFullYear(), dayDate.getMonth() + 1, dayDate.getDate(), 11, 30],
            duration: { hours: 1 }
        });
    });

    if (events.length > 0) {
        const { error, value } = ics.createEvents(events);
        if (!error) {
            fs.writeFileSync('frokost.ics', value);
            console.log("SUCCESS: frokost.ics er oprettet med " + events.length + " dage!");
        }
    } else {
        console.log("FEJL: Ingen menu fundet på siden. Siden ser ud til at være tom for robotten.");
    }
    await browser.close();
}

run().catch(err => {
    console.error("KRITISK FEJL:", err);
    process.exit(1);
});
