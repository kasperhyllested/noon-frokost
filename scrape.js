const puppeteer = require('puppeteer');
const ics = require('ics');
const fs = require('fs');
const axios = require('axios');
const pdf = require('pdf-parse');
const { startOfISOWeek, addWeeks, addDays } = require('date-fns');

async function run() {
    console.log("🚀 Starter Version 12 (Squarespace/Noon Special)...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.goto('https://www.nooncph.dk/ugens-menuer', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 5000));

    const pdfLinks = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
            .filter(a => a.href.includes('.pdf') || a.href.includes('/s/'))
            .map(a => ({ url: a.href, text: a.innerText.trim() }));
    });

    console.log(`🔎 Fandt ${pdfLinks.length} mulige links.`);

    const events = [];
    const days = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag'];
    const currentYear = 2026;

    for (const link of pdfLinks) {
        if (link.text.toLowerCase().includes('morgenmad')) continue;

        try {
            console.log(`📄 Analyserer: ${link.text}...`);
            const response = await axios.get(link.url, { responseType: 'arraybuffer' });
            const data = await pdf(response.data);
            const text = data.text;
            const lowerText = text.toLowerCase();

            // Find uge (leder efter "Uge 8", "Uge 08" osv)
            const weekMatch = lowerText.match(/uge\s*(\d+)/i) || link.text.match(/uge\s*(\d+)/i);
            const weekNum = weekMatch ? parseInt(weekMatch[1]) : null;
            
            // Find dag
            const foundDay = days.find(d => lowerText.includes(d));

            if (weekNum && foundDay) {
                const dayIdx = days.indexOf(foundDay);
                let date = startOfISOWeek(new Date(currentYear, 0, 4));
                date = addWeeks(date, weekNum - 1);
                date = addDays(date, dayIdx);

                // Rens teksten - vi tager alt efter ugedagen
                let cleanMenu = text.split(new RegExp(foundDay, 'i'))[1] || text;
                cleanMenu = cleanMenu.replace(/Uge\s*\d+/gi, '')
                                     .replace(/\n+/g, ' ')
                                     .replace(/\s+/g, ' ')
                                     .trim();

                events.push({
                    title: `Noon: ${cleanMenu.substring(0, 40)}...`,
                    start: [date.getFullYear(), date.getMonth() + 1, date.getDate(), 11, 30],
                    duration: { hours: 1 },
                    description: `MENU: ${cleanMenu}\n\nKilde: ${link.url}`,
                    url: link.url
                });
                console.log(`✅ Succes: ${foundDay} uge ${weekNum}`);
            }
        } catch (err) {
            console.log(`❌ Fejl ved ${link.text}: ${err.message}`);
        }
    }

    if (events.length > 0) {
        const { value } = ics.createEvents(events);
        fs.writeFileSync('frokost.ics', value);
        console.log(`\n🎉 FÆRDIG! ${events.length} dage tilføjet til kalenderen.`);
    } else {
        console.log("\n⚠️ Ingen frokost-menuer fundet.");
        fs.writeFileSync('frokost.ics', 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR');
    }
    await browser.close();
}
run();
