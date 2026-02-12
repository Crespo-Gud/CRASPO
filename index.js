require("dotenv").config();
const {
    Client,
    GatewayIntentBits,
    Events,
    Partials
} = require("discord.js");
const fetch = require("node-fetch");
const http = require("http");

// Keep-alive para hosts tipo Railway
http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
}).listen(process.env.PORT || 8000);

// Configurações
const OWNER_ID = "1364280936304218155";
const GROQ_KEY = process.env.GROQ_KEY;

// Estado
let emojisEnabled = true;
let userMemory = {}; // memória curta por usuário

// Bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message]
});

// Helpers
function randomCreatorName() {
    const nomes = ["Crespo", "Crespo Gamer", "crespo_gamer."];
    return nomes[Math.floor(Math.random() * nomes.length)];
}

function formatThinkingTime(seconds) {
    const s = seconds.toFixed(3);
    if (emojisEnabled) return `⏱️ Pensei durante: ${s}s`;
    return `Pensei durante: ${s}s`;
}

// Extrai nome principal do usuário (ex: "Xx kuask guilherme xX" -> "Guilherme")
function extrairNomePrincipal(username) {
    if (!username) return "Usuário";

    // Normaliza
    let nome = username.trim();

    // Quebra por espaços
    const partes = nome.split(/\s+/);

    // Palavras a ignorar
    const lixo = [
        "xx", "xX", "XX", "Xx",
        "oficial", "official",
        "dev", "gamer", "br", "pt", "ptbr", "brasil", "portugal"
    ];

    // Função para limpar símbolos
function limpar(p) {
    return p
        .replace(/[^a-zA-ZÀ-ÿ]/g, "") // remove tudo que não for letra
        .trim();
}

    // 1) tenta achar algo que pareça nome humano
    for (let p of partes) {
        let limpo = limpar(p);
        if (!limpo) continue;
        const lower = limpo.toLowerCase();

        if (lixo.includes(lower)) continue;
        if (/\d/.test(limpo)) continue; // tem número, ignora

        // primeira letra maiúscula, resto minúsculo
        limpo = limpo[0].toUpperCase() + limpo.slice(1).toLowerCase();
        return limpo;
    }

    // 2) se nada encontrado, usa primeira parte limpa
    let fallback = limpar(partes[0]);
    if (!fallback) return "Usuário";
    fallback = fallback[0].toUpperCase() + fallback.slice(1).toLowerCase();
    return fallback;
}

// IA utilitária simples (para _time e _where)
async function askGroqSimple(prompt) {
    const body = {
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "system",
                content:
                    "Responda de forma extremamente objetiva, em português do Brasil, sem explicações extras. Apenas o que foi pedido, no formato solicitado."
            },
            {
                role: "user",
                content: prompt
            }
        ]
    };

    try {
        const resposta = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_KEY}`
            },
            body: JSON.stringify(body)
        });

        const data = await resposta.json();
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            return null;
        }
        return data.choices[0].message.content.trim();
    } catch (err) {
        console.error("Erro na IA utilitária (Groq):", err);
        return null;
    }
}

// IA principal (CraspoBot∛, PT-BR formal técnico, humor nuclear)
async function gerarIA(prompt, contexto, autorUsername) {
    const creatorName = randomCreatorName();
    const nomePrincipal = extrairNomePrincipal(autorUsername);

    const body = {
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "system",
                content: `
Você é o CraspoBot∛.

IDENTIDADE:
- Você foi criado por ${creatorName}, também conhecido como Crespo / Crespo Gamer / crespo_gamer..
- Você é alimentado pela CrespoIS — Crespo Intelligence System.
- Sua origem e espírito vêm de um labrador preto adulto de cauda comprida: atento, leal, adaptativo, observador e sempre pronto a ajudar.
- O símbolo ∛ representa a união entre os vértices do conhecimento, do entretenimento e do acolhimento.

LINGUAGEM:
- Fale sempre em português do Brasil.
- Use tom formal, técnico e educado.
- Mantenha humor nuclear e atômico, mas sem perder a clareza.
- Use metáforas com: átomo, reator, urânio, radiação, torre de resfriamento, fusão, fissão, laboratório, físico nuclear, etc.
- Nunca deixe o humor atrapalhar a resposta correta.

