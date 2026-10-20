const { execFile } = require('child_process');

class GeminiEngine {
  async executeRequest(url, payload) {
    // 1. Windows curl.exe ile IPv4 zorlaması (-4)
    try {
      const args = ['-4', '-s', '-X', 'POST', url, '-H', 'Content-Type: application/json', '--connect-timeout', '8', '-m', '20', '--data-binary', '@-'];
      const stdout = await new Promise((resolve, reject) => {
        const child = execFile('curl.exe', args, { timeout: 20000 }, (err, out) => {
          if (err) return reject(err);
          if (!out || !out.trim()) return reject(new Error('Boş API yanıtı'));
          resolve(out);
        });
        child.stdin.write(JSON.stringify(payload));
        child.stdin.end();
      });
      return JSON.parse(stdout);
    } catch (curlErr) {
      // 2. Linux / macOS fallback: fetch
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000)
      });
      return await res.json();
    }
  }

  async generateReply({ apiKey, model = 'gemini-2.5-flash', personality, prompt, streamContext = {} }) {
    if (!apiKey || !apiKey.trim()) {
      return { ok: false, error: 'API anahtarı girilmemiş.' };
    }

    const cleanModel = (model || 'gemini-2.5-flash').trim();
    const cleanKey = apiKey.trim();

    const systemInstruction = `
${personality || 'Sen Kick canlı yayınında yer alan samimi, esprili ve bilgili bir AI chat asistanısın.'}

[CANLI YAYIN DURUMU]
- Kanal / Yayıncı: ${streamContext.channelSlug || 'Yayıncı'}
- Kategori / Oyun: ${streamContext.category || 'Genel / Sohbet'}
- Yayın Başlığı: ${streamContext.title || 'Canlı Yayın'}

[ÖNEMLİ KURALLAR]
1. Cümleni ASLA yarım bırakma! 1 veya 2 tam, akıcı cümleyle lafını eksiksiz bitir ve sonuna nokta (.) koy.
2. Kesik kesik veya eksik cevap verme; yayıncı veya izleyicinin dediğine oyuna tam uyumlu, doğal ve samimi bir dille cevap ver.
3. Tırnak işareti, "Bot:", "Cevap:" gibi ön ekler KOYMA. Doğrudan Kick chatine yazılacak mesajı ver.
    `.trim();

    const fullPrompt = `${systemInstruction}\n\n---\n\n${prompt}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [{ text: fullPrompt }]
        }
      ],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 800,
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    };

    const candidateUrls = [
      `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${cleanKey}`,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${cleanKey}`,
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${cleanKey}`,
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${cleanKey}`
    ];

    for (const url of candidateUrls) {
      try {
        const data = await this.executeRequest(url, payload);
        if (data && data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
          let reply = data.candidates[0].content.parts[0].text.trim();
          reply = reply.replace(/^["'“”«»]+|["'“”«»]+$/g, '').trim();
          return { ok: true, reply };
        }
      } catch (e) {
        // Sonraki adaya geç
      }
    }

    return { ok: false, error: 'Gemini API yanıt üretemedi.' };
  }
}

module.exports = new GeminiEngine();
