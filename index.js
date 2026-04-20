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
const os = require("os");

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
let memory = {}; // limite 10

// Uptime
const startTime = Date.now();

// Bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
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

function formatUptime(ms) {
    let s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400); s %= 86400;
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); s %= 60;
    const partes = [];
    if (d) partes.push(`${d}d`);
    if (h) partes.push(`${h}h`);
    if (m) partes.push(`${m}m`);
    if (s || partes.length === 0) partes.push(`${s}s`);
    return partes.join(" ");
}

// IA leve
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

// IA principal
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
- Espírito inspirado num labrador preto adulto.
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

        const fallback = await askGroqSimple(prompt);
        return fallback || "O núcleo conversacional entrou em oscilação temporária.";
    } catch (err) {
        console.error("Erro gerarIA:", err);
        const fallback = await askGroqSimple(prompt);
        return fallback || "Falha interna ao processar.";
    }
}

// Comandos
const publicCommands = {
    "_id": "Mostra o seu ID.",
    "_time": "Mostra a hora via UTC ou cidade.",
    "_where": "Mostra localização aproximada.",
    "_search": "Pesquisa no DuckDuckGo + Wikipedia.",
    "_weather": "Mostra o estado do tempo numa cidade.",
    "_info": "Mostra informações do usuário e do sistema.",
    "_ping": "Mostra a latência do bot.",
    "_uptime": "Mostra há quanto tempo o bot está online.",
    "_version": "Mostra a versão do CrespoA.I.C.S.",
    "_system": "Mostra estado técnico do sistema.",
    "_emojis enabled": "Ativa emojis.",
    "_emojis disabled": "Desativa emojis.",
    "_commands": "Lista comandos públicos."
};

const adminCommands = {
    "_reset": "Limpa memória deste usuário neste canal.",
    "_shutdown": "Reinicia o bot.",
    "_adm-cmd": "Lista comandos administrativos."
};

// Embed PRO CrespoIS
function embedCrespoIS(titulo, descricao) {
    return new EmbedBuilder()
        .setColor("#4A90E2")
        .setTitle(`📡 CrespoA.I.C.S. — ${titulo}`)
        .setDescription(descricao)
        .setFooter({ text: "CrespoIS • Núcleo Técnico" })
        .setTimestamp();
}

