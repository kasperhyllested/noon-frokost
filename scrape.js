const puppeteer = require('puppeteer');
const ics = require('ics');
const fs = require('fs');
const axios = require('axios');
const pdf = require('pdf-parse');
const { startOfISOWeek, addWeeks, addDays } = require('date-fns');

async function run() {
    console.log("🚀 Version 15: URL-Dekodning & Fleksibel RegEx...");
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

    const events = [];
    const daysMap = {
        'MAN': 0, 'TIR': 1, 'ONS': 2, 'TOR': 3, 'FRE': 4,
        'MANDAG': 0, 'TIRSDAG': 1, 'ONSDAG': 2, 'TORSDAG': 3, 'FREDAG': 4
    };
    const currentYear = 2026;

    for (const link of pdfLinks) {
        // Dekod URL'en så "%20" bliver til mellemrum " "
        const decodedUrl = decodeURIComponent(link.url).toUpperCase();
        
        // 1. Find ugedag (vi tjekker både forkortelser som 'MAN' og fulde navne)
        let dayIdx = -1;
        for (const [dayStr, idx] of Object.entries(daysMap)) {
            if (decodedUrl.includes(dayStr) || link.text.includes(dayStr)) {
                dayIdx = idx;
                break;
            }
        }
        if (dayIdx === -1) continue;

        // 2. Find ugenummer med forbedret RegEx
        // Denne leder efter 'UGE' efterfulgt af valgfrit mellemrum/tegn og så et tal
        const weekMatch = decodedUrl.match(/UGE\s*(\d+)/i) || link.text.match(/UGE\s*(\d+)/i);
        let weekNum = weekMatch ? parseInt(weekMatch[1]) : null;

        try {
            console.log(`📄 Behandler: ${decodedUrl.split('/').pop()} (Uge: ${weekNum})`);
            const response = await axios.get(link.url, { responseType: 'arraybuffer' });
            const data = await pdf(response.data);
            
            // Hvis vi stadig ikke har ugenummeret, prøver vi at læse indeni PDF'en
            if (!weekNum) {
                const innerMatch = data.text.match(/uge\s*(\d+)/i);
                weekNum = innerMatch ? parseInt(innerMatch[1]) : 8; 
            }

            let menuText = data.text
                .replace(/\n+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            const mondayOfSelectedWeek = startOfISOWeek(new Date(currentYear, 0, 4));
            const targetDate = addDays(addWeeks(mondayOfSelectedWeek, weekNum - 1), dayIdx);

            events.push({
                title: `Noon: ${menuText.substring(0, 40)}...`,
                start: [targetDate.getFullYear(), targetDate.getMonth() + 1, targetDate.getDate(), 11, 30],
                duration: { hours: 1 },
                description: `UGE ${weekNum}\n\n${menuText}\n\nKilde: ${link.url}`,
                url: link.url
            });
            console.log(`✅ Tilføjet til ${targetDate.toDateString()} (Uge ${weekNum})`);

        } catch (err) {
            console.log(`❌ Fejl ved analyse af ${link.url}: ${err.message}`);
        }
    }

    if (events.length > 0) {
        events.sort((a, b) => {
            return new Date(a.start[0], a.start[1]-1, a.start[2]) - new Date(b.start[0], b.start[1]-1, b.start[2]);
        });

        const { value } = ics.createEvents(events);
        fs.writeFileSync('frokost.ics', value);
        console.log(`🎉 Færdig! ${events.length} unikke menuer gemt.`);
    }
    await browser.close();
}
run();
