const puppeteer = require('puppeteer');
const ics = require('ics');
const fs = require('fs');
const axios = require('axios');
const pdf = require('pdf-parse');
const { startOfISOWeek, addWeeks, addDays, getISOWeek } = require('date-fns');

async function run() {
    console.log("🚀 Version 13: Noon Special Fix...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.goto('https://www.nooncph.dk/ugens-menuer', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 4000));

    const pdfLinks = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
            .filter(a => a.href.includes('.pdf') || a.getAttribute('href')?.startsWith('/s/'))
            .map(a => ({ 
                url: a.href.startsWith('http') ? a.href : 'https://www.nooncph.dk' + a.getAttribute('href'), 
                text: a.innerText.trim().toUpperCase() 
            }));
    });

    console.log(`🔎 Fandt ${pdfLinks.length} links.`);

    const events = [];
    const days = ['MANDAG', 'TIRSDAG', 'ONSDAG', 'TORSDAG', 'FREDAG'];
    
    // Vi bruger den aktuelle uge som standard
    const currentWeek = getISOWeek(new Date());
    const currentYear = 2026;

    for (const link of pdfLinks) {
        // Find ud af hvilken dag det er baseret på linkets tekst
        const foundDay = days.find(d => link.text.includes(d));
        if (!foundDay) continue;

        try {
            console.log(`📄 Henter indhold for ${foundDay}...`);
            const response = await axios.get(link.url, { responseType: 'arraybuffer' });
            const data = await pdf(response.data);
            
            // Rens teksten - fjern overskriften (dagen) så kun menuen er tilbage
            let menuText = data.text
                .replace(new RegExp(foundDay, 'gi'), '')
                .replace(/UGE\s*\d+/gi, '')
                .replace(/\n+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            if (menuText.length > 5) {
                const dayIdx = days.indexOf(foundDay);
                let date = startOfISOWeek(new Date(currentYear, 0, 4));
                date = addWeeks(date, currentWeek - 1);
                date = addDays(date, dayIdx);

                events.push({
                    title: `Noon: ${menuText.substring(0, 40)}...`,
                    start: [date.getFullYear(), date.getMonth() + 1, date.getDate(), 11, 30],
                    duration: { hours: 1 },
                    description: `${foundDay}: ${menuText}\n\nLink: ${link.url}`,
                    url: link.url
                });
                console.log(`✅ Tilføjet ${foundDay} (Uge ${currentWeek})`);
            }
        } catch (err) {
            console.log(`❌ Kunne ikke læse ${foundDay}: ${err.message}`);
        }
    }

    if (events.length > 0) {
        const { value } = ics.createEvents(events);
        fs.writeFileSync('frokost.ics', value);
        console.log(`🎉 Succes! ${events.length} dage klar i kalenderen.`);
    } else {
        console.log("⚠️ Fandt ingen menuer i PDF-filerne.");
    }
    await browser.close();
}
run();
