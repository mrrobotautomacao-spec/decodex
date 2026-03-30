export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY nao configurada' });

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e) {}
    }

    // Se vier URL no body, faz scraping antes de chamar Claude
    if (body.scrape_url) {
      try {
        const scraped = await fetch(body.scrape_url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,*/*',
            'Accept-Language': 'pt-BR,pt;q=0.9'
          }
        });
        const html = await scraped.text();
        // Extract visible text from HTML
        const text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 8000);

        // Inject scraped content into the user message
        if (body.messages && body.messages.length > 0) {
          const lastMsg = body.messages[body.messages.length - 1];
          lastMsg.content = `URL analisada: ${body.scrape_url}\n\nConteúdo extraído da página:\n${text}\n\n${lastMsg.content || ''}`;
        }
      } catch(e) {
        // If scraping fails, continue with original content
        if (body.messages && body.messages.length > 0) {
          const lastMsg = body.messages[body.messages.length - 1];
          lastMsg.content = `Não foi possível acessar a URL: ${body.scrape_url}. Erro: ${e.message}\n\n${lastMsg.content || ''}`;
        }
      }
      delete body.scrape_url;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
