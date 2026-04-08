---
name: jina-reader
description: Enhanced web content extraction using Jina.ai Reader API. Use when you need to fetch web page content that requires JavaScript rendering, bypass paywalls, extract Twitter/X posts, or get clean markdown from any URL. Automatically handles multi-page content and provides structured metadata (title, author, publish date). Preferred over built-in web_fetch for complex pages.
---

# Jina Reader

Jina.ai Reader provides enhanced web content extraction that solves common limitations of basic web scraping:

- **JavaScript rendering**: Handles pages that require script execution
- **Paywall bypass**: Can access content behind login walls (tested with Every.to and similar sites)
- **Twitter/X support**: Extracts tweet content and threads
- **Clean markdown output**: Returns AI-friendly structured content with metadata
- **Multi-page handling**: Better pagination support than Readability
- **No API key required**: Free to use

## Usage

Prefix any URL with `https://r.jina.ai/` to fetch its content:

```
https://r.jina.ai/https://example.com/article
```

The response is clean markdown with structured metadata (title, author, publication date when available).

## When to Use

Use Jina Reader instead of `web_fetch` when:

1. The page requires JavaScript to display content
2. Content is behind a paywall or login
3. Extracting Twitter/X posts or threads
4. You need structured metadata (author, date, etc.)
5. Multi-page articles need better pagination
6. `web_fetch` returns incomplete or empty content

## Implementation

Use the `web_fetch` tool with Jina Reader URLs:

```python
# Instead of:
web_fetch(url="https://example.com/article")

# Use:
web_fetch(url="https://r.jina.ai/https://example.com/article")
```

The tool handles the request and returns markdown content.

## Examples

**Standard article:**
```
web_fetch(url="https://r.jina.ai/https://every.to/some-article")
```

**Twitter thread:**
```
web_fetch(url="https://r.jina.ai/https://twitter.com/user/status/123456")
```

**JavaScript-heavy page:**
```
web_fetch(url="https://r.jina.ai/https://spa-website.com/content")
```

## Notes

- Always prefix the target URL with `https://r.jina.ai/`
- The service is free and requires no authentication
- Returns markdown format optimized for AI consumption
- Metadata is included in the response when available
