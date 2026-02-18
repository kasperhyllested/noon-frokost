const puppeteer = require('puppeteer');
const ics = require('ics');
const fs = require('fs');
const axios = require('axios');
const pdf = require('pdf-parse');
const { startOfISOWeek, addWeeks, addDays } = require('date-fns');

async function run() {
    console.log("Starter Version 9 (Robust PDF Reader)...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    let pdfUrl = "";
    try {
        console.log("Leder efter PDF-link...");
        await page.goto('https://www.nooncph.dk/ugens-menuer', { waitUntil: 'networkidle2', timeout: 60000 });
        
        pdfUrl = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            // Vi leder efter links der indeholder 'menu' og ender på '.pdf'
            const menuLink = links.find(a => 
                a.href.toLowerCase().includes('.pdf') && 
                (a.innerText.toLowerCase().includes('uge') || a.innerText.toLowerCase().includes('menu'))
            );
            return menuLink ? menuLink.href : null;
        });
    } catch (e) {
        console.log("Kunne ikke loade hjemmesiden: " + e.message);
    }

    if (!pdfUrl) {
        console.log("Ingen PDF fundet. Laver nød-kalender.");
        createEmptyCalendar("Kunne ikke finde PDF-link på Noon.dk");
        await browser.close();
        return;
    }

    console.log("Henter PDF fra: " + pdfUrl);
    
    try {
        const response = await axios.get(pdfUrl, { responseType: 'arraybuffer', timeout: 30000 });
        const pdfData = await pdf(response.data);
        const fullText = pdfData.text;

        const days = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag'];
        const menuEntries = [];
        const currentYear = 2026;
        const weekNum = 8; // Vi tvinger uge 8 lige nu for at være sikre

        days.forEach((day, index) => {
            const nextDay = days[index + 1];
            let startPos = fullText.indexOf(day);
            let endPos = nextDay ? fullText.indexOf(nextDay) : fullText.length;

            if (startPos !== -1) {
                let dayMenu = fullText.substring(startPos + day.length, endPos)
                    .replace(/\n+/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                
                if (dayMenu.length > 5) {
                    menuEntries.push({ day, menu: dayMenu, week: weekNum });
                }
            }
        });

        if (menuEntries.length > 0) {
            const events = menuEntries.map(item => {
                let monday = startOfISOWeek(new Date(currentYear, 0, 4));
                monday = addWeeks(monday, item.week - 1);
                const dayMap = { 'Mandag': 0, 'Tirsdag': 1, 'Onsdag': 2, 'Torsdag': 3, 'Fredag': 4 };
                const dayDate = addDays(monday, dayMap[item.day]);

                return {
                    title: `Noon: ${item.menu.substring(0, 35)}...`,
                    start: [dayDate.getFullYear(), dayDate.getMonth() + 1, dayDate.getDate(), 11, 30],
                    duration: { hours: 1 },
                    description: `${item.day}: ${item.menu}`,
                    url: pdfUrl
                };
            });

            const { value } = ics.createEvents(events);
            fs.writeFileSync('frokost.ics', value);
            console.log("SUCCESS: Kalender oprettet med tekst fra PDF.");
        } else {
            throw new Error("Kunne ikke udtrække tekst fra PDF");
        }

    } catch (error) {
        console.log("PDF Fejl: " + error.message);
        createEmptyCalendar("Fandt PDF, men kunne ikke læse teksten. Link: " + pdfUrl);
    }

    await browser.close();
}

function createEmptyCalendar(msg) {
    const event = {
        title: 'Noon: Tjek menu manuelt',
        start: [2026, 2, 18, 11, 30],
        duration: { hours: 1 },
        description: msg
    };
    const { value } = ics.createEvents([event]);
    fs.writeFileSync('frokost.ics', value);
}

run();
