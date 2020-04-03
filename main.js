const Apify = require('apify');

const sourceUrl = 'https://covid19.moh.gov.sa/';
const LATEST = 'LATEST';
let check = false;

Apify.main(async () =>
{

    const kvStore = await Apify.openKeyValueStore('COVID-19-SA');
    const dataset = await Apify.openDataset('COVID-19-SA-HISTORY');
    const { email } = await Apify.getValue('INPUT');

    console.log('Launching Puppeteer...');
    const browser = await Apify.launchPuppeteer();

    const page = await browser.newPage();
   
    console.log('Going to the website...');
    
    // the source url (html page source) is just a link to this page
    await page.goto('https://esriksa-emapstc.maps.arcgis.com/apps/opsdashboard/index.html#/6cd8cdcc73ab43939709e12c19b64a19'), { waitUntil: 'networkidle2', timeout: 60000 };
    await Apify.utils.puppeteer.injectJQuery(page);
    
    await page.waitForSelector("text[vector-effect='non-scaling-stroke']");
    await page.waitFor(10000);
    
    console.log('Getting data...');
 
    // page.evaluate(pageFunction[, ...args]), pageFunction <function|string> Function to be evaluated in the page context, returns: <Promise<Serializable>> Promise which resolves to the return value of pageFunction
    const result = await page.evaluate(() =>
    {

        const getInt = (x)=>{
            return x.split(' ').join('').replace(',','')};
        const now = new Date();
        
        // eq() selector selects an element with a specific index number, text() method sets or returns the text content of the selected elements
        const totalInfected = $("text[vector-effect='non-scaling-stroke']").eq(1).text();
        const active = $("text[vector-effect='non-scaling-stroke']").eq(3).text();
        const patientsRecovered = $("text[vector-effect='non-scaling-stroke']").eq(5).text();
        const deceased = $("text[vector-effect='non-scaling-stroke']").eq(7).text();
                            
        const data = {
            infected: getInt(totalInfected),
            tested: "N/A",
            recovered: getInt(patientsRecovered),
            deceased: getInt(deceased),
            active: getInt(active),
            country: "SA",
            historyData: "https://api.apify.com/v2/datasets/OeaEEGdhvUSkXRrWU/items?format=json&clean=1",
            sourceUrl:'https://covid19.moh.gov.sa/',
            lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
            lastUpdatedAtSource: "N/A",
            readMe: 'https://apify.com/katerinahronik/covid-sa',
            };
        return data;
        
    });       
    
    console.log(result)
    
    if ( !result.infected || !result.recovered || !result.deceased|| !result.active) {
                check = true;
            }
    else {
            let latest = await kvStore.getValue(LATEST);
            if (!latest) {
                await kvStore.setValue('LATEST', result);
                latest = result;
            }
            delete latest.lastUpdatedAtApify;
            const actual = Object.assign({}, result);
            delete actual.lastUpdatedAtApify;
             if (JSON.stringify(latest) !== JSON.stringify(actual)) {
                await dataset.pushData(result);
            }

            await kvStore.setValue('LATEST', result);
            await Apify.pushData(result);
        }


    console.log('Closing Puppeteer...');
    await browser.close();
    console.log('Done.');  
    
    // if there are no data for TotalInfected, send email, because that means something is wrong
    const env = await Apify.getEnv();
    if (check) {
        await Apify.call(
            'apify/send-mail',
            {
                to: email,
                subject: `Covid-19 SA from ${env.startedAt} failed `,
                html: `Hi, ${'<br/>'}
                        <a href="https://my.apify.com/actors/${env.actorId}#/runs/${env.actorRunId}">this</a> 
                        run had 0 in some of the variables, check it out.`,
            },
            { waitSecs: 0 },
        );
    };
});
