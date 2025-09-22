import { PlaywrightCrawler, log } from 'crawlee';
import { CONSTANTS } from '../constants.js';
import { extractBusinessDetails } from '../extractors/yelpExtractor.js';  // <-- Fixed import
import { Actor } from 'apify';
import { saveScreenshot } from '../utils/helpers.js';

export async function createYelpCrawler({ input, proxyConfiguration, startUrl }) {
    const dataset = await Actor.openDataset();
    let businessCount = 0;
    const maxResults = input.maxResults || 50;

    return new PlaywrightCrawler({
        proxyConfiguration,
        maxConcurrency: input.maxConcurrency || 3,
        maxRequestRetries: CONSTANTS.MAX_RETRIES,
        navigationTimeoutSecs: CONSTANTS.NAVIGATION_TIMEOUT / 1000,
        
        launchContext: {
            launchOptions: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            },
        },

        preNavigationHooks: [
            async ({ page }) => {
                // Set user agent for stealth
                const userAgent = CONSTANTS.USER_AGENTS[Math.floor(Math.random() * CONSTANTS.USER_AGENTS.length)];
                await page.setUserAgent(userAgent);
                
                // Set viewport
                await page.setViewportSize({ width: 1920, height: 1080 });
                
                // Add stealth settings
                await page.evaluateOnNewDocument(() => {
                    Object.defineProperty(navigator, 'webdriver', { get: () => false });
                });
            },
        ],

        requestHandler: async ({ request, page, crawler }) => {
            const { url, userData } = request;
            log.info(`Processing ${userData.type || 'search'} page: ${url}`);

            try {
                if (!userData.type || userData.type === 'search') {
                    // Handle search results page
                    await page.waitForSelector(CONSTANTS.YELP_SELECTORS.BUSINESS_CARD, { 
                        timeout: CONSTANTS.DEFAULT_TIMEOUT 
                    });

                    // Extract business listings
                    const businesses = await page.$$eval(
                        CONSTANTS.YELP_SELECTORS.BUSINESS_CARD,
                        (cards, selectors) => {
                            return cards.map(card => {
                                const nameEl = card.querySelector('h3 a[href^="/biz/"], a[href^="/biz/"] h3');
                                if (!nameEl) return null;
                                
                                const href = nameEl.closest('a')?.href || nameEl.querySelector('a')?.href;
                                if (!href) return null;

                                return {
                                    name: nameEl.textContent?.trim(),
                                    url: href,
                                };
                            }).filter(Boolean);
                        },
                        CONSTANTS.YELP_SELECTORS
                    );

                    // Queue business detail pages
                    for (const business of businesses) {
                        if (businessCount >= maxResults) {
                            log.info(`Reached max results limit: ${maxResults}`);
                            return;
                        }

                        await crawler.addRequests([{
                            url: business.url,
                            userData: { type: 'detail', businessName: business.name },
                        }]);

                        businessCount++;
                    }

                    // Check for next page and queue it if we haven't reached max results
                    if (businessCount < maxResults) {
                        const nextPageLink = await page.$eval(
                            CONSTANTS.YELP_SELECTORS.NEXT_PAGE,
                            el => el?.href
                        ).catch(() => null);

                        if (nextPageLink) {
                            log.info('Found next page, queueing...');
                            await crawler.addRequests([{
                                url: nextPageLink,
                                userData: { type: 'search' },
                            }]);
                        } else {
                            log.info('No more pages found');
                        }
                    }

                } else if (userData.type === 'detail') {
                    // Handle business detail page
                    await page.waitForSelector(CONSTANTS.YELP_SELECTORS.DETAIL_NAME, {
                        timeout: CONSTANTS.DEFAULT_TIMEOUT
                    });

                    // Extract business details
                    const businessData = await extractBusinessDetails(page);
                    
                    if (businessData) {
                        businessData.yelpUrl = url;
                        businessData.scrapedAt = new Date().toISOString();
                        
                        // Save to dataset
                        await dataset.pushData(businessData);
                        log.info(`Saved business: ${businessData.name}`);
                    }
                }

            } catch (error) {
                log.error(`Error processing ${url}: ${error.message}`);
                
                if (input.debugScreenshots) {
                    await saveScreenshot(page, `error-${Date.now()}.png`);
                }
                
                throw error;
            }
        },

        failedRequestHandler: async ({ request, error }) => {
            log.error(`Request ${request.url} failed after ${request.retryCount} retries: ${error.message}`);
        },
    });
}