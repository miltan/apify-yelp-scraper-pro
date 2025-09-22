import { CheerioCrawler, log } from 'crawlee';
import gotScraping from 'got-scraping';
import { Actor } from 'apify';
import { extractContactInfo } from '../extractors/contactExtractor.js';
import { CONSTANTS } from '../constants.js';

export async function createWebsiteEnricher({ input, proxyConfiguration, businesses }) {
    const dataset = await Actor.openDataset();
    const keyValueStore = await Actor.openKeyValueStore();

    return new CheerioCrawler({
        proxyConfiguration,
        maxConcurrency: input.maxConcurrency || 3,
        maxRequestRetries: 2,
        requestTimeoutSecs: CONSTANTS.REQUEST_TIMEOUT / 1000,

        requestHandler: async ({ request, $, crawler }) => {
            const { businessData } = request.userData;
            log.info(`Enriching website for: ${businessData.name} - ${request.url}`);

            try {
                // Extract contact info from current page
                const html = $.html();
                const contactInfo = extractContactInfo(html);

                // Merge with existing business data
                const existingData = await keyValueStore.getValue(businessData.yelpUrl) || businessData;
                
                const updatedData = {
                    ...existingData,
                    emails: [...new Set([...(existingData.emails || []), ...contactInfo.emails])],
                    phonesFromWebsite: [...new Set([...(existingData.phonesFromWebsite || []), ...contactInfo.phones])],
                    socialLinks: [...new Set([...(existingData.socialLinks || []), ...contactInfo.socialLinks])],
                };

                // Save updated data
                await keyValueStore.setValue(businessData.yelpUrl, updatedData);

                // If this is the homepage and we have contact paths, crawl them too
                if (request.userData.isHomepage && input.contactPagePaths && input.contactPagePaths.length > 0) {
                    const baseUrl = new URL(request.url).origin;
                    
                    for (const path of input.contactPagePaths) {
                        const contactUrl = `${baseUrl}${path}`;
                        
                        // Check if page exists before queueing
                        try {
                            const response = await gotScraping.head(contactUrl, {
                                timeout: { request: 5000 },
                                throwHttpErrors: false,
                                proxyUrl: proxyConfiguration?.newUrl(),
                            });

                            if (response.statusCode === 200) {
                                await crawler.addRequests([{
                                    url: contactUrl,
                                    userData: { 
                                        businessData,
                                        isHomepage: false,
                                    },
                                }]);
                            }
                        } catch (error) {
                            // Path doesn't exist, skip it
                            log.debug(`Contact page not found: ${contactUrl}`);
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
    });

    // Queue all business websites
    const requests = businesses.map(business => ({
        url: business.website,
        userData: {
            businessData: business,
            isHomepage: true,
        },
    }));

    await crawler.addRequests(requests);

    // After crawler finishes, update the main dataset
    crawler.autoscaledPool?.addEventListener('persistState', async () => {
        const enrichedBusinesses = [];
        
        for (const business of businesses) {
            const enrichedData = await keyValueStore.getValue(business.yelpUrl) || business;
            enrichedBusinesses.push(enrichedData);
        }

        // Clear and re-push all data to maintain order
        await dataset.drop();
        await dataset.pushData(enrichedBusinesses);
    });
}