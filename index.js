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

// IA simples
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

// IA principal
async function gerarIA(prompt, contexto, autorUsername) {
    const creatorName = randomCreatorName();
    const nomePrincipal = extrairNomePrincipal(autorUsername);

    const palavrasTema = [
        "átomo","eletrão","protão","neutrão","força gravitacional",
        "satélite","espaço","cratera","sismo","molécula",
        "fissão","nuclear","velocidade","plasma","urânio"
    ];

    const body = {
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "system",
                content: `
Você é o CraspoBot∛.

Criado por ${creatorName}.
Parte da CrespoIS.

Use português do Brasil.
Tom técnico com humor nuclear leve.

Use metáforas baseadas em: ${palavrasTema.join(", ")}.

Usuário: ${nomePrincipal}

Contexto:
${contexto}

Responda naturalmente e criativamente.
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
            || "O reator conversacional oscilou.";
    } catch {
        return "Colapso atómico interno.";
    }
}

// _where
async function whereLugar(lugar) {
    const resposta = await askGroqSimple(
        `Para "${lugar}", responda: Nome - País - LAT - LON`
    );

    if (!resposta) return "Erro ao localizar.";

    const partes = resposta.split(" - ");
    if (partes.length < 4) return "Erro de parsing.";

    return `Local: ${partes[0]} (${partes[1]})\nLat: ${partes[2]}\nLon: ${partes[3]}`;
}

// _search
async function pesquisarTermo(termo) {
    const ddgRes = await fetch(
        "https://api.duckduckgo.com/?format=json&no_redirect=1&q=" + encodeURIComponent(termo)
    );
    const ddg = await ddgRes.json();

    let resposta = "";

    resposta += ddg.AbstractText
        ? `DDG: ${ddg.AbstractText}\n`
        : "DDG: nada encontrado\n";

    const wikiRes = await fetch(
        "https://en.wikipedia.org/api/rest_v1/page/summary/" +
        encodeURIComponent(termo)
    );

    if (wikiRes.ok) {
        const wiki = await wikiRes.json();
        resposta += wiki.extract ? `Wikipedia: ${wiki.extract}` : "";
    }

    return resposta;
}

// ready
client.once(Events.ClientReady, () => {
    console.log(`CraspoBot∛ ligado como ${client.user.tag}`);
});

// mensagens
client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot) return;

    const canal = msg.channel.id;
    const user = msg.author.id;

    if (!memory[canal]) memory[canal] = {};
    if (!memory[canal][user]) memory[canal][user] = [];

    memory[canal][user].push(msg.content);
    if (memory[canal][user].length > 8) memory[canal][user].shift();

    const content = msg.content.trim();

    // comandos
    if (content === "_commands") return msg.reply("lista comandos");
    if (content === "_id") return msg.reply(user);

    if (content.startsWith("_time ")) {
        const q = content.slice(6);
        const r = await askGroqSimple(q);
        return msg.reply(r || "erro");
    }

    if (content.startsWith("_where ")) {
        const r = await whereLugar(content.slice(7));
        return msg.reply(r);
    }

    if (content.startsWith("_search ")) {
        const r = await pesquisarTermo(content.slice(8));
        return msg.reply(r);
    }

    // IA trigger
    if (!msg.mentions.has(client.user)) return;

    const contexto = memory[canal][user].join("\n");

    const resposta = await gerarIA(content, contexto, msg.author.username);

    return msg.reply(resposta);
});

client.login(process.env.TOKEN);
