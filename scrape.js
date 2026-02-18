const puppeteer = require('puppeteer');
const ics = require('ics');
const fs = require('fs');
const axios = require('axios');
const pdf = require('pdf-parse');
const { startOfISOWeek, addWeeks, addDays } = require('date-fns');

async function run() {
    console.log("🚀 Version 17.1: Retter titler og tidsplan...");
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
                text: a.innerText.trim()
            }));
    });

    const events = [];
    const daysMap = { 'MAN': 0, 'TIR': 1, 'ONS': 2, 'TOR': 3, 'FRE': 4 };
    const currentYear = 2026;

    for (const link of pdfLinks) {
        const decodedUrl = decodeURIComponent(link.url).toUpperCase();
        const linkText = link.text.toUpperCase();
        
        let dayIdx = -1;
        let dayName = "";
        for (const [dayStr, idx] of Object.entries(daysMap)) {
            if (decodedUrl.includes(dayStr) || linkText.includes(dayStr)) {
                dayIdx = idx;
                dayName = dayStr;
                break;
            }
        }
        if (dayIdx === -1) continue;

        const fileName = decodedUrl.split('/').pop();
        const weekMatch = fileName.match(/UGE\s*(\d+)/i) || fileName.match(/(\d+)\s*UGE/i) || linkText.match(/UGE\s*(\d+)/i);
        let weekNum = weekMatch ? parseInt(weekMatch[1]) : null;

        if (!weekNum) continue;

        try {
            const response = await axios.get(link.url, { responseType: 'arraybuffer' });
            const data = await pdf(response.data);
            
            let fullText = data.text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

            // Rigtig RegEx til at finde maden efter "Full noon:"
            let eventTitle = `Frokost: ${dayName}`; 
            const fullNoonMatch = fullText.match(/Full noon:\s*(.*?)(?=Dagens inspiration|Green noon|Lun ret|$)/i);
            
            if (fullNoonMatch && fullNoonMatch[1]) {
                let dish = fullNoonMatch[1].trim().replace(/^[:\s-]+/, '');
                eventTitle = `Frokost: ${dish.substring(0, 65)}`;
            }

            const mondayOfSelectedWeek = startOfISOWeek(new Date(currentYear, 0, 4));
            const targetDate = addDays(addWeeks(mondayOfSelectedWeek, weekNum - 1), dayIdx);

            events.push({
                title: eventTitle,
                start: [targetDate.getFullYear(), targetDate.getMonth() + 1, targetDate.getDate(), 11, 30],
                duration: { minutes: 30 },
                description: `UGE ${weekNum}\n\n${fullText}\n\nKilde: ${link.url}`,
                url: link.url
            });
            console.log(`✅ OK: ${eventTitle} (${targetDate.toISOString().split('T')[0]})`);

        } catch (err) {
            console.log(`❌ Fejl: ${err.message}`);
        }
    }

    if (events.length > 0) {
        const uniqueEvents = [];
        const seenDates = new Set();
        events.sort((a,b) => b.description.length - a.description.length);
        
        for (const e of events) {
            const dateKey = e.start.join('-');
            if (!seenDates.has(dateKey)) {
                uniqueEvents.push(e);
                seenDates.add(dateKey);
            }
        }

        const { value } = ics.createEvents(uniqueEvents);
        fs.writeFileSync('frokost.ics', value);
        console.log(`🎉 Færdig! Kalender opdateret.`);
    }
    await browser.close();
}
run();
