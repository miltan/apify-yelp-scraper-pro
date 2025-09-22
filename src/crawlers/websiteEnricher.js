import { CheerioCrawler, log } from 'crawlee';
import gotScraping from 'got-scraping';
import { Actor } from 'apify';
import { extractContactInfo } from '../extractors/contactExtractor.js';
import { CONSTANTS } from '../constants.js';

export async function createWebsiteEnricher({ input, proxyConfiguration, businesses }) {
    // Store enriched data
    const enrichedData = new Map();
    businesses.forEach(b => enrichedData.set(b.yelpUrl, { ...b }));

    // Build crawler options conditionally
    const crawlerOptions = {
        maxConcurrency: Math.min(input.maxConcurrency || 3, 5), // Limit concurrency for website enrichment
        maxRequestRetries: 2,
        requestTimeoutSecs: CONSTANTS.REQUEST_TIMEOUT / 1000,

        requestHandler: async ({ request, $, crawler }) => {
            const { businessData } = request.userData;
            log.info(`Enriching website for: ${businessData.name} - ${request.url}`);

            try {
                // Extract contact info from current page
                const html = $.html();
                const contactInfo = extractContactInfo(html);

                // Get existing enriched data
                const existing = enrichedData.get(businessData.yelpUrl);
                
                // Merge contact info
                if (existing) {
                    existing.emails = [...new Set([...(existing.emails || []), ...contactInfo.emails])];
                    existing.phonesFromWebsite = [...new Set([...(existing.phonesFromWebsite || []), ...contactInfo.phones])];
                    existing.socialLinks = [...new Set([...(existing.socialLinks || []), ...contactInfo.socialLinks])];
                }

                // If this is the homepage and we have contact paths, crawl them too
                if (request.userData.isHomepage && input.contactPagePaths && input.contactPagePaths.length > 0) {
                    const baseUrl = new URL(request.url).origin;
                    
                    for (const path of input.contactPagePaths) {
                        // Skip root path if it's the homepage
                        if (path === '/') continue;
                        
                        const contactUrl = `${baseUrl}${path}`;
                        
                        // Check if page exists before queueing (only if we have proxy)
                        if (proxyConfiguration) {
                            try {
                                const response = await gotScraping.head(contactUrl, {
                                    timeout: { request: 5000 },
                                    throwHttpErrors: false,
                                    proxyUrl: proxyConfiguration.newUrl(),
                                });

                                if (response.statusCode === 200) {
                                    await crawler.addRequests([{
                                        url: contactUrl,
                                        userData: { 
                                            businessData,
                                            isHomepage: false,
                                        },
                                    }]);
                                    log.debug(`Added contact page: ${contactUrl}`);
                                }
                            } catch (error) {
                                // Path doesn't exist, skip it
                                log.debug(`Contact page not found: ${contactUrl}`);
                            }
                        } else {
                            // Without proxy, just add the request and let it fail if needed
                            await crawler.addRequests([{
                                url: contactUrl,
                                userData: { 
                                    businessData,
                                    isHomepage: false,
                                },
                            }]);
                        }
                    }
                }

            } catch (error) {
                log.error(`Error enriching ${request.url}: ${error.message}`);
            }
        },

        failedRequestHandler: async ({ request, error }) => {
            log.warning(`Failed to enrich ${request.url}: ${error.message}`);
            // Don't throw - we want to continue with other businesses
        },
    };

    // Only add proxyConfiguration if it exists
    if (proxyConfiguration) {
        crawlerOptions.proxyConfiguration = proxyConfiguration;
    }

    const crawler = new CheerioCrawler(crawlerOptions);

    // Queue all business websites
    const requests = businesses.map(business => ({
        url: business.website,
        userData: {
            businessData: business,
            isHomepage: true,
        },
    }));

    await crawler.run(requests);

    // After crawler finishes, save enriched data back to dataset
    log.info('Saving enriched data to dataset...');
    
    // Clear the existing dataset and push enriched data
    const dataset = await Actor.openDataset();
    
    // Get all enriched businesses
    const finalData = Array.from(enrichedData.values());
    
    // Clear existing items
    const currentData = await dataset.getData();
    
    // Drop the current dataset
    await dataset.drop();
    
    // Open a new dataset and push enriched data
    const newDataset = await Actor.openDataset();
    await newDataset.pushData(finalData);
    
    log.info(`Enrichment complete. Updated ${finalData.length} businesses`);
}