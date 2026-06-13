// safeMarkdown renders a limited, XSS-safe subset of markdown to an HTML string
// suitable for dangerouslySetInnerHTML. It is safe because ALL input is
// HTML-escaped first, so no user-supplied markup can ever survive; only our own
// known-safe tags (with validated link hrefs) are then injected. Supported:
// code fences ```…```, inline `code`, **bold**, *italic*, [text](url), bare
// http(s) links, > blockquotes, - / 1. lists, line breaks, and @mention chips.

function escapeHtml(s: string): string
{
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Only http/https/mailto links are allowed; everything else (javascript:, data:,
// etc.) is rendered as plain text. The url is already HTML-escaped.
function safeHref(rawEscaped: string): string | null
{
    const probe = rawEscaped.replace(/&amp;/g, '&').toLowerCase().trim();
    if (probe.startsWith('http://') || probe.startsWith('https://') || probe.startsWith('mailto:'))
    {
        return rawEscaped;
    }
    return null;
}

function applyInline(text: string): string
{
    let out = text;
    // Pull inline code out first (so markdown inside it isn't transformed), using
    // a sentinel that can't occur in escaped text.
    const codes: string[] = [];
    const tokenFor = (i: number) => `CODE${ i }`;
    out = out.replace(/`([^`]+)`/g, (_m, code: string) =>
    {
        codes.push(`<code class="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.85em]">${ code }</code>`);
        return tokenFor(codes.length - 1);
    });
    // [text](url)
    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) =>
    {
        const href = safeHref(url);
        if (!href)
        {
            return `${ label } (${ url })`;
        }
        return `<a href="${ href }" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">${ label }</a>`;
    });
    // Bare http(s) links.
    out = out.replace(/(^|[\s(])((?:https?:\/\/)[^\s<]+)/g, (_m, pre: string, url: string) =>
        `${ pre }<a href="${ url }" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">${ url }</a>`);
    // **bold**
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // *italic*
    out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    // @mentions
    out = out.replace(/(^|\s)@([A-Za-z0-9_]{3,32})/g,
        '$1<span class="rounded bg-accent-subtle px-1 font-medium text-accent">@$2</span>');
    // Restore inline code (plain string replace — no regex).
    codes.forEach((html, i) =>
    {
        out = out.split(tokenFor(i)).join(html);
    });
    return out;
}

export function renderMarkdown(src: string): string
{
    const escaped = escapeHtml(src ?? '');
    const lines = escaped.split(/\r?\n/);
    const html: string[] = [];

    let inCode = false;
    let codeBuf: string[] = [];
    let listType: 'ul' | 'ol' | null = null;
    let para: string[] = [];

    const flushPara = () =>
    {
        if (para.length)
        {
            html.push(`<p>${ applyInline(para.join('<br/>')) }</p>`);
            para = [];
        }
    };
    const closeList = () =>
    {
        if (listType)
        {
            html.push(`</${ listType }>`);
            listType = null;
        }
    };

    for (const line of lines)
    {
        if (line.trim() === '```')
        {
            if (inCode)
            {
                html.push(`<pre class="overflow-x-auto rounded-md bg-foreground/10 p-3 font-mono text-[0.85em]"><code>${ codeBuf.join('\n') }</code></pre>`);
                codeBuf = [];
                inCode = false;
            }
            else
            {
                flushPara();
                closeList();
                inCode = true;
            }
            continue;
        }
        if (inCode)
        {
            codeBuf.push(line);
            continue;
        }

        const ul = /^\s*[-*]\s+(.*)$/.exec(line);
        const ol = /^\s*\d+\.\s+(.*)$/.exec(line);
        const quote = /^\s*&gt;\s?(.*)$/.exec(line);

        if (ul)
        {
            flushPara();
            if (listType !== 'ul')
            {
                closeList();
                html.push('<ul class="ms-5 list-disc space-y-0.5">');
                listType = 'ul';
            }
            html.push(`<li>${ applyInline(ul[1]) }</li>`);
        }
        else if (ol)
        {
            flushPara();
            if (listType !== 'ol')
            {
                closeList();
                html.push('<ol class="ms-5 list-decimal space-y-0.5">');
                listType = 'ol';
            }
            html.push(`<li>${ applyInline(ol[1]) }</li>`);
        }
        else if (quote)
        {
            flushPara();
            closeList();
            html.push(`<blockquote class="border-s-2 border-border ps-3 text-muted-foreground">${ applyInline(quote[1]) }</blockquote>`);
        }
        else if (line.trim() === '')
        {
            flushPara();
            closeList();
        }
        else
        {
            closeList();
            para.push(line);
        }
    }
    if (inCode && codeBuf.length)
    {
        html.push(`<pre class="overflow-x-auto rounded-md bg-foreground/10 p-3 font-mono text-[0.85em]"><code>${ codeBuf.join('\n') }</code></pre>`);
    }
    flushPara();
    closeList();
    return html.join('\n');
}
