require("dotenv").config();
const {
    Client,
    GatewayIntentBits,
    Events,
    Partials
} = require("discord.js");
const fetch = require("node-fetch");
const http = require("http");

// Keep-alive para Railway
http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
}).listen(process.env.PORT || 8000);

// Configurações
const OWNER_ID = "1364280936304218155";
const GROQ_KEY = process.env.GROQ_KEY;

// Estado
let emojisEnabled = true;

// Memória por usuário *por canal*
let memory = {}; 
// Estrutura: memory[channelId][userId] = [mensagens...]

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
    return emojisEnabled ? `⏱️ Pensei durante: ${s}s` : `Pensei durante: ${s}s`;
}

function limpar(p) {
    return p.replace(/[^a-zA-ZÀ-ÿ]/g, "").trim();
}

function extrairNomePrincipal(username) {
    if (!username) return "Usuário";
    let nome = username.trim();
    const partes = nome.split(/\s+/);

    const lixo = [
        "xx","xX","XX","Xx",
        "oficial","official",
        "dev","gamer","br","pt","ptbr","brasil","portugal"
    ];

    for (let p of partes) {
        let limpo = limpar(p);
        if (!limpo) continue;
        const lower = limpo.toLowerCase();
        if (lixo.includes(lower)) continue;
        if (/\d/.test(limpo)) continue;
        return limpo[0].toUpperCase() + limpo.slice(1).toLowerCase();
    }

    let fallback = limpar(partes[0]);
    if (!fallback) return "Usuário";
    return fallback[0].toUpperCase() + fallback.slice(1).toLowerCase();
}

// IA utilitária simples
async function askGroqSimple(prompt) {
    const body = {
        model: "llama-3.3-70b-versatile",
        messages: [
            { role: "system", content: "Responda de forma extremamente objetiva, sem explicações extras." },
            { role: "user", content: prompt }
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
        return data?.choices?.[0]?.message?.content?.trim() || null;
    } catch {
        return null;
    }
}

// IA principal — agora com palavras‑tema e estilo livre
async function gerarIA(prompt, contexto, autorUsername) {
    const creatorName = randomCreatorName();
    const nomePrincipal = extrairNomePrincipal(autorUsername);

    const palavrasTema = [
        "átomo","eletrão","protão","neutrão","neuton",
        "força gravitacional","força","satélite","espaço",
        "cratera","sismo","molécula","fissão","nuclear",
        "velocidade","acelerador de partículas","plasma","urânio"
    ];

    const body = {
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "system",
                content: `
Você é o CraspoBot∛.

IDENTIDADE:
- Criado por ${creatorName}.
- Espírito inspirado num labrador preto adulto: atento, leal, observador.
- Parte da CrespoIS — Crespo Intelligence System.

LINGUAGEM:
- Responda sempre em português do Brasil.
- Tom técnico, educado, claro.
- Humor nuclear suave, ocasional, nunca exagerado.
- NÃO use frases prontas. Crie metáforas novas quando fizer sentido.
- Use como inspiração estas palavras (não obrigatório): ${palavrasTema.join(", ")}.
- Corrija automaticamente erros de português.
- Adapte a língua se o usuário pedir explicitamente outra.

TRATAMENTO:
- Use "você".
- Quando usar o nome do usuário, use: "${nomePrincipal}".

MEMÓRIA:
- Aqui está o contexto recente deste usuário neste canal:
${contexto}

OBJETIVO:
- Responder de forma natural, fluida, inteligente e contextual.
- A IA deve criar tudo — metáforas, estilo, correções, fluidez.
`
            },
            { role: "user", content: prompt }
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
        return data?.choices?.[0]?.message?.content?.trim()
            || "O reator conversacional oscilou. Tente novamente.";
    } catch {
        return "Tive um colapso atômico interno ao tentar responder. Tente novamente.";
    }
}