// Ready
client.once(Events.ClientReady, () => {
    console.log(`CraspoBot∛ ligado como ${client.user.tag}`);
    client.user.setPresence({
        activities: [{ name: "_commands | vértice CrespoIS", type: 0 }],
        status: "online"
    });
});
// =========================
//   HANDLER DE MENSAGENS
// =========================

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

    // =========================
    //   COMANDOS PÚBLICOS
    // =========================

    if (content === "_commands") {
        let texto = "";
        for (const cmd in publicCommands) texto += `**${cmd}** → ${publicCommands[cmd]}\n`;
        return msg.reply({ embeds: [embedCrespoIS("Comandos Públicos", texto)] });
    }

    if (content === "_id") {
        return msg.reply("O seu ID é: **" + user + "**");
    }

    if (content === "_emojis enabled") {
        emojisEnabled = true;
        return msg.reply("Emojis ativados.");
    }

    if (content === "_emojis disabled") {
        emojisEnabled = false;
        return msg.reply("Emojis desativados.");
    }

    // =========================
    //   COMANDOS ADMIN
    // =========================

    if (content === "_adm-cmd") {
        if (user !== OWNER_ID) return msg.reply("Apenas o Crespo pode ver estes comandos.");
        let texto = "";
        for (const cmd in adminCommands) texto += `**${cmd}** → ${adminCommands[cmd]}\n`;
        return msg.reply({ embeds: [embedCrespoIS("Comandos Administrativos", texto)] });
    }

    if (content === "_shutdown") {
        if (user !== OWNER_ID) return msg.reply("Apenas o Crespo pode reiniciar.");
        await msg.reply("Reiniciando núcleo...");
        process.exit(1);
    }

    if (content === "_reset") {
        if (user !== OWNER_ID) return msg.reply("Apenas o Crespo pode resetar memória.");
        memory[canal][user] = [];
        return msg.reply("Memória deste usuário neste canal foi resetada.");
    }

    // =========================
    //   _time
    // =========================

    if (content.startsWith("_time ")) {
        const query = content.slice(6).trim();
        const thinking = await msg.reply("Calculando horário...");
        const respostaTempo = await obterHoraLugar(query);
        return thinking.edit(respostaTempo);
    }

    // =========================
    //   _where
    // =========================

    if (content.startsWith("_where ")) {
        const lugar = content.slice(7).trim();
        const thinking = await msg.reply("Localizando...");
        const resposta = await whereLugar(lugar);
        return thinking.edit(resposta);
    }

    // =========================
    //   _search (embed PRO)
    // =========================

    if (content.startsWith("_search ")) {
        const termo = content.slice(8).trim();
        if (!termo) return msg.reply("Use `_search <termo>`.");

        const thinking = await msg.reply("Consultando bases de dados orbitais...");

        const ddgRes = await fetch(
            "https://api.duckduckgo.com/?format=json&no_redirect=1&no_html=1&q=" +
            encodeURIComponent(termo)
        );
        const ddg = await ddgRes.json();

        const wikiRes = await fetch(
            "https://en.wikipedia.org/api/rest_v1/page/summary/" +
            encodeURIComponent(termo)
        );

        let ddgResumo = ddg.AbstractText || "Nenhum resumo encontrado.";
        let wikiResumo = "Nenhum resumo disponível.";

        if (wikiRes.ok) {
            const wiki = await wikiRes.json();
            if (wiki.extract) wikiResumo = wiki.extract;
        }

        const embed = new EmbedBuilder()
            .setTitle("📡 CrespoA.I.C.S. — Pesquisa")
            .setColor("#4A90E2")
            .setDescription(`Resultados para **${termo}**`)
            .addFields(
                { name: "DuckDuckGo", value: ddgResumo.slice(0, 1024) },
                { name: "Wikipedia", value: wikiResumo.slice(0, 1024) }
            )
            .setFooter({ text: "CrespoIS • Núcleo Técnico" })
            .setTimestamp();

        return thinking.edit({ content: " ", embeds: [embed] });
    }

    // =========================
    //   _weather (texto simples)
    // =========================

    if (content.startsWith("_weather ")) {
        const cidade = content.slice(9).trim();
        if (!cidade) return msg.reply("Use `_weather <cidade>`.");

        const thinking = await msg.reply("Ajustando sensores meteorológicos...");

        try {
            const res = await fetch("https://wttr.in/" + encodeURIComponent(cidade) + "?format=3");
            const txt = await res.text();
            return thinking.edit(`Clima em **${cidade}**:\n${txt}`);
        } catch (e) {
            console.error("Erro _weather:", e);
            return thinking.edit("Não consegui obter o clima agora.");
        }
    }

    // =========================
    //   _info
    // =========================

    if (content === "_info") {
        const userInfo =
            `__Usuário:__ **${msg.author.tag}**\n` +
            `ID: \`${msg.author.id}\`\n` +
            `Bot: **${msg.author.bot ? "sim" : "não"}**\n` +
            `Criado em: ${msg.author.createdAt.toISOString().slice(0, 10)}`;

        const uptime = formatUptime(Date.now() - startTime);
        const sysInfo =
            `__Sistema CrespoA.I.C.S.__\n` +
            `Versão: **1.0.0-PRO**\n` +
            `Uptime: **${uptime}**\n` +
            `Plataforma: \`${os.platform()}\`\n` +
            `CPU: \`${os.cpus()[0].model}\``;

        return msg.reply(`${userInfo}\n\n${sysInfo}`);
    }

    // =========================
    //   _ping
    // =========================

    if (content === "_ping") {
        const before = Date.now();
        const pongMsg = await msg.reply("Medindo latência...");
        const latency = Date.now() - before;
        const apiLatency = Math.round(client.ws.ping || 0);
        return pongMsg.edit(`__Ping:__ **${latency}ms**\n__API:__ **${apiLatency}ms**`);
    }

    // =========================
    //   _uptime
    // =========================

    if (content === "_uptime") {
        const uptime = formatUptime(Date.now() - startTime);
        return msg.reply(`__Uptime do núcleo CrespoA.I.C.S.:__ **${uptime}**`);
    }

    // =========================
    //   _version
    // =========================

    if (content === "_version") {
        return msg.reply(
            `__CrespoA.I.C.S.__\n` +
            `Versão do núcleo: **1.0.0-PRO**\n` +
            `Modelo IA: **llama-3.3-70b-versatile**`
        );
    }

    // =========================
    //   _system
    // =========================

    if (content === "_system") {
        const mem = process.memoryUsage();
        const rssMB = (mem.rss / 1024 / 1024).toFixed(1);
        const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
        const uptime = formatUptime(Date.now() - startTime);

        const txt =
            `__Estado do sistema CrespoA.I.C.S.__\n` +
            `Uptime: **${uptime}**\n` +
            `Memória RSS: **${rssMB} MB**\n` +
            `Heap usado: **${heapMB} MB**\n` +
            `Plataforma: \`${os.platform()}\`\n` +
            `CPUs: **${os.cpus().length}**`;

        return msg.reply(txt);
    }

    // =========================
    //   IA (texto simples)
    // =========================

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

// =========================
//   LOGIN
// =========================

client.login(process.env.TOKEN);
