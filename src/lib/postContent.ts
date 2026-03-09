function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function normalizeLineBreaks(value: string): string {
    return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function trimTrailingUrlPunctuation(value: string): { url: string; trailing: string } {
    let url = value;
    let trailing = "";

    while (/[),.!?:;]+$/.test(url)) {
        trailing = `${url.slice(-1)}${trailing}`;
        url = url.slice(0, -1);
    }

    return { url, trailing };
}

export function linkifyPastedText(text: string): string {
    const normalized = normalizeLineBreaks(text);
    const urlRegex = /https?:\/\/[^\s<>"']+/gi;

    let lastIndex = 0;
    let html = "";

    for (const match of normalized.matchAll(urlRegex)) {
        const matchedUrl = match[0];
        const matchIndex = match.index ?? 0;
        const { url, trailing } = trimTrailingUrlPunctuation(matchedUrl);

        html += escapeHtml(normalized.slice(lastIndex, matchIndex));
        html += `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
        html += escapeHtml(trailing);
        lastIndex = matchIndex + matchedUrl.length;
    }

    html += escapeHtml(normalized.slice(lastIndex));

    return html.replace(/\n/g, "<br>");
}

function ensureAnchorAttributes(attributes: string): string {
    const hrefMatch = attributes.match(/\bhref\s*=\s*(['"])(.*?)\1/i);
    const href = hrefMatch?.[2]?.trim() || "";

    if (!href || href.startsWith("#") || /^javascript:/i.test(href)) {
        return attributes;
    }

    let nextAttributes = attributes;

    if (/\btarget\s*=/i.test(nextAttributes)) {
        nextAttributes = nextAttributes.replace(/\btarget\s*=\s*(['"]).*?\1/gi, 'target="_blank"');
    } else {
        nextAttributes += ' target="_blank"';
    }

    if (/\brel\s*=/i.test(nextAttributes)) {
        nextAttributes = nextAttributes.replace(/\brel\s*=\s*(['"])(.*?)\1/gi, (_match, quote, value) => {
            const tokens = new Set(
                String(value)
                    .split(/\s+/)
                    .map((token) => token.trim())
                    .filter(Boolean)
            );
            tokens.add("noopener");
            tokens.add("noreferrer");
            return `rel=${quote}${[...tokens].join(" ")}${quote}`;
        });
    } else {
        nextAttributes += ' rel="noopener noreferrer"';
    }

    return nextAttributes;
}

export function openLinksInNewTab(html: string): string {
    return html.replace(/<a\b([^>]*)>/gi, (_match, attributes) => `<a${ensureAnchorAttributes(attributes)}>`);
}

export function formatProductUpdateDate(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}.${month}.${day}`;
}

export function createProductUpdateMarkerHtml(
    value: string | Date = new Date(),
    options?: { withSpacer?: boolean }
): string {
    const formatted = formatProductUpdateDate(value) || formatProductUpdateDate(new Date());
    const marker = `<div class="product-update-marker" data-product-update-marker="true"><span>${formatted}</span></div>`;
    return options?.withSpacer ? `${marker}<div data-product-update-spacer="true"><br></div>` : marker;
}

function hasProductUpdateMarker(html: string): boolean {
    return /data-product-update-marker\s*=\s*["']true["']/i.test(html);
}

function normalizeProductUpdateMarkup(html: string): string {
    return html.replace(
        /(<div class="product-update-marker"[^>]*>[\s\S]*?<\/div>)(?:\s*(?:<p>\s*(?:<br\s*\/?>)?\s*<\/p>|<div(?:\s+data-product-update-spacer="true")?>\s*(?:<br\s*\/?>)?\s*<\/div>))+/gi,
        "$1"
    );
}

export function prepareRenderedPostHtml(
    html: string,
    options?: { isProduct?: boolean; createdAt?: string | null }
): string {
    const normalized = openLinksInNewTab(html || "");
    const normalizedProductMarkup = options?.isProduct
        ? normalizeProductUpdateMarkup(normalized)
        : normalized;

    if (!options?.isProduct || hasProductUpdateMarker(normalizedProductMarkup)) {
        return normalizedProductMarkup;
    }

    const marker = createProductUpdateMarkerHtml(options.createdAt || new Date());
    return `${marker}${normalizedProductMarkup}`;
}