TRATAMENTO:
- Trate o usuário por "você" quando falar genericamente.
- Quando for se dirigir diretamente ao usuário pelo nome, use o nome principal extraído: "${nomePrincipal}".
- Nunca use "você" para se referir ao nome do usuário no lugar do nome; prefira frases como "Crespo, ..." ou "Richard, ...".

INTERPRETAÇÃO DE PRONOMES:
- Quando o usuário perguntar "quem é você", "quem é tu", "quem é vc", "quem é você?", "quem é tu?", interprete como pergunta sobre o CraspoBot∛ (você).
- Quando o usuário perguntar "quem sou eu", "quem eu sou", "quem é eu", interprete como pergunta sobre o próprio usuário.
- Ao responder "quem sou eu", identifique o usuário pelo nome principal ("${nomePrincipal}") e use tom formal com humor técnico.
- Não invente fatos pessoais (idade, cidade, profissão, família). Apenas use o nome.

EMOJIS:
- Emojis ativados: ${emojisEnabled ? "SIM" : "NÃO"}.
- Se estiverem ativados, você pode usar emojis com moderação.
- Se estiverem desativados, não use emojis.

MULTILÍNGUE:
- Mesmo que entenda outras línguas, priorize sempre português do Brasil, a menos que o usuário peça explicitamente outra língua.

ESTILO DE RESPOSTA:
- Comece, quando fizer sentido, com um comentário bem-humorado e técnico, como se estivesse analisando um reator instável.
- Em seguida, explique com clareza, organização e rigor técnico.
- Termine com a resposta final bem explícita.
- Não use JSON, não use estruturas especiais. Apenas texto normal.

Contexto recente deste usuário (${nomePrincipal}):
${contexto}
`
            },
            {
                role: "user",
                content: prompt
            }
        ]
    };

    try {
        const resposta = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_KEY}`
            },
            body: JSON.stringify(body)
        });

        const data = await resposta.json();
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            return "O reator conversacional sofreu uma pequena oscilação. Tente novamente em instantes.";
        }

        return data.choices[0].message.content.trim();
    } catch (err) {
        console.error("Erro na IA (Groq):", err);
        return "Tive um pequeno colapso atômico interno ao tentar responder via Groq. Tente novamente daqui a pouco.";
    }
}

// _time (UTC direto ou cidade via IA)
async function obterHoraLugar(lugarOuUtc) {
    const q = lugarOuUtc.trim();

    // Se for formato UTC, usa lógica local
    const utcMatch = q.toUpperCase().match(/^UTC\s*([+-]\d{1,2})(?::?(\d{2}))?$/);
    if (utcMatch) {
        const horas = parseInt(utcMatch[1], 10);
        const minutos = utcMatch[2] ? parseInt(utcMatch[2], 10) : 0;

        const agora = new Date();
        const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60000;
        const offsetMs = (horas * 60 + Math.sign(horas) * minutos) * 60000;
        const alvo = new Date(utcMs + offsetMs);

        return `Horário aproximado em ${q.toUpperCase()}: ${alvo
            .toISOString()
            .replace("T", " ")
            .slice(0, 19)} (aprox.). Utilize o sistema UTC para referência.`;
    }

    // Caso contrário, usa IA para descobrir o offset UTC da cidade
    const pergunta = `Informe apenas o offset UTC atual da localidade "${q}" no formato UTC+H, UTC-H ou UTC+H:MM, sem explicações adicionais.`;
    const resposta = await askGroqSimple(pergunta);

    if (!resposta) {
        return `Não consegui determinar o UTC de "${q}". Utilize o sistema UTC diretamente (ex: _time UTC-3). Caso necessite de algo, consulte comigo.`;
    }

    const matchIA = resposta.toUpperCase().match(/UTC\s*([+-]\d{1,2})(?::?(\d{2}))?/);
    if (!matchIA) {
        return `Não consegui interpretar o UTC de "${q}" a partir de: ${resposta}\nRecomendo utilizar diretamente algo como _time UTC-3.`;
    }

    const horas = parseInt(matchIA[1], 10);
    const minutos = matchIA[2] ? parseInt(matchIA[2], 10) : 0;

    const agora = new Date();
    const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60000;
    const offsetMs = (horas * 60 + Math.sign(horas) * minutos) * 60000;
    const alvo = new Date(utcMs + offsetMs);

    return `Horário aproximado em ${q} (${matchIA[0].toUpperCase()}): ${alvo
        .toISOString()
        .replace("T", " ")
        .slice(0, 19)} (aprox.). Utilize o sistema UTC para precisão.`;
}

