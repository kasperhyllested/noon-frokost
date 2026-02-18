const puppeteer = require('puppeteer');
const ics = require('ics');
const fs = require('fs');
const axios = require('axios');
const pdf = require('pdf-parse');
const { startOfISOWeek, addWeeks, addDays } = require('date-fns');

async function run() {
    console.log("🚀 Version 14: Sorterer uger baseret på URL...");
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

    console.log(`🔎 Analyserer ${pdfLinks.length} links for ugedage og ugenumre...`);

    const events = [];
    const days = ['MANDAG', 'TIRSDAG', 'ONSDAG', 'TORSDAG', 'FREDAG'];
    const currentYear = 2026;

    for (const link of pdfLinks) {
        // 1. Find ugedag fra link-tekst eller URL
        const foundDay = days.find(d => link.text.includes(d) || link.url.toUpperCase().includes(d));
        if (!foundDay) continue;

        // 2. Find ugenummer fra URL (vi leder efter tallet efter 'uge')
        // Matcher f.eks. "uge-8", "uge8", "uge_8"
        const urlMatch = link.url.match(/uge[_-]?(\d+)/i);
        let weekNum = urlMatch ? parseInt(urlMatch[1]) : null;

        // Hvis URL'en ikke har ugenummer, kigger vi i teksten inde i PDF'en (backup)
        try {
            console.log(`📄 Henter: ${foundDay} (Uge: ${weekNum || 'søger...'})`);
            const response = await axios.get(link.url, { responseType: 'arraybuffer' });
            const data = await pdf(response.data);
            
            if (!weekNum) {
                const textMatch = data.text.match(/uge\s*(\d+)/i);
                weekNum = textMatch ? parseInt(textMatch[1]) : 8; // Fallback til uge 8 hvis alt fejler
            }

            let menuText = data.text
                .replace(new RegExp(foundDay, 'gi'), '')
                .replace(/UGE\s*\d+/gi, '')
                .replace(/\n+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            if (menuText.length > 5) {
                const dayIdx = days.indexOf(foundDay);
                let date = startOfISOWeek(new Date(currentYear, 0, 4));
                date = addWeeks(date, weekNum - 1);
                date = addDays(date, dayIdx);

                events.push({
                    title: `Noon: ${menuText.substring(0, 40)}...`,
                    start: [date.getFullYear(), date.getMonth() + 1, date.getDate(), 11, 30],
                    duration: { hours: 1 },
                    description: `UGE ${weekNum} - ${foundDay}:\n\n${menuText}\n\nLink: ${link.url}`,
                    url: link.url
                });
                console.log(`✅ Tilføjet ${foundDay} til uge ${weekNum}`);
            }
        } catch (err) {
            console.log(`❌ Fejl ved ${foundDay}: ${err.message}`);
        }
    }

    if (events.length > 0) {
        // Sorterer events så de ligger kronologisk i filen
        events.sort((a, b) => {
            const d1 = new Date(a.start[0], a.start[1]-1, a.start[2]);
            const d2 = new Date(b.start[0], b.start[1]-1, b.start[2]);
            return d1 - d2;
        });

        const { value } = ics.createEvents(events);
        fs.writeFileSync('frokost.ics', value);
        console.log(`🎉 Færdig! ${events.length} menuer fordelt på de rigtige uger.`);
    }
    await browser.close();
}
run();
