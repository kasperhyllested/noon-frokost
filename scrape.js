const puppeteer = require('puppeteer');
const ics = require('ics');
const fs = require('fs');
const { startOfISOWeek, addWeeks, addDays } = require('date-fns');

async function run() {
    console.log("Starter robotten (Version 4)...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("Henter Noon...");
    await page.goto('https://www.nooncph.dk/ugens-menuer', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000)); // Giver siden tid til at folde sig ud

    const menuData = await page.evaluate(() => {
        const results = [];
        const days = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag'];
        
        // Vi finder ALLE elementer med tekst og gemmer dem i en flad liste
        const allElements = Array.from(document.querySelectorAll('h1, h2, h3, h4, p, span, div'))
            .map(el => el.innerText ? el.innerText.trim() : "")
            .filter(text => text.length > 0);

        let currentWeek = null;

        for (let i = 0; i < allElements.length; i++) {
            const text = allElements[i];
            const lowerText = text.toLowerCase();

            // Find ugenummer (f.eks. "Uge 8")
            if (lowerText.startsWith('uge ')) {
                const match = lowerText.match(/\d+/);
                if (match) currentWeek = parseInt(match[0]);
            }

            // Hvis vi har fundet en uge, så led efter dagene
            if (currentWeek && days.includes(lowerText)) {
                // Nu tager vi de næste par elementer og samler dem som "menu", 
                // indtil vi rammer en ny ugedag eller en ny uge.
                let foodItems = [];
                for (let j = i + 1; j < i + 10; j++) {
                    if (!allElements[j]) break;
                    const nextText = allElements[j];
                    const nextTextLower = nextText.toLowerCase();

                    // Stop hvis vi rammer en ny dag eller uge
                    if (days.includes(nextTextLower) || nextTextLower.startsWith('uge ')) break;
                    
                    // Tilføj teksten hvis det ligner mad (ikke bare "se menu" eller lign.)
                    if (nextText.length > 5) {
                        foodItems.push(nextText);
                    }
                }

                if (foodItems.length > 0) {
                    results.push({
                        week: currentWeek,
                        day: lowerText,
                        menu: foodItems.join(' - ') // Samler madretterne med en bindestreg
                    });
                }
            }
        }
        return results;
    });

    console.log("Robotten så følgende data:", JSON.stringify(menuData, null, 2));

    const events = [];
    const currentYear = 2026;

    // Fjern dubletter så vi ikke får 5 x mandag
    const uniqueMenu = menuData.filter((v, i, a) => a.findIndex(t => (t.week === v.week && t.day === v.day)) === i);

    uniqueMenu.forEach(item => {
        let monday = startOfISOWeek(new Date(currentYear, 0, 4));
        monday = addWeeks(monday, item.week - 1);
        const dayMap = { 'mandag': 0, 'tirsdag': 1, 'onsdag': 2, 'torsdag': 3, 'fredag': 4 };
        const dayDate = addDays(monday, dayMap[item.day]);

        events.push({
            title: `Noon: ${item.menu.split(' - ')[0]}`, // Første ret som titel
            description: item.menu, // Hele menuen som beskrivelse
            start: [dayDate.getFullYear(), dayDate.getMonth() + 1, dayDate.getDate(), 11, 30],
            duration: { hours: 1 }
        });
    });

    if (events.length > 0) {
        const { error, value } = ics.createEvents(events);
        if (!error) {
            fs.writeFileSync('frokost.ics', value);
            console.log(`SUCCESS: Kalender oprettet med ${events.length} dage.`);
        }
    } else {
        console.log("FEJL: Kunne ikke finde menu-tekst. Gemmer tom kalender.");
        fs.writeFileSync('frokost.ics', 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR');
    }

    await browser.close();
}

run();
