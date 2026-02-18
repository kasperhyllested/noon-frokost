const puppeteer = require('puppeteer');
const ics = require('ics');
const fs = require('fs');
const axios = require('axios');
const pdf = require('pdf-parse');
const { startOfISOWeek, addWeeks, addDays, format } = require('date-fns');

async function run() {
    console.log("Starter Version 11 (Multi-PDF Deep Scan)...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("Henter Noon-oversigt...");
    await page.goto('https://www.nooncph.dk/ugens-menuer', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    // 1. Find alle PDF links
    const allPdfLinks = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
            .filter(a => a.href.toLowerCase().endsWith('.pdf'))
            .map(a => ({
                url: a.href,
                text: a.innerText.trim()
            }));
    });

    console.log(`Fandt ${allPdfLinks.length} PDF-filer totalt. Begynder analyse...`);

    const finalEvents = [];
    const days = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag'];
    const currentYear = 2026;

    // 2. Gå igennem hver PDF og læs indholdet
    for (const link of allPdfLinks) {
        try {
            // Spring morgenmad og buffet over
            if (link.text.toLowerCase().includes('morgenmad') || link.text.toLowerCase().includes('buffet')) continue;

            console.log(`Læser: ${link.text}...`);
            const response = await axios.get(link.url, { responseType: 'arraybuffer' });
            const pdfData = await pdf(response.data);
            const content = pdfData.text.toLowerCase();

            // Find ud af hvilken uge og dag PDF'en tilhører
            const weekMatch = content.match(/uge\s+(\d+)/i) || link.text.match(/uge\s+(\d+)/i);
            const foundDay = days.find(d => content.includes(d));

            if (weekMatch && foundDay) {
                const weekNum = parseInt(weekMatch[1]);
                const dayIndex = days.indexOf(foundDay);
                
                // Beregn datoen
                let date = startOfISOWeek(new Date(currentYear, 0, 4));
                date = addWeeks(date, weekNum - 1);
                date = addDays(date, dayIndex);

                // Rens teksten for at finde selve maden (vi fjerner "Mandag", "Uge X" osv.)
                let menuText = pdfData.text
                    .replace(/Mandag|Tirsdag|Onsdag|Torsdag|Fredag/gi, '')
                    .replace(/Uge\s+\d+/gi, '')
                    .replace(/\n+/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                finalEvents.push({
                    title: `Noon: ${menuText.substring(0, 45)}...`,
                    start: [date.getFullYear(), date.getMonth() + 1, date.getDate(), 11, 30],
                    duration: { hours: 1 },
                    description: `Dag: ${foundDay.toUpperCase()}\n\nMenu: ${menuText}\n\nLink: ${link.url}`,
                    url: link.url
                });
                console.log(`✅ Tilføjet: ${foundDay} uge ${weekNum}`);
            }
        } catch (err) {
            console.log(`⚠️ Kunne ikke læse PDF (${link.text}): ${err.message}`);
        }
    }

    // 3. Gem kalenderen
    if (finalEvents.length > 0) {
        // Sortér efter dato så det ser pænt ud
        finalEvents.sort((a, b) => new Date(a.start[0], a.start[1]-1, a.start[2]) - new Date(b.start[0], b.start[1]-1, b.start[2]));
        
        const { value } = ics.createEvents(finalEvents);
        fs.writeFileSync('frokost.ics', value);
        console.log(`\nFÆRDIG! Oprettet kalender med ${finalEvents.length} dage.`);
    } else {
        console.log("\nFEJL: Fandt ingen relevante frokost-PDF'er.");
        // Lav en tom fil for at undgå GitHub fejl
        fs.writeFileSync('frokost.ics', 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR');
    }

    await browser.close();
}

run();
