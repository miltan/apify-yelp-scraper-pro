import { Actor } from 'apify';
import { log } from 'crawlee';
import { validateInput, buildYelpSearchUrl } from './utils/validation.js';
import { createYelpCrawler } from './crawlers/yelpCrawler.js';
import { createWebsiteEnricher } from './crawlers/websiteEnricher.js';

await Actor.init();

try {
    const input = await Actor.getInput();
    log.info('Starting Yelp Business Scraper', { input });

    // Validate and prepare input
    const validatedInput = validateInput(input);
    const searchUrl = validatedInput.yelpSearchUrl || buildYelpSearchUrl(validatedInput.search, validatedInput.location);
    
    if (!searchUrl) {
        throw new Error('Please provide either a Yelp search URL or both search query and location');
    }

    log.info(`Starting crawl from: ${searchUrl}`);

    // Create proxy configuration
    let proxyConfiguration = null;
    if (validatedInput.useResidentialProxy) {
        proxyConfiguration = await Actor.createProxyConfiguration({
            groups: ['RESIDENTIAL'],
            countryCode: validatedInput.proxyCountryCode,
        });
    } else {
        proxyConfiguration = await Actor.createProxyConfiguration({
            groups: ['SHADER'],
            countryCode: validatedInput.proxyCountryCode,
        });
    }

    // Phase 1: Crawl Yelp
    log.info('Phase 1: Starting Yelp crawl...');
    const yelpCrawler = await createYelpCrawler({
        input: validatedInput,
        proxyConfiguration,
        startUrl: searchUrl,
    });

    // Add the initial request
    await yelpCrawler.run([searchUrl]);

    // Phase 2: Enrich with website data (if enabled)
    if (validatedInput.fetchContactsFromWebsite) {
        log.info('Phase 2: Starting website enrichment...');
        
        // Get businesses that have websites from the dataset
        const dataset = await Actor.openDataset();
        const { items } = await dataset.getData();
        const businessesWithWebsites = items.filter(item => item.website);
        
        if (businessesWithWebsites.length > 0) {
            log.info(`Found ${businessesWithWebsites.length} businesses with websites to enrich`);
            
            await createWebsiteEnricher({
                input: validatedInput,
                proxyConfiguration,
                businesses: businessesWithWebsites,
            });
        } else {
            log.warning('No businesses with websites found for enrichment');
        }
    }

    const dataset = await Actor.openDataset();
    const { items } = await dataset.getData();
    
    log.info(`Crawl completed! Scraped ${items.length} businesses`);
    
    // Log summary statistics
    const stats = {
        totalBusinesses: items.length,
        withWebsites: items.filter(i => i.website).length,
        withEmails: items.filter(i => i.emails && i.emails.length > 0).length,
        withSocialLinks: items.filter(i => i.socialLinks && i.socialLinks.length > 0).length,
    };
    
    log.info('Final statistics:', stats);

} catch (error) {
    log.error('Actor failed with error:', error);
    throw error;
}

await Actor.exit();