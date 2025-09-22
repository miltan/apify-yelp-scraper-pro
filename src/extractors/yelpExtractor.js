import { CONSTANTS } from '../constants.js';

export async function extractBusinessDetails(page) {
    try {
        const businessData = await page.evaluate((selectors) => {
            const data = {};

            // Name
            const nameEl = document.querySelector(selectors.DETAIL_NAME);
            data.name = nameEl?.textContent?.trim();

            // Categories
            const categoryEls = document.querySelectorAll(selectors.DETAIL_CATEGORIES);
            data.categories = Array.from(categoryEls).map(el => el.textContent?.trim()).filter(Boolean);

            // Rating
            const ratingEl = document.querySelector(selectors.DETAIL_RATING);
            const ratingText = ratingEl?.getAttribute('aria-label');
            if (ratingText) {
                const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
                data.rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
            }

            // Review count
            const reviewEl = document.querySelector(selectors.DETAIL_REVIEWS);
            const reviewText = reviewEl?.textContent;
            if (reviewText) {
                const reviewMatch = reviewText.match(/(\d+)/);
                data.reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : null;
            }

            // Price level
            const priceEl = document.querySelector(selectors.DETAIL_PRICE);
            data.priceLevel = priceEl?.textContent?.trim();

            // Phone
            const phoneEl = document.querySelector(selectors.DETAIL_PHONE);
            data.phone = phoneEl?.textContent?.trim();

            // Address
            const addressEl = document.querySelector(selectors.DETAIL_ADDRESS);
            if (addressEl) {
                const addressText = addressEl.textContent?.trim();
                const addressLines = addressText?.split('\n').map(line => line.trim()).filter(Boolean);
                
                if (addressLines && addressLines.length > 0) {
                    data.address = addressLines[0];
                    
                    // Parse city, state, zip from last line
                    const lastLine = addressLines[addressLines.length - 1];
                    const cityStateZipMatch = lastLine.match(/^(.+?),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)$/);
                    
                    if (cityStateZipMatch) {
                        data.city = cityStateZipMatch[1];
                        data.region = cityStateZipMatch[2];
                        data.postalCode = cityStateZipMatch[3];
                    } else {
                        // Try simpler pattern for city, state
                        const cityStateMatch = lastLine.match(/^(.+?),\s*([A-Z]{2})$/);
                        if (cityStateMatch) {
                            data.city = cityStateMatch[1];
                            data.region = cityStateMatch[2];
                        }
                    }
                    
                    data.country = 'US'; // Default to US for Yelp
                }
            }

            // Website
            const websiteEl = document.querySelector(selectors.DETAIL_WEBSITE);
            if (websiteEl) {
                // Extract the actual URL from Yelp's redirect link
                const href = websiteEl.href;
                const urlMatch = href.match(/url=([^&]+)/);
                data.website = urlMatch ? decodeURIComponent(urlMatch[1]) : null;
                
                // Clean up the URL
                if (data.website && !data.website.startsWith('http')) {
                    data.website = `https://${data.website}`;
                }
            }

            return data;
        }, CONSTANTS.YELP_SELECTORS);

        return businessData;
    } catch (error) {
        console.error('Error extracting business details:', error);
        return null;
    }
}