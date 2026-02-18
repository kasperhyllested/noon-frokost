const puppeteer = require('puppeteer');
const ics = require('ics');
const fs = require('fs');
const { startOfISOWeek, addWeeks, addDays } = require('date-fns');

async function run() {
    console.log("Starter browser...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    const page = await browser.newPage();
    
    // Vi sætter en "User Agent" så siden tror vi er en normal browser
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

    await page.goto('https://www.nooncph.dk/ugens-menuer', { waitUntil: 'networkidle2' });

    const menuData = await page.evaluate(async () => {
        const results = [];
        
        // Find alle sektioner der ligner en uge-overskrift (f.eks. "Uge 7")
        const sections = Array.from(document.querySelectorAll('h2, h3, span, div')).filter(el => el.innerText.includes('Uge '));

        for (const section of sections) {
            const ugeMatch = section.innerText.match(/Uge\s+(\d+)/i);
            if (!ugeMatch) continue;
            const weekNum = parseInt(ugeMatch[1]);

            // Find forældre-containeren for denne uge
            const parent = section.closest('section') || section.parentElement.parentElement;
            
            // Find alle ugedage i denne sektion
            const dayHeaders = Array.from(parent.querySelectorAll('h3, button, span')).filter(el => 
                ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag'].includes(el.innerText.toLowerCase().trim())
            );

            for (const header of dayHeaders) {
                const dayName = header.innerText.toLowerCase().trim();
                
                // Vi prøver at finde mad-teksten. Ofte ligger den i det næste element.
                // Vi leder specifikt efter tekstblokke
                let contentElement = header.nextElementSibling;
                let foodText = "";
                
                if (contentElement) {
                    foodText = contentElement.innerText.trim();
                }

                if (foodText.length > 5) {
                    results.push({
                        week: weekNum,
                        day: dayName,
                        menu: foodText.split('\n')[0], // Hovedret
                        description: foodText // Hele beskrivelsen
                    });
                }
            }
        }
        return results;
    });

    console.log(`Fundet ${menuData.length} menupunkter.`);

    const events = [];
    const currentYear = new Date().getFullYear();

    menuData.forEach(item => {
        // Find mandag i den pågældende uge
        let monday = startOfISOWeek(new Date(currentYear, 0, 4));
        monday = addWeeks(monday, item.week - 1);
        
        const dayMap = { 'mandag': 0, 'tirsdag': 1, 'onsdag': 2, 'torsdag': 3, 'fredag': 4 };
        const dayDate = addDays(monday, dayMap[item.day]);

        events.push({
            title: `Noon: ${item.menu}`,
            description: item.description,
            start: [dayDate.getFullYear(), dayDate.getMonth() + 1, dayDate.getDate(), 11, 30],
            duration: { hours: 1 },
            location: 'Noon Frokost'
        });
    });

    if (events.length > 0) {
        const { error, value } = ics.createEvents(events);
        if (!error) {
            fs.writeFileSync('frokost.ics', value);
            console.log("frokost.ics fil er skrevet.");
        }
    } else {
        console.log("Kunne ikke udtrække menu-tekst. Tjek sidens struktur.");
    }
    
    await browser.close();
}

run().catch(err => {
    console.error("FEJL:", err);
    process.exit(1);
});