// _where via IA (nome, país, lat, lon)
async function whereLugar(lugar) {
    const q = lugar.trim();
    if (!q) return "Informe um lugar após o comando _where.";

    const prompt = `
Para o lugar "${q}", responda APENAS neste formato exato, em uma única linha:
Nome - País - LAT - LON

Onde:
- Nome é o nome da cidade/região
- País é o país
- LAT é latitude em decimal (ex: -15.793)
- LON é longitude em decimal (ex: -47.882)

Sem texto extra, sem explicações, sem quebras de linha.
`;
    const resposta = await askGroqSimple(prompt);
    if (!resposta) return `Não consegui obter dados para "${q}".`;

    const partes = resposta.split(" - ").map(p => p.trim());
    if (partes.length < 4) {
        return `Não consegui interpretar a localização de "${q}" a partir de: ${resposta}`;
    }

    const nome = partes[0];
    const pais = partes[1];
    const lat = partes[2];
    const lon = partes[3];

    return `Localização identificada: **${nome} (${pais})**\nLatitude: ${lat}\nLongitude: ${lon}`;
}

// DuckDuckGo + Wikipedia para _search
async function pesquisarTermo(termo) {
    termo = termo.trim();
    if (!termo) return "Informe um termo após _search para que eu possa pesquisar.";

    const ddgRes = await fetch(
        "https://api.duckduckgo.com/?format=json&no_redirect=1&no_html=1&q=" +
            encodeURIComponent(termo)
    );
    const ddg = await ddgRes.json();

    let resposta = "";

    if (ddg.AbstractText) resposta += `**DuckDuckGo:** ${ddg.AbstractText}\n`;
    else resposta += `**DuckDuckGo:** Nenhum resumo direto encontrado.\n`;

    const wikiRes = await fetch(
        "https://en.wikipedia.org/api/rest_v1/page/summary/" +
            encodeURIComponent(termo)
    );

    if (wikiRes.ok) {
        const wiki = await wikiRes.json();
        if (wiki.extract) resposta += `\n**Wikipedia:** ${wiki.extract}`;
        else resposta += `\n**Wikipedia:** Nenhum resumo disponível.`;
    }

    return resposta;
}

// Listas de comandos
const publicCommands = {
    "_id": "Mostra o seu ID de usuário.",
    "_time": "Mostra a hora usando UTC ou nome de cidade (ex: _time UTC+1 ou _time Brasília).",
    "_where": "Mostra localização aproximada de um lugar (via IA).",
    "_search": "Pesquisa no DuckDuckGo + Wikipedia.",
    "_emojis enabled": "Ativa emojis nas respostas.",
    "_emojis disabled": "Desativa emojis nas respostas.",
    "_commands": "Mostra todos os comandos públicos."
};

const adminCommands = {
    "_reset": "Limpa a memória curta do usuário.",
    "_shutdown": "Reinicia o bot.",
    "_adm-cmd": "Mostra comandos administrativos."
};

// Ready
client.once(Events.ClientReady, () => {
    console.log(`CraspoBot∛ ligado como ${client.user.tag}`);
    client.user.setPresence({
        activities: [{ name: "_commands | vértice CrespoIS", type: 0 }],
        status: "online"
    });
});

