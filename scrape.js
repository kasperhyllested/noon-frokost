const puppeteer = require('puppeteer');
const ics = require('ics');
const fs = require('fs');
const { startOfISOWeek, addWeeks, addDays } = require('date-fns');

async function run() {
    console.log("Starter Version 7 (Detektiven)...");
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log("Henter siden...");
    await page.goto('https://www.nooncph.dk/ugens-menuer', { waitUntil: 'networkidle0', timeout: 60000 });
    
    // Scroll langsomt ned for at aktivere Lazy Loading
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 100;
            let timer = setInterval(() => {
                let scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if(totalHeight >= scrollHeight){
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });

    await new Promise(r => setTimeout(r, 5000));

    const analysis = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a')).map(a => ({
            text: a.innerText.trim(),
            href: a.href
        }));
        
        // Find links der indeholder "uge", "menu" eller slutter på .pdf
        const interestingLinks = links.filter(l => 
            l.href.toLowerCase().includes('uge') || 
            l.href.toLowerCase().includes('menu') || 
            l.href.toLowerCase().endsWith('.pdf')
        );

        // Tag de første 500 tegn af sidens tekst for at se om vi er det rigtige sted
        const pageTextSnippet = document.body.innerText.substring(0, 1000);

        return { interestingLinks, pageTextSnippet };
    });

    console.log("--- DIAGNOSE START ---");
    console.log("Sidens tekst start:", analysis.pageTextSnippet);
    console.log("Interessante links fundet:", JSON.stringify(analysis.interestingLinks, null, 2));
    console.log("--- DIAGNOSE SLUT ---");

    // Hvis vi finder et link der ligner ugens menu, så lad os bruge det som "Dagens menu"
    const events = [];
    if (analysis.interestingLinks.length > 0) {
        const bestLink = analysis.interestingLinks[0];
        events.push({
            title: `Noon Menu: ${bestLink.text || 'Klik her'}`,
            start: [2026, 2, 18, 11, 30],
            duration: { hours: 1 },
            description: `Robotten fandt dette link, som sandsynligvis er menuen: ${bestLink.href}`,
            url: bestLink.href
        });
    }

    const { value } = ics.createEvents(events.length > 0 ? events : [{
        title: 'Noon: Ingen menu fundet i dag',
        start: [2026, 2, 18, 11, 30],
        duration: { hours: 1 },
        description: 'Tjek selv: https://www.nooncph.dk/ugens-menuer'
    }]);

    fs.writeFileSync('frokost.ics', value);
    console.log("Færdig! Tjek loggen ovenfor for links.");
    await browser.close();
}

run();
