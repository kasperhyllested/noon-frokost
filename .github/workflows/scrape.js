const puppeteer = require('puppeteer');
const ics = require('ics');
const fs = require('fs');
const { startOfISOWeek, addWeeks, addDays, format } = require('date-fns');

async function run() {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.goto('https://www.nooncph.dk/ugens-menuer');

    // Her læser vi alt tekst fra siden
    const data = await page.evaluate(() => {
        return document.body.innerText;
    });

    const events = [];
    const currentYear = new Date().getFullYear();

    // Find ugenumre (f.eks. "Uge 7")
    const weekMatches = data.matchAll(/Uge\s+(\d+)/gi);
    
    for (const match of weekMatches) {
        const weekNum = parseInt(match[1]);
        const sectionStart = match.index;
        
        // Find den mandag der passer til ugenummeret
        let monday = startOfISOWeek(new Date(currentYear, 0, 4)); 
        monday = addWeeks(monday, weekNum - 1);

        const days = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag'];
        
        days.forEach((day, index) => {
            const dayDate = addDays(monday, index);
            const dateStr = format(dayDate, 'yyyy-MM-dd');
            
            // Simpel logik: Vi leder efter teksten mellem to ugedage
            // (Dette er en forenklet version - kan finpudses alt efter sidens layout)
            events.push({
                title: `Noon Frokost: ${day}`,
                description: `Menu for ${day} i uge ${weekNum}`,
                start: [dayDate.getFullYear(), dayDate.getMonth() + 1, dayDate.getDate(), 11, 30],
                duration: { hours: 1 }
            });
        });
    }

    const { error, value } = ics.createEvents(events);
    if (!error) {
        fs.writeFileSync('frokost.ics', value);
        console.log("Kalender opdateret!");
    }
    
    await browser.close();
}

run();