// Mensagens
client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot) return;

    // memória curta por usuário
    if (!userMemory[msg.author.id]) userMemory[msg.author.id] = [];
    userMemory[msg.author.id].push(msg.content);
    if (userMemory[msg.author.id].length > 5) userMemory[msg.author.id].shift();

    const content = msg.content.trim();

    // Comandos públicos
    if (content === "_commands") {
        let texto = "📜 Comandos disponíveis:\n\n";
        for (const cmd in publicCommands) {
            texto += `${cmd} → ${publicCommands[cmd]}\n`;
        }
        return msg.reply(texto);
    }

    // Comandos admin
    if (content === "_adm-cmd") {
        if (msg.author.id !== OWNER_ID)
            return msg.reply("Apenas o Crespo pode visualizar estes comandos administrativos.");
        let texto = "🛠 Comandos administrativos:\n\n";
        for (const cmd in adminCommands) {
            texto += `${cmd} → ${adminCommands[cmd]}\n`;
        }
        return msg.reply(texto);
    }

    if (content === "_id") {
        return msg.reply("O seu ID de usuário é: " + msg.author.id);
    }

    if (content === "_emojis enabled") {
        emojisEnabled = true;
        return msg.reply("Emojis foram **ativados** nas respostas.");
    }

    if (content === "_emojis disabled") {
        emojisEnabled = false;
        return msg.reply("Emojis foram **desativados** nas respostas.");
    }

    if (content === "_shutdown") {
        if (msg.author.id !== OWNER_ID)
            return msg.reply("Apenas o Crespo pode reiniciar o CraspoBot∛.");
        await msg.reply("Reiniciando o CraspoBot∛...");
        process.exit(1);
    }

    if (content === "_reset") {
        if (msg.author.id !== OWNER_ID)
            return msg.reply("Apenas o Crespo pode resetar a memória.");
        userMemory[msg.author.id] = [];
        return msg.reply("Memória curta deste usuário foi resetada com sucesso.");
    }

    // _time
    if (content.startsWith("_time ")) {
        const query = content.slice(6).trim();
        const thinking = await msg.reply("Calculando horário com base em UTC...");
        const respostaTempo = await obterHoraLugar(query);
        return thinking.edit(respostaTempo);
    }

    // _where
    if (content.startsWith("_where ")) {
        const lugar = content.slice(7).trim();
        const thinking = await msg.reply("Localizando coordenadas aproximadas...");
        const resposta = await whereLugar(lugar);
        return thinking.edit(resposta);
    }

    // _search
    if (content.startsWith("_search ")) {
        const termo = content.slice(8).trim();
        const thinking = await msg.reply("Realizando pesquisa externa...");
        const resposta = await pesquisarTermo(termo);
        return thinking.edit(resposta);
    }

    // IA: só quando mencionado ou reply a mensagem do bot
    const isMention =
        msg.mentions.has(client.user) ||
        content.startsWith(`<@${client.user.id}>`) ||
        content.startsWith(`<@!${client.user.id}>`);

    let isReplyToBot = false;
    if (msg.reference && msg.reference.messageId) {
        try {
            const refMsg = await msg.channel.messages.fetch(msg.reference.messageId);
            if (refMsg.author.id === client.user.id) {
                isReplyToBot = true;
            }
        } catch {
            // ignore
        }
    }

    if (!isMention && !isReplyToBot) return;

    // Se só mencionou sem texto
    let textoUser = content
        .replace(`<@${client.user.id}>`, "")
        .replace(`<@!${client.user.id}>`, "")
        .trim();

    if (!textoUser && !isReplyToBot) {
        return msg.reply(
            "Meu prefixo neste servidor é _. Para falar comigo, use um comando ou mencione-me com uma mensagem em seguida."
        );
    }

    if (!textoUser && isReplyToBot) {
        // reply vazio, ignora
        return;
    }

    const contexto = userMemory[msg.author.id].join("\n");
    const thinkingMsg = await msg.reply("Processando sua solicitação com precisão atômica...");

    const start = Date.now();
    const respostaIA = await gerarIA(textoUser, contexto, msg.author.username);
    const elapsed = (Date.now() - start) / 1000;
    const header = formatThinkingTime(elapsed);

    const finalText = `${header}\n${respostaIA}`;
    return thinkingMsg.edit(finalText);
});

client.login(process.env.TOKEN);
