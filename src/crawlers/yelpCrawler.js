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
        maxConcurrency: Math.min(input.maxConcurrency || 3, 1), // Reduce concurrency for stealth
        maxRequestRetries: CONSTANTS.MAX_RETRIES,
        navigationTimeoutSecs: CONSTANTS.NAVIGATION_TIMEOUT / 1000,
        
        launchContext: {
            launchOptions: {
                headless: false, // Use headful mode for better stealth
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--disable-web-security',
                    '--window-size=1920,1080',
                    '--start-maximized',
                    '--user-agent=' + userAgent,
                ],
                ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=AutomationControlled'],
            },
        },

        browserPoolOptions: {
            useFingerprints: false, // Disable for now as it might conflict
        },

        preNavigationHooks: [
            async ({ page, request, browserController }) => {
                // Set viewport size
                await page.setViewportSize({ width: 1920, height: 1080 });
                
                // Enhanced stealth mode - inject before any navigation
                await page.addInitScript(() => {
                    // Override webdriver property
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined,
                    });
                    
                    // Override plugins to look more realistic
                    Object.defineProperty(navigator, 'plugins', {
                        get: () => [
                            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                            { name: 'Native Client', filename: 'internal-nacl-plugin' },
                        ],
                    });
                    
                    // Override permissions
                    if (navigator.permissions && navigator.permissions.query) {
                        const originalQuery = navigator.permissions.query;
                        navigator.permissions.query = (parameters) => (
                            parameters.name === 'notifications' 
                                ? Promise.resolve({ state: 'default' }) 
                                : originalQuery(parameters)
                        );
                    }
                    
                    // Chrome specific
                    window.chrome = {
                        runtime: {},
                        loadTimes: function() {},
                        csi: function() {},
                        app: {},
                    };
                    
                    // Override language
                    Object.defineProperty(navigator, 'languages', {
                        get: () => ['en-US', 'en'],
                    });
                    
                    // Override hardware concurrency
                    Object.defineProperty(navigator, 'hardwareConcurrency', {
                        get: () => 4,
                    });
                    
                    // Override platform
                    Object.defineProperty(navigator, 'platform', {
                        get: () => 'Win32',
                    });
                    
                    // Override vendor
                    Object.defineProperty(navigator, 'vendor', {
                        get: () => 'Google Inc.',
                    });
                    
                    // Mock WebGL vendor
                    if (window.WebGLRenderingContext) {
                        const getParameter = WebGLRenderingContext.prototype.getParameter;
                        WebGLRenderingContext.prototype.getParameter = function(parameter) {
                            if (parameter === 37445) {
                                return 'Intel Inc.';
                            }
                            if (parameter === 37446) {
                                return 'Intel Iris OpenGL Engine';
                            }
                            return getParameter.apply(this, arguments);
                        };
                    }
                });
                
                // Add random delay before navigation
                await page.waitForTimeout(Math.random() * 2000 + 1000);
                
                log.debug(`Navigating to ${request.url}`);
            },
        ],

        postNavigationHooks: [
            async ({ page }) => {
                // Random delay after page load
                await page.waitForTimeout(Math.random() * 3000 + 2000);
                
                // Simulate human-like mouse movement
                await page.mouse.move(
                    Math.random() * 500 + 100,
                    Math.random() * 500 + 100
                );
                
                // Random scroll
                await page.evaluate(() => {
                    window.scrollTo(0, Math.random() * 300);
                });
            },
        ],

        requestHandler: async ({ request, page, crawler, response }) => {
            const { url, userData } = request;
            
            log.info(`Processing ${userData.type || 'search'} page: ${url}`);

            try {
                // Add random delays throughout to simulate human behavior
                await page.waitForTimeout(Math.random() * 2000 + 1000);
                
                if (!userData.type || userData.type === 'search') {
                    // Handle search results page
                    log.debug('Waiting for page to load...');
                    
                    // Wait for page to be fully loaded
                    try {
                        await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
                    } catch (e) {
                        log.warning('Page load timeout, continuing anyway...');
                    }
                    
                    await page.waitForTimeout(3000);
                    
                    // Check if we hit a captcha or block page
                    const pageContent = await page.content();
                    if (pageContent.includes('unusual traffic') || pageContent.includes('verify') || pageContent.includes('captcha')) {
                        log.error('Detected blocking or captcha page');
                        if (input.debugScreenshots) {
                            await saveScreenshot(page, `blocked-${Date.now()}.png`);
                        }
                        
                        // Try to wait it out
                        log.info('Waiting 30 seconds before retry...');
                        await page.waitForTimeout(30000);
                        
                        // Reload page
                        await page.reload();
                        await page.waitForTimeout(5000);
                    }
                    
                    // Try to find business listings
                    log.debug('Looking for business listings...');
                    
                    // Extract business listings with a more flexible approach
                    const businesses = await page.evaluate(() => {
                        const results = [];
                        
                        // Find all links that look like business pages
                        const allLinks = document.querySelectorAll('a[href*="/biz/"]');
                        
                        allLinks.forEach(link => {
                            const href = link.href;
                            // Filter out non-business links
                            if (href && href.includes('/biz/') && 
                                !href.includes('/writeareview') && 
                                !href.includes('/questions') &&
                                !href.includes('/photos')) {
                                
                                // Try to find the business name
                                let name = link.textContent;
                                // Check if link contains an h3 or h4
                                const heading = link.querySelector('h3, h4');
                                if (heading) {
                                    name = heading.textContent;
                                }
                                // Or if the link is within a heading
                                const parentHeading = link.closest('h3, h4');
                                if (parentHeading) {
                                    name = parentHeading.textContent;
                                }
                                
                                if (name && name.trim()) {
                                    results.push({
                                        url: href,
                                        name: name.trim(),
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

                    log.info(`Found ${businesses.length} businesses on this page`);
                    
                    if (businesses.length === 0) {
                        log.warning('No businesses found, page might be blocked or changed');
                        if (input.debugScreenshots) {
                            await saveScreenshot(page, `no-businesses-${Date.now()}.png`);
                        }
                    }

                    // Queue business detail pages with delays
                    for (const business of businesses) {
                        if (businessCount >= maxResults) {
                            log.info(`Reached max results limit: ${maxResults}`);
                            break;
                        }

                        // Add delay between requests
                        await page.waitForTimeout(Math.random() * 2000 + 1000);

                        await crawler.addRequests([{
                            url: business.url,
                            userData: { type: 'detail', businessName: business.name },
                        }]);

                        businessCount++;
                    }

                    // Look for next page
                    if (businessCount < maxResults) {
                        const nextPageLink = await page.evaluate(() => {
                            // Try various selectors for next page
                            const nextLink = document.querySelector('a[aria-label="Next"], a.next-link, [class*="next"] a, a:has-text("Next")');
                            return nextLink ? nextLink.href : null;
                        });

                        if (nextPageLink) {
                            log.info('Found next page, queueing...');
                            // Add significant delay before next page
                            await page.waitForTimeout(Math.random() * 5000 + 5000);
                            
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
                    await page.waitForLoadState('domcontentloaded');
                    await page.waitForTimeout(Math.random() * 3000 + 2000);
                    
                    // Wait for main content
                    try {
                        await page.waitForSelector('h1', { timeout: 10000 });
                    } catch (e) {
                        log.warning('Could not find h1 on detail page');
                    }
                    
                    const businessData = await extractBusinessDetails(page);
                    
                    if (businessData) {
                        businessData.yelpUrl = url;
                        businessData.scrapedAt = new Date().toISOString();
                        businessData.emails = [];
                        businessData.phonesFromWebsite = [];
                        businessData.socialLinks = [];
                        
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