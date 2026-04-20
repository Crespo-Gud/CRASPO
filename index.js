require("dotenv").config();
const {
    Client,
    GatewayIntentBits,
    Events,
    Partials,
    EmbedBuilder
} = require("discord.js");
const fetch = require("node-fetch");
const http = require("http");

// Keep-alive Railway
http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
}).listen(process.env.PORT || 8000);

// Config
const OWNER_ID = "1364280936304218155";
const GROQ_KEY = process.env.GROQ_KEY;

// Estado
let emojisEnabled = true;

// Memória por usuário por canal
let memory = {}; // agora com limite 10
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message]
});
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
    } catch (err) {
        console.error("Erro askGroqSimple:", err);
        return null;
    }
}
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
- Humor nuclear suave.
- Use como inspiração: ${palavrasTema.join(", ")}.
- Corrija automaticamente erros de português.

TRATAMENTO:
- Use "você".
- Nome do usuário: "${nomePrincipal}".

MEMÓRIA:
${contexto}

OBJETIVO:
- Responder de forma natural, fluida e contextual.
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
        const out = data?.choices?.[0]?.message?.content?.trim();

        if (out) return out;

        // FALLBACK
        const fallback = await askGroqSimple(prompt);
        return fallback || "O núcleo conversacional entrou em oscilação temporária.";
    } catch (err) {
        console.error("Erro gerarIA:", err);
        const fallback = await askGroqSimple(prompt);
        return fallback || "Falha interna ao processar.";
    }
}
async function obterHoraLugar(lugarOuUtc) { ... }
async function whereLugar(lugar) { ... }
async function pesquisarTermo(termo) { ... }
function embedCrespoIS(titulo, descricao) {
    return new EmbedBuilder()
        .setColor("#4A90E2")
        .setTitle(`📡 CrespoA.I.C.S. — ${titulo}`)
        .setDescription(descricao)
        .setFooter({ text: "CrespoIS • Núcleo Técnico" })
        .setTimestamp();
}
client.once(Events.ClientReady, () => {
    console.log(`CraspoBot∛ ligado como ${client.user.tag}`);
    client.user.setPresence({
        activities: [{ name: "_commands | vértice CrespoIS", type: 0 }],
        status: "online"
    });
});
client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot) return;

    msg.channel.sendTyping();

    const canal = msg.channel.id;
    const user = msg.author.id;

    if (!memory[canal]) memory[canal] = {};
    if (!memory[canal][user]) memory[canal][user] = [];

    memory[canal][user].push(msg.content);
    if (memory[canal][user].length > 10) memory[canal][user].shift();

    const content = msg.content.trim();
if (content === "_commands") {
    let texto = "";
    for (const cmd in publicCommands) texto += `**${cmd}** → ${publicCommands[cmd]}\n`;
    return msg.reply({ embeds: [embedCrespoIS("Comandos Públicos", texto)] });
}
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
