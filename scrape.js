const puppeteer = require('puppeteer');
const ics = require('ics');
const fs = require('fs');
const axios = require('axios');
const pdf = require('pdf-parse');
const { startOfISOWeek, addWeeks, addDays } = require('date-fns');

async function run() {
    console.log("Starter Version 8 (The PDF Reader)...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("Leder efter PDF-link på Noon...");
    await page.goto('https://www.nooncph.dk/ugens-menuer', { waitUntil: 'networkidle2' });
    
    // Find det mest sandsynlige PDF-link
    const pdfUrl = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        const menuLink = links.find(a => 
            a.href.toLowerCase().endsWith('.pdf') && 
            (a.innerText.toLowerCase().includes('uge') || a.innerText.toLowerCase().includes('menu'))
        );
        return menuLink ? menuLink.href : null;
    });

    if (!pdfUrl) {
        console.log("Kritisk fejl: Kunne ikke finde et link til en PDF-menu.");
        await browser.close();
        return;
    }

    console.log("Fandt PDF: " + pdfUrl);
    console.log("Henter og læser PDF...");

    // Hent PDF'en som data
    const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
    const pdfData = await pdf(response.data);
    const fullText = pdfData.text;

    console.log("PDF-tekst udpakket (første 100 tegn): " + fullText.substring(0, 100));

    // Opdeling af menuen (vi leder efter ugedage)
    const days = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag'];
    const menuEntries = [];
    const currentYear = 2026;
    
    // Forsøg at finde ugenummer i teksten (f.eks. "Uge 8")
    const weekMatch = fullText.match(/Uge\s+(\d+)/i);
    const weekNum = weekMatch ? parseInt(weekMatch[1]) : 8; // Fallback til uge 8

    days.forEach((day, index) => {
        // Find teksten mellem denne dag og den næste dag
        const nextDay = days[index + 1];
        let startPos = fullText.indexOf(day);
        let endPos = nextDay ? fullText.indexOf(nextDay) : fullText.length;

        if (startPos !== -1) {
            let dayMenu = fullText.substring(startPos + day.length, endPos).trim();
            // Rens teksten for mærkelige tegn og dobbelte linjeskift
            dayMenu = dayMenu.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
            
            if (dayMenu.length > 10) {
                menuEntries.push({ day, menu: dayMenu, week: weekNum });
            }
        }
    });

    console.log(`Fandt menu for ${menuEntries.length} dage.`);

    // Opret kalender-events
    const events = menuEntries.map(item => {
        let monday = startOfISOWeek(new Date(currentYear, 0, 4));
        monday = addWeeks(monday, item.week - 1);
        const dayMap = { 'Mandag': 0, 'Tirsdag': 1, 'Onsdag': 2, 'Torsdag': 3, 'Fredag': 4 };
        const dayDate = addDays(monday, dayMap[item.day]);

        return {
            title: `Noon: ${item.menu.substring(0, 40)}...`,
            start: [dayDate.getFullYear(), dayDate.getMonth() + 1, dayDate.getDate(), 11, 30],
            duration: { hours: 1 },
            description: `${item.day}: ${item.menu}\n\nKilde: ${pdfUrl}`,
            url: pdfUrl
        };
    });

    if (events.length > 0) {
        const { value } = ics.createEvents(events);
        fs.writeFileSync('frokost.ics', value);
        console.log("SUCCESS: Kalenderen er nu opdateret med tekst fra PDF'en!");
    } else {
        console.log("Fejl: Kunne ikke skille dagene ad i PDF-teksten.");
    }

    await browser.close();
}

run();
