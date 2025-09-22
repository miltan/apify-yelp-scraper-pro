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
        maxConcurrency: 1,
        maxRequestRetries: CONSTANTS.MAX_RETRIES,
        navigationTimeoutSecs: 60,
        requestHandlerTimeoutSecs: 120,
        
        launchContext: {
            launchOptions: {
                headless: false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--window-size=1920,1080',
                ],
                ignoreDefaultArgs: ['--enable-automation'],
            },
            userAgent: userAgent,
        },

        preNavigationHooks: [
            async ({ page, request }) => {
                // Inject stealth scripts before navigation
                await page.evaluateOnNewDocument(() => {
                    // Override webdriver detection
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined,
                    });
                    
                    // Add chrome object
                    window.chrome = {
                        runtime: {},
                    };
                    
                    // Override plugins
                    Object.defineProperty(navigator, 'plugins', {
                        get: () => [1, 2, 3, 4, 5],
                    });
                    
                    // Override languages
                    Object.defineProperty(navigator, 'languages', {
                        get: () => ['en-US', 'en'],
                    });
                    
                    // Override permissions
                    const originalQuery = window.navigator.permissions.query;
                    window.navigator.permissions.query = (parameters) => (
                        parameters.name === 'notifications' 
                            ? Promise.resolve({ state: 'default' }) 
                            : originalQuery(parameters)
                    );
                });
                
                // Set viewport
                await page.setViewportSize({ width: 1920, height: 1080 });
                
                // Add delay
                await page.waitForTimeout(Math.random() * 2000 + 1000);
                
                log.debug(`Navigating to ${request.url}`);
            },
        ],

        postNavigationHooks: [
            async ({ page, response, request }) => {
                // Log response status
                const status = response?.status();
                log.info(`Response status: ${status} for ${request.url}`);
                
                // Handle 403 responses specially
                if (status === 403) {
                    log.warning('Got 403 response, waiting before proceeding...');
                    await page.waitForTimeout(10000);
                    
                    // Check if page has content anyway
                    const hasContent = await page.evaluate(() => {
                        return document.body && document.body.innerText.length > 100;
                    });
                    
                    if (!hasContent) {
                        log.error('Page appears blocked');
                        if (input.debugScreenshots) {
                            await saveScreenshot(page, `blocked-403-${Date.now()}.png`);
                        }
                    }
                }
                
                // Random delay to seem human
                await page.waitForTimeout(Math.random() * 2000 + 1000);
            },
        ],

        requestHandler: async ({ request, page, crawler }) => {
            const { url, userData } = request;
            
            log.info(`Processing ${userData.type || 'search'} page: ${url}`);

            try {
                if (!userData.type || userData.type === 'search') {
                    // Search results page
                    log.debug('Waiting for content to load...');
                    
                    // Wait for any content
                    await page.waitForTimeout(5000);
                    
                    // Check page title to see if we're blocked
                    const title = await page.title();
                    log.info(`Page title: ${title}`);
                    
                    if (title.toLowerCase().includes('blocked') || 
                        title.toLowerCase().includes('verify') ||
                        title.toLowerCase().includes('captcha')) {
                        log.error('Detected blocking page');
                        if (input.debugScreenshots) {
                            await saveScreenshot(page, `blocking-page-${Date.now()}.png`);
                        }
                        // Don't throw - just skip
                        return;
                    }
                    
                    // Scroll the page
                    await page.evaluate(() => {
                        window.scrollTo(0, document.body.scrollHeight);
                    });
                    await page.waitForTimeout(2000);
                    
                    // Extract business listings
                    const businesses = await page.evaluate(() => {
                        const results = [];
                        
                        // Find all business links
                        const links = document.querySelectorAll('a');
                        links.forEach(link => {
                            const href = link.href;
                            if (href && href.includes('/biz/') && 
                                !href.includes('/writeareview') && 
                                !href.includes('/questions')) {
                                
                                // Try to get business name
                                let name = '';
                                
                                // Check if link contains or is within a heading
                                const heading = link.querySelector('h1, h2, h3, h4, h5, h6');
                                if (heading) {
                                    name = heading.textContent;
                                } else {
                                    // Check parent elements for headings
                                    const parent = link.closest('h1, h2, h3, h4, h5, h6');
                                    if (parent) {
                                        name = parent.textContent;
                                    } else {
                                        // Use link text
                                        name = link.textContent;
                                    }
                                }
                                
                                name = name.trim();
                                if (name && name.length > 1 && name.length < 200) {
                                    results.push({
                                        url: href,
                                        name: name,
                                    });
                                }
                            }
                        });
                        
                        // Deduplicate by URL
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

                    log.info(`Found ${businesses.length} businesses on page`);
                    
                    if (businesses.length === 0) {
                        log.warning('No businesses found');
                        if (input.debugScreenshots) {
                            await saveScreenshot(page, `no-businesses-${Date.now()}.png`);
                        }
                        // Log page HTML for debugging
                        const html = await page.content();
                        log.debug(`Page HTML length: ${html.length}`);
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
                        
                        // Delay between adding requests
                        await page.waitForTimeout(Math.random() * 1000 + 500);
                    }

                    // Look for next page
                    if (businessCount < maxResults) {
                        const nextPageUrl = await page.evaluate(() => {
                            // Try various selectors for next button
                            const selectors = [
                                'a[aria-label="Next"]',
                                'a.next',
                                '.pagination a[aria-label="Next"]',
                                'a[class*="next"]',
                                'a:has-text("Next")'
                            ];
                            
                            for (const selector of selectors) {
                                try {
                                    const elem = document.querySelector(selector);
                                    if (elem && elem.href) {
                                        return elem.href;
                                    }
                                } catch (e) {
                                    continue;
                                }
                            }
                            return null;
                        });

                        if (nextPageUrl) {
                            log.info(`Found next page: ${nextPageUrl}`);
                            await page.waitForTimeout(Math.random() * 3000 + 2000);
                            
                            await crawler.addRequests([{
                                url: nextPageUrl,
                                userData: { type: 'search' },
                            }]);
                        } else {
                            log.info('No next page found');
                        }
                    }

                } else if (userData.type === 'detail') {
                    // Business detail page
                    await page.waitForTimeout(3000);
                    
                    const businessData = await extractBusinessDetails(page);
                    
                    if (businessData && businessData.name) {
                        businessData.yelpUrl = url;
                        businessData.scrapedAt = new Date().toISOString();
                        businessData.emails = [];
                        businessData.phonesFromWebsite = [];
                        businessData.socialLinks = [];
                        
                        await dataset.pushData(businessData);
                        log.info(`Saved business: ${businessData.name}`);
                    } else {
                        log.warning(`Could not extract business data from ${url}`);
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
            // Only log non-403 errors
            if (!error.message.includes('403')) {
                log.error(`Request ${request.url} failed: ${error.message}`);
            }
        },
    };

    // Add proxy configuration if provided
    if (proxyConfiguration) {
        crawlerOptions.proxyConfiguration = proxyConfiguration;
    }

    const crawler = new PlaywrightCrawler(crawlerOptions);

    return crawler;
}