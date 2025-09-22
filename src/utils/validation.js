export function validateInput(input) {
    const validated = { ...input };

    // Set defaults if not provided
    validated.maxResults = validated.maxResults || 50;
    validated.maxConcurrency = validated.maxConcurrency || 3;
    validated.fetchContactsFromWebsite = validated.fetchContactsFromWebsite !== false;
    validated.contactPagePaths = validated.contactPagePaths || ['/contact', '/about', '/contact-us', '/about-us'];
    validated.useResidentialProxy = validated.useResidentialProxy || false;
    validated.proxyCountryCode = validated.proxyCountryCode || 'US';
    validated.debugScreenshots = validated.debugScreenshots || false;

    // Validate max results
    if (validated.maxResults < 1) {
        validated.maxResults = 1;
    } else if (validated.maxResults > 1000) {
        validated.maxResults = 1000;
    }

    // Validate max concurrency
    if (validated.maxConcurrency < 1) {
        validated.maxConcurrency = 1;
    } else if (validated.maxConcurrency > 10) {
        validated.maxConcurrency = 10;
    }

    return validated;
}

export function buildYelpSearchUrl(search, location) {
    if (!search || !location) {
        return null;
    }

    const params = new URLSearchParams({
        find_desc: search,
        find_loc: location,
    });

    return `https://www.yelp.com/search?${params.toString()}`;
}