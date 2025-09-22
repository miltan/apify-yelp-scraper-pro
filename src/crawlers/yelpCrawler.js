import { PlaywrightCrawler, log } from 'crawlee';
import { CONSTANTS } from '../constants.js';
import { extractBusinessDetails } from '../extractors/yelpExtractor.js';
import { Actor } from 'apify';
import { saveScreenshot } from '../utils/helpers.js';

export async function createYelpCrawler({ input, proxyConfiguration, startUrl }) {
    const dataset = await Actor.openDataset();
    let businessCount = 0;
    const maxResults = input.maxResults || 50;

    // Select a random user agent
    const userAgent = CONSTANTS.USER_AGENTS[Math.floor(Math.random() * CONSTANTS.USER_AGENTS.length)];

    // Build base crawler options
    const crawlerOptions = {
        maxConcurrency: input.maxConcurrency || 3,
        maxRequestRetries: CONSTANTS.MAX_RETRIES,
        navigationTimeoutSecs: CONSTANTS.NAVIGATION_TIMEOUT / 1000,
        
        launchContext: {
            launchOptions: {
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            },
            // Set user agent at browser context level
            userAgent: userAgent,
        },

        browserPoolOptions: {
            useFingerprints: false, // Disable fingerprinting if not needed
        },

        preNavigationHooks: [
            async ({ page, request }) => {
                // Set viewport
                await page.setViewportSize({ width: 1920, height: 1080 });
                
                // Add stealth settings
                await page.addInitScript(() => {
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => false,
                    });
                    
                    // Additional stealth
                    Object.defineProperty(navigator, 'plugins', {
                        get: () => [1, 2, 3, 4, 5],
                    });
                    
                    Object.defineProperty(navigator, 'languages', {
                        get: () => ['en-US', 'en'],
                    });
                });
                
                log.debug(`Navigating to ${request.url}`);
            },
        ],

        requestHandler: async ({ request, page, crawler }) => {
            const { url, userData } = request;
            log.info(`Processing ${userData.type || 'search'} page: ${url}`);

            try {
                if (!userData.type || userData.type === 'search') {
                    // Handle search results page
                    log.debug('Waiting for business cards to load...');
                    
                    // Try multiple selectors as Yelp might have different layouts
                    const selectors = [
                        '[data-testid*="serp-ia-card"]',
                        'div[class*="container__"] > div[class*="businessName"]',
                        'div[class*="hoverable"]',
                        'ul li div[class*="container"]',
                        'div[class*="searchResult"]',
                    ];
                    
                    let businessCardsSelector = null;
                    for (const selector of selectors) {
                        try {
                            await page.waitForSelector(selector, { timeout: 5000 });
                            businessCardsSelector = selector;
                            log.debug(`Found business cards with selector: ${selector}`);
                            break;
                        } catch (e) {
                            continue;
                        }
                    }
                    
                    if (!businessCardsSelector) {
                        log.error('Could not find business cards on page');
                        await saveScreenshot(page, `no-cards-${Date.now()}.png`);
                        return;
                    }

                    // Scroll to load all results
                    await page.evaluate(() => {
                        window.scrollTo(0, document.body.scrollHeight);
                    });
                    
                    // Wait for potential lazy-loaded content
                    await page.waitForTimeout(2000);

                    // Extract business listings with multiple selector strategies
                    const businesses = await page.evaluate(() => {
                        const results = [];
                        
                        // Try different link selectors
                        const linkSelectors = [
                            'h3 a[href^="/biz/"]',
                            'a[href^="/biz/"] h3',
                            'a[href*="/biz/"]',
                            '[data-testid*="serp-ia-card"] a',
                        ];
                        
                        for (const selector of linkSelectors) {
                            const links = document.querySelectorAll(selector);
                            if (links.length > 0) {
                                links.forEach(link => {
                                    const href = link.href || link.closest('a')?.href;
                                    const name = link.textContent || link.querySelector('h3')?.textContent || 
                                               link.closest('[data-testid*="serp-ia-card"]')?.querySelector('h3')?.textContent;
                                    
                                    if (href && href.includes('/biz/') && name) {
                                        results.push({
                                            url: href,
                                            name: name.trim(),
                                        });
                                    }
                                });
                                break;
                            }
                        }
                        
                        // Deduplicate
                        const unique = [];
                        const seen = new Set();
                        for (const item of results) {
                            if (!seen.has(item.url)) {
                                seen.add(item.url);
                                unique.push(item);
                            }
                        }
                        
                        return unique;
                    });

                    log.info(`Found ${businesses.length} businesses on this page`);
                    
                    if (businesses.length === 0 && input.debugScreenshots) {
                        await saveScreenshot(page, `no-businesses-${Date.now()}.png`);
                    }

                    // Queue business detail pages
                    for (const business of businesses) {
                        if (businessCount >= maxResults) {
                            log.info(`Reached max results limit: ${maxResults}`);
                            break;
                        }

                        await crawler.addRequests([{
                            url: business.url,
                            userData: { type: 'detail', businessName: business.name },
                        }]);

                        businessCount++;
                    }

                    // Check for next page if we haven't reached max results
                    if (businessCount < maxResults) {
                        // Try multiple next button selectors
                        const nextSelectors = [
                            'a[aria-label="Next"]',
                            'a.next-link',
                            'a:has-text("Next")',
                            '[class*="pagination"] a:has-text("Next")',
                            'a[class*="next"]',
                        ];
                        
                        let nextPageLink = null;
                        for (const selector of nextSelectors) {
                            try {
                                nextPageLink = await page.$eval(selector, el => el?.href);
                                if (nextPageLink) break;
                            } catch (e) {
                                continue;
                            }
                        }

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
                    log.debug('Processing business detail page...');
                    
                    // Wait for main content
                    try {
                        await page.waitForSelector('h1', { timeout: CONSTANTS.DEFAULT_TIMEOUT });
                    } catch (e) {
                        log.error('Could not find business name on detail page');
                        return;
                    }

                    // Extract business details
                    const businessData = await extractBusinessDetails(page);
                    
                    if (businessData) {
                        businessData.yelpUrl = url;
                        businessData.scrapedAt = new Date().toISOString();
                        
                        // Initialize empty arrays for enrichment phase
                        businessData.emails = [];
                        businessData.phonesFromWebsite = [];
                        businessData.socialLinks = [];
                        
                        // Save to dataset
                        await dataset.pushData(businessData);
                        log.info(`Saved business: ${businessData.name}`);
                    } else {
                        log.warning(`Could not extract data from ${url}`);
                    }
                }

            } catch (error) {
                log.error(`Error processing ${url}: ${error.message}`);
                
                if (input.debugScreenshots) {
                    await saveScreenshot(page, `error-${Date.now()}.png`);
                }
                
                // Don't throw - continue with other requests
            }
        },

        failedRequestHandler: async ({ request }, error) => {
            log.error(`Request ${request.url} failed after ${request.retryCount} retries: ${error.message}`);
        },
    };

    // Only add proxyConfiguration if it exists
    if (proxyConfiguration !== null && proxyConfiguration !== undefined) {
        crawlerOptions.proxyConfiguration = proxyConfiguration;
    }

    const crawler = new PlaywrightCrawler(crawlerOptions);

    return crawler;
}