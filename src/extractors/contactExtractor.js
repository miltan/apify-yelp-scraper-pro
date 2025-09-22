import { CONSTANTS } from '../constants.js';

export function extractContactInfo(html) {
    const result = {
        emails: [],
        phones: [],
        socialLinks: [],
    };

    // Remove script and style content to avoid false positives
    const cleanHtml = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');

    // Extract emails
    const emailMatches = cleanHtml.match(CONSTANTS.CONTACT_PATTERNS.EMAIL) || [];
    result.emails = [...new Set(emailMatches.filter(email => {
        // Filter out common false positives
        return !email.includes('@2x') && 
               !email.includes('@3x') &&
               !email.endsWith('.png') &&
               !email.endsWith('.jpg') &&
               !email.endsWith('.css') &&
               !email.endsWith('.js');
    }))];

    // Extract phones
    const phoneMatches = cleanHtml.match(CONSTANTS.CONTACT_PATTERNS.PHONE) || [];
    result.phones = [...new Set(phoneMatches.map(phone => {
        // Normalize phone format
        return phone.replace(/[^\d+]/g, '').replace(/^1/, '+1');
    }).filter(phone => phone.length >= 10))];

    // Extract social media links
    const socialPatterns = CONSTANTS.CONTACT_PATTERNS.SOCIAL;
    for (const [platform, pattern] of Object.entries(socialPatterns)) {
        const matches = cleanHtml.match(pattern) || [];
        result.socialLinks.push(...matches.map(link => {
            // Ensure links have protocol
            if (!link.startsWith('http')) {
                return `https://${link}`;
            }
            return link;
        }));
    }

    // Remove duplicates from social links
    result.socialLinks = [...new Set(result.socialLinks)];

    return result;
}