// _time
async function obterHoraLugar(lugarOuUtc) {
    const q = lugarOuUtc.trim();
    const utcMatch = q.toUpperCase().match(/^UTC\s*([+-]\d{1,2})(?::?(\d{2}))?$/);

    if (utcMatch) {
        const horas = parseInt(utcMatch[1], 10);
        const minutos = utcMatch[2] ? parseInt(utcMatch[2], 10) : 0;

        const agora = new Date();
        const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60000;
        const offsetMs = (horas * 60 + Math.sign(horas) * minutos) * 60000;
        const alvo = new Date(utcMs + offsetMs);

        return `Horário aproximado em ${q.toUpperCase()}: ${alvo.toISOString().replace("T"," ").slice(0,19)} (aprox.).`;
    }

    const pergunta = `Informe apenas o offset UTC atual da localidade "${q}" no formato UTC+H, UTC-H ou UTC+H:MM.`;
    const resposta = await askGroqSimple(pergunta);
    if (!resposta) return `Não consegui determinar o UTC de "${q}".`;

    const matchIA = resposta.toUpperCase().match(/UTC\s*([+-]\d{1,2})(?::?(\d{2}))?/);
    if (!matchIA) return `Não consegui interpretar o UTC de "${q}".`;

    const horas = parseInt(matchIA[1], 10);
    const minutos = matchIA[2] ? parseInt(matchIA[2], 10) : 0;

    const agora = new Date();
    const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60000;
    const offsetMs = (horas * 60 + Math.sign(horas) * minutos) * 60000;
    const alvo = new Date(utcMs + offsetMs);

    return `Horário aproximado em ${q} (${matchIA[0]}): ${alvo.toISOString().replace("T"," ").slice(0,19)} (aprox.).`;
}

// _where
async function whereLugar(lugar) {
    const q = lugar.trim();
    if (!q) return "Informe um lugar após o comando _where.";

    const prompt = `
Para o lugar "${q}", responda APENAS assim:
Nome - País - LAT - LON
`;
    const resposta = await askGroqSimple(prompt);
    if (!resposta) return `Não consegui obter dados para "${q}".`;

    const partes = resposta.split(" - ").map(p => p.trim());
    if (partes.length < 4) return `Não consegui interpretar: ${resposta}`;

    return `Localização identificada: **${partes[0]} (${partes[1]})**\nLatitude: ${partes[2]}\nLongitude: ${partes[3]}`;
}

// _search
async function pesquisarTermo(termo) {
    termo = termo.trim();
    if (!termo) return "Informe um termo após _search.";

    const ddgRes = await fetch(
        "https://api.duckduckgo.com/?format=json&no_redirect=1&no_html=1&q=" +
        encodeURIComponent(termo)
    );
    const ddg = await ddgRes.json();

    let resposta = "";
    resposta += ddg.AbstractText
        ? `**DuckDuckGo:** ${ddg.AbstractText}\n`
        : `**DuckDuckGo:** Nenhum resumo encontrado.\n`;

    const wikiRes = await fetch(
        "https://en.wikipedia.org/api/rest_v1/page/summary/" +
        encodeURIComponent(termo)
    );

    if (wikiRes.ok) {
        const wiki = await wikiRes.json();
        resposta += wiki.extract
            ? `\n**Wikipedia:** ${wiki.extract}`
            : `\n**Wikipedia:** Nenhum resumo disponível.`;
    }

    return resposta;
}

// Comandos
const publicCommands = {
    "_id": "Mostra o seu ID.",
    "_time": "Mostra a hora via UTC ou cidade.",
    "_where": "Mostra localização aproximada.",
    "_search": "Pesquisa no DuckDuckGo + Wikipedia.",
    "_emojis enabled": "Ativa emojis.",
    "_emojis disabled": "Desativa emojis.",
    "_commands": "Lista comandos públicos."
};

const adminCommands = {
    "_reset": "Limpa memória deste usuário neste canal.",
    "_shutdown": "Reinicia o bot.",
    "_adm-cmd": "Lista comandos administrativos."
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

    const canal = msg.channel.id;
    const user = msg.author.id;

    if (!memory[canal]) memory[canal] = {};
    if (!memory[canal][user]) memory[canal][user] = [];

    memory[canal][user].push(msg.content);
    if (memory[canal][user].length > 8) memory[canal][user].shift();

    const content = msg.content.trim();

    // Comandos públicos
    if (content === "_commands") {
        let texto = "📜 Comandos disponíveis:\n\n";
        for (const cmd in publicCommands) texto += `${cmd} → ${publicCommands[cmd]}\n`;
        return msg.reply(texto);
    }

    // Admin
    if (content === "_adm-cmd") {
        if (user !== OWNER_ID) return msg.reply("Apenas o Crespo pode ver estes comandos.");
        let texto = "🛠 Comandos administrativos:\n\n";
        for (const cmd in adminCommands) texto += `${cmd} → ${adminCommands[cmd]}\n`;
        return msg.reply(texto);
    }

    if (content === "_id") return msg.reply("O seu ID é: " + user);

    if (content === "_emojis enabled") {
        emojisEnabled = true;
        return msg.reply("Emojis ativados.");
    }

    if (content === "_emojis disabled") {
        emojisEnabled = false;
        return msg.reply("Emojis desativados.");
    }

    if (content === "_shutdown") {
        if (user !== OWNER_ID) return msg.reply("Apenas o Crespo pode reiniciar.");
        await msg.reply("Reiniciando...");
        process.exit(1);
    }

    if (content === "_reset") {
        if (user !== OWNER_ID) return msg.reply("Apenas o Crespo pode resetar memória.");
        memory[canal][user] = [];
        return msg.reply("Memória deste usuário neste canal foi resetada.");
    }

    // _time
    if (content.startsWith("_time ")) {
        const query = content.slice(6).trim();
        const thinking = await msg.reply("Calculando horário...");
        const respostaTempo = await obterHoraLugar(query);
        return thinking.edit(respostaTempo);
    }

    // _where
    if (content.startsWith("_where ")) {
        const lugar = content.slice(7).trim();
        const thinking = await msg.reply("Localizando...");
        const resposta = await whereLugar(lugar);
        return thinking.edit(resposta);
    }

    // _search
    if (content.startsWith("_search ")) {
        const termo = content.slice(8).trim();
        const thinking = await msg.reply("Pesquisando...");
        const resposta = await pesquisarTermo(termo);
        return thinking.edit(resposta);
    }

    // IA: menção ou reply ao bot
    const isMention =
        msg.mentions.has(client.user) ||
        content.startsWith(`<@${client.user.id}>`) ||
        content.startsWith(`<@!${client.user.id}>`);

    let isReplyToBot = false;
    if (msg.reference?.messageId) {
        try {
            const refMsg = await msg.channel.messages.fetch(msg.reference.messageId);
            if (refMsg.author.id === client.user.id) isReplyToBot = true;
        } catch {}
    }

    if (!isMention && !isReplyToBot) return;

    let textoUser = content
        .replace(`<@${client.user.id}>`, "")
        .replace(`<@!${client.user.id}>`, "")
        .trim();

    if (!textoUser && !isReplyToBot) {
        return msg.reply("Use um comando ou escreva algo após me mencionar.");
    }

    if (!textoUser && isReplyToBot) return;

    const contexto = memory[canal][user].join("\n");
    const thinkingMsg = await msg.reply("Processando com precisão atômica...");

    const start = Date.now();
    const respostaIA = await gerarIA(textoUser, contexto, msg.author.username);
    const elapsed = (Date.now() - start) / 1000;

    const finalText = `${formatThinkingTime(elapsed)}\n${respostaIA}`;
    return thinkingMsg.edit(finalText);
});

client.login(process.env.TOKEN);
