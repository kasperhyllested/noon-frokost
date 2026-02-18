const puppeteer = require('puppeteer');
const ics = require('ics');
const fs = require('fs');
const axios = require('axios');
const pdf = require('pdf-parse');
const { startOfISOWeek, addWeeks, addDays } = require('date-fns');

async function run() {
    console.log("🚀 Version 16: Deep-scanning URL for week numbers...");
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
        
        // 1. Find ugedag (Søger i URL først, så i knap-tekst)
        let dayIdx = -1;
        for (const [dayStr, idx] of Object.entries(daysMap)) {
            if (decodedUrl.includes(dayStr) || linkText.includes(dayStr)) {
                dayIdx = idx;
                break;
            }
        }
        if (dayIdx === -1) continue;

        // 2. Find ugenummer (Vi leder efter tallet der står lige ved siden af "UGE")
        // Vi fjerner alt støj og kigger kun på filnavnet til sidst
        const fileName = decodedUrl.split('/').pop();
        const weekMatch = fileName.match(/UGE\s*(\d+)/i) || fileName.match(/(\d+)\s*UGE/i) || linkText.match(/UGE\s*(\d+)/i);
        
        let weekNum = weekMatch ? parseInt(weekMatch[1]) : null;

        // Hvis vi stadig mangler uge, så gæt ud fra om linket ligger øverst eller nederst på siden
        // Men her tvinger vi den til at fejle hvis ingen uge findes, så vi ikke får dubletter
        if (!weekNum) {
            console.log(`⚠️ Kunne ikke finde uge for: ${fileName}. Springer over.`);
            continue;
        }

        try {
            console.log(`📄 Henter uge ${weekNum}, dag ${dayIdx}: ${fileName}`);
            const response = await axios.get(link.url, { responseType: 'arraybuffer' });
            const data = await pdf(response.data);
            
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
                description: `UGE ${weekNum} - ${targetDate.toLocaleDateString('da-DK')}\n\n${menuText}\n\nKilde: ${link.url}`,
                url: link.url
            });
            console.log(`✅ Succes: Placeret på ${targetDate.toISOString().split('T')[0]}`);

        } catch (err) {
            console.log(`❌ Fejl: ${err.message}`);
        }
    }

    if (events.length > 0) {
        // Fjern eventuelle dubletter hvis to links peger på samme dag
        const uniqueEvents = [];
        const seenDates = new Set();
        events.sort((a,b) => b.description.length - a.description.length); // Tag den med mest tekst først
        
        for (const e of events) {
            const dateStr = e.start.join('-');
            if (!seenDates.has(dateStr)) {
                uniqueEvents.push(e);
                seenDates.add(dateStr);
            }
        }

        const { value } = ics.createEvents(uniqueEvents);
        fs.writeFileSync('frokost.ics', value);
        console.log(`🎉 Færdig! ${uniqueEvents.length} unikke dage gemt.`);
    }
    await browser.close();
}
run();
