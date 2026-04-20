// ======================================================
//  CRESPO A.I.C.S. — INDEX PRO (INSPIRADO NO TEU)
//  BLOCO 1/3 — Setup, IA, Estrutura Base, Ficheiros PRO
// ======================================================

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const http = require("http");
const fetch = require("node-fetch");
const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Events
} = require("discord.js");

// Keep-alive (Railway)
http.createServer((req, res) => res.end("CrespoAICS OK")).listen(3000);

// Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel]
});

// Constantes
const OWNER_ID = process.env.OWNER_ID;
const GROQ_KEY = process.env.GROQ_KEY;

// Estado
let emojisEnabled = true;
const memory = {}; // memória por canal/usuário
const userVisibility = {}; // público/privado por utilizador

// Base de ficheiros
const FILE_BASE = path.join(__dirname, "files");
if (!fs.existsSync(FILE_BASE)) fs.mkdirSync(FILE_BASE);

// ======================================================
//  FUNÇÕES UTILITÁRIAS
// ======================================================

function headerLine(cmd, user) {
    return `⟨${cmd} | ${user} | CrespoA.I.C.S.⟩`;
}

function ensureUserDir(userId) {
    const dir = path.join(FILE_BASE, userId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function listUserFiles(userId) {
    const dir = ensureUserDir(userId);
    return fs.readdirSync(dir);
}

function formatThinkingTime(sec) {
    return `⏱️ Processado em ${sec.toFixed(2)}s`;
}

// ======================================================
//  IA 235 — Núcleo Conversacional
// ======================================================

async function askGroqSimple(prompt) {
    try {
        const body = {
            model: "llama3-8b-8192",
            messages: [{ role: "user", content: prompt }]
        };

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
            || null;
    } catch {
        return null;
    }
}

async function gerarIA(texto, contexto, username) {
    const prompt = `
Você é CrespoA.I.C.S., IA 235, estilo técnico, orbital, preciso.
Usuário: ${username}

Contexto recente:
${contexto}

Mensagem:
${texto}

Responda com clareza, precisão e leve toque de personalidade CrespoA.I.C.S.
`;

    try {
        const body = {
            model: "llama3-8b-8192",
            messages: [{ role: "user", content: prompt }]
        };

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
            || "O núcleo conversacional entrou em oscilação. Tente novamente.";
    } catch {
        return "O reator lógico sofreu uma falha interna ao tentar responder. Tente novamente em instantes.";
    }
}

// ======================================================
//  SISTEMA DE FICHEIROS PRO (PRIVADO/PÚBLICO POR UTILIZADOR)
// ======================================================

// _upload — enviar ficheiro para o bot
async function handleUpload(msg, filename) {
    if (!msg.attachments.size)
        return msg.reply("Envie o comando junto com um ficheiro anexado.");

    const file = msg.attachments.first();
    const dir = ensureUserDir(msg.author.id);
    const dest = path.join(dir, filename);

    const res = await fetch(file.url);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);

    return msg.reply(`${headerLine("_upload", msg.author.username)}\nFicheiro **${filename}** armazenado.`);
}

// _files — lista ficheiros do utilizador
async function handleFiles(msg) {
    const userId = msg.author.id;
    const files = listUserFiles(userId);

    const vis = userVisibility[userId] || "private";

    const embed = new EmbedBuilder()
        .setTitle("📁 CrespoA.I.C.S. — Ficheiros armazenados")
        .setColor(0x00bcd4)
        .setDescription(`Visibilidade atual: **${vis.toUpperCase()}**`)
        .addFields(
            files.length
                ? { name: "Ficheiros", value: files.map(f => `• ${f}`).join("\n") }
                : { name: "Ficheiros", value: "Nenhum ficheiro armazenado." }
        )
        .setFooter({ text: headerLine("_files", msg.author.username) })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("vis_public")
            .setLabel("Tornar Público")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId("vis_private")
            .setLabel("Tornar Privado")
            .setStyle(ButtonStyle.Danger)
    );

    return msg.reply({ embeds: [embed], components: [row] });
}

// _download — envia ficheiro do utilizador
async function handleDownload(msg, filename) {
    const dir = ensureUserDir(msg.author.id);
    const file = path.join(dir, filename);

    if (!fs.existsSync(file))
        return msg.reply("Ficheiro não encontrado.");

    return msg.reply({ files: [file] });
}

// _deletefile — apaga ficheiro
async function handleDelete(msg, filename) {
    const dir = ensureUserDir(msg.author.id);
    const file = path.join(dir, filename);

    if (!fs.existsSync(file))
        return msg.reply("Ficheiro não encontrado.");

    fs.unlinkSync(file);
    return msg.reply(`Ficheiro **${filename}** removido.`);
}

// _sendfile — envia ficheiro público de outro utilizador
async function handleSendFile(msg, targetUser, filename) {
    const vis = userVisibility[targetUser] || "private";
    if (vis !== "public")
        return msg.reply("O utilizador não tornou os ficheiros públicos.");

    const dir = ensureUserDir(targetUser);
    const file = path.join(dir, filename);

    if (!fs.existsSync(file))
        return msg.reply("Ficheiro não encontrado.");

    return msg.reply({ files: [file] });
}

// Botões de visibilidade
client.on(Events.InteractionCreate, async (i) => {
    if (!i.isButton()) return;

    const userId = i.user.id;

    if (i.customId === "vis_public") {
        userVisibility[userId] = "public";
        return i.reply({ content: "Os seus ficheiros agora são **PÚBLICOS**.", ephemeral: true });
    }

    if (i.customId === "vis_private") {
        userVisibility[userId] = "private";
        return i.reply({ content: "Os seus ficheiros agora são **PRIVADOS**.", ephemeral: true });
    }
});
// ======================================================
//  CRESPO A.I.C.S. — INDEX PRO (INSPIRADO NO TEU)
//  BLOCO 2/3 — Comandos PRO (_time, _where, _weather, _info, _search)
// ======================================================

// --------- UTILITÁRIOS DE API PÚBLICA (TIME, WHERE, WEATHER, INFO, SEARCH) ---------

async function obterHoraLugar(local) {
    try {
        const res = await fetch(`https://worldtimeapi.org/api/timezone/${encodeURIComponent(local)}`);
        if (!res.ok) return null;
        const data = await res.json();
        return {
            datetime: data.datetime,
            timezone: data.timezone
        };
    } catch {
        return null;
    }
}

async function obterWhere(ip) {
    try {
        const res = await fetch(`http://ip-api.com/json/${ip}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.status !== "success") return null;
        return {
            country: data.country,
            regionName: data.regionName,
            city: data.city,
            isp: data.isp,
            query: data.query
        };
    } catch {
        return null;
    }
}

async function obterWeather(city) {
    try {
        const key = process.env.OPENWEATHER_KEY;
        if (!key) return null;

        const res = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${key}&units=metric&lang=pt`
        );
        if (!res.ok) return null;
        const data = await res.json();

        return {
            name: data.name,
            temp: data.main.temp,
            feels: data.main.feels_like,
            humidity: data.main.humidity,
            desc: data.weather?.[0]?.description || "sem descrição",
            wind: data.wind?.speed ?? 0
        };
    } catch {
        return null;
    }
}

async function obterInfo(termo) {
    try {
        const res = await fetch(
            `https://pt.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(termo)}`
        );
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.extract) return null;
        return {
            title: data.title,
            extract: data.extract,
            url: data.content_urls?.desktop?.page || null
        };
    } catch {
        return null;
    }
}

async function pesquisarTermo(termo) {
    try {
        const key = process.env.GOOGLE_CSE_KEY;
        const cx = process.env.GOOGLE_CSE_CX;
        if (!key || !cx) return null;

        const res = await fetch(
            `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=${encodeURIComponent(termo)}`
        );
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.items || !data.items.length) return null;

        return data.items.slice(0, 3).map(i => ({
            title: i.title,
            snippet: i.snippet,
            link: i.link
        }));
    } catch {
        return null;
    }
}

// ======================================================
//  EMBEDS PRO PARA COMANDOS
// ======================================================

function embedTime(local, info, user) {
    return new EmbedBuilder()
        .setTitle("🕒 CrespoA.I.C.S. — _time PRO")
        .setColor(0x4caf50)
        .setDescription(`Hora em **${local}**`)
        .addFields(
            { name: "Timezone", value: info.timezone, inline: true },
            { name: "Datetime bruto", value: `\`${info.datetime}\``, inline: false }
        )
        .setFooter({ text: headerLine("_time", user) })
        .setTimestamp();
}

function embedWhere(ip, info, user) {
    return new EmbedBuilder()
        .setTitle("📍 CrespoA.I.C.S. — _where PRO")
        .setColor(0xff9800)
        .setDescription(`Informação para o IP **${ip}**`)
        .addFields(
            { name: "País", value: info.country, inline: true },
            { name: "Região", value: info.regionName, inline: true },
            { name: "Cidade", value: info.city, inline: true },
            { name: "ISP", value: info.isp, inline: false }
        )
        .setFooter({ text: headerLine("_where", user) })
        .setTimestamp();
}

function embedWeather(city, info, user) {
    return new EmbedBuilder()
        .setTitle("⛅ CrespoA.I.C.S. — _weather PRO")
        .setColor(0x03a9f4)
        .setDescription(`Condições em **${info.name || city}**`)
        .addFields(
            { name: "Temperatura", value: `${info.temp}°C (sensação ${info.feels}°C)`, inline: true },
            { name: "Humidade", value: `${info.humidity}%`, inline: true },
            { name: "Vento", value: `${info.wind} m/s`, inline: true },
            { name: "Descrição", value: info.desc, inline: false }
        )
        .setFooter({ text: headerLine("_weather", user) })
        .setTimestamp();
}

function embedInfo(termo, info, user) {
    return new EmbedBuilder()
        .setTitle(`📚 CrespoA.I.C.S. — _info PRO`)
        .setColor(0x9c27b0)
        .setDescription(`Resumo para **${termo}**`)
        .addFields(
            { name: info.title, value: info.extract.slice(0, 1000) + (info.extract.length > 1000 ? "..." : "") }
        )
        .setFooter({ text: headerLine("_info", user) })
        .setTimestamp();
}

function embedSearch(termo, resultados, user) {
    return new EmbedBuilder()
        .setTitle("🔎 CrespoA.I.C.S. — _search PRO")
        .setColor(0x2196f3)
        .setDescription(`Resultados para **${termo}**`)
        .addFields(
            resultados.map(r => ({
                name: r.title,
                value: `${r.snippet}\n[Link](${r.link})`
            }))
        )
        .setFooter({ text: headerLine("_search", user) })
        .setTimestamp();
}

// ======================================================
//  COMANDOS PÚBLICOS E ADMIN
// ======================================================

const publicCommands = [
    "_commands",
    "_time",
    "_where",
    "_weather",
    "_info",
    "_search",
    "_files",
    "_upload",
    "_download",
    "_deletefile",
    "_sendfile"
];

const adminCommands = [
    "_adm-cmd",
    "_id",
    "_emojis",
    "_shutdown",
    "_reset"
];

// ======================================================
//  READY
// ======================================================

client.once("ready", () => {
    console.log(`CrespoA.I.C.S. ligado como ${client.user.tag}`);
});

// ======================================================
//  MESSAGE HANDLER — PARTE 1 (COMANDOS)
//  (IA e fluxo conversacional vêm no BLOCO 3)
// ======================================================

client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;

    const content = msg.content.trim();

    // ----------------- COMANDOS PREFIXADOS -----------------

    if (content.startsWith("_")) {
        const args = content.split(" ");
        const cmd = args[0].toLowerCase();
        const rest = args.slice(1).join(" ");

        // _commands
        if (cmd === "_commands") {
            const embed = new EmbedBuilder()
                .setTitle("📡 CrespoA.I.C.S. — Comandos Públicos")
                .setColor(0x00bcd4)
                .setDescription(publicCommands.map(c => `• \`${c}\``).join("\n"))
                .setFooter({ text: headerLine("_commands", msg.author.username) })
                .setTimestamp();

            return msg.reply({ embeds: [embed] });
        }

        // _adm-cmd
        if (cmd === "_adm-cmd") {
            if (msg.author.id !== OWNER_ID)
                return msg.reply("Apenas o operador principal pode ver estes comandos.");

            const embed = new EmbedBuilder()
                .setTitle("🛠️ CrespoA.I.C.S. — Comandos Admin")
                .setColor(0xf44336)
                .setDescription(adminCommands.map(c => `• \`${c}\``).join("\n"))
                .setFooter({ text: headerLine("_adm-cmd", msg.author.username) })
                .setTimestamp();

            return msg.reply({ embeds: [embed] });
        }

        // _id
        if (cmd === "_id") {
            if (msg.author.id !== OWNER_ID)
                return msg.reply("Apenas o operador principal pode usar este comando.");

            return msg.reply(`O seu ID é: \`${msg.author.id}\``);
        }

        // _emojis enabled/disabled
        if (cmd === "_emojis") {
            if (msg.author.id !== OWNER_ID)
                return msg.reply("Apenas o operador principal pode usar este comando.");

            const opt = rest.toLowerCase();
            if (opt === "enabled") {
                emojisEnabled = true;
                return msg.reply("Emojis **ativados**.");
            } else if (opt === "disabled") {
                emojisEnabled = false;
                return msg.reply("Emojis **desativados**.");
            } else {
                return msg.reply("Use `_emojis enabled` ou `_emojis disabled`.");
            }
        }

        // _shutdown
        if (cmd === "_shutdown") {
            if (msg.author.id !== OWNER_ID)
                return msg.reply("Apenas o operador principal pode desligar o núcleo.");

            await msg.reply("CrespoA.I.C.S. a encerrar...");
            process.exit(0);
        }

        // _reset (memória)
        if (cmd === "_reset") {
            if (msg.author.id !== OWNER_ID)
                return msg.reply("Apenas o operador principal pode resetar a memória.");

            Object.keys(memory).forEach(k => delete memory[k]);
            return msg.reply("Memória conversacional limpa.");
        }

        // --------- SISTEMA DE FICHEIROS ---------

        if (cmd === "_files") {
            return handleFiles(msg);
        }

        if (cmd === "_upload") {
            const filename = rest || (msg.attachments.first() && msg.attachments.first().name);
            if (!filename) return msg.reply("Use `_upload <nome>` com um ficheiro anexado.");
            return handleUpload(msg, filename);
        }

        if (cmd === "_download") {
            if (!rest) return msg.reply("Use `_download <nome>`.");
            return handleDownload(msg, rest);
        }

        if (cmd === "_deletefile") {
            if (!rest) return msg.reply("Use `_deletefile <nome>`.");
            return handleDelete(msg, rest);
        }

        if (cmd === "_sendfile") {
            const [userId, ...fnameParts] = args.slice(1);
            const filename = fnameParts.join(" ");
            if (!userId || !filename)
                return msg.reply("Use `_sendfile <userId> <nome>`.");

            return handleSendFile(msg, userId, filename);
        }

        // --------- COMANDOS PRO: TIME / WHERE / WEATHER / INFO / SEARCH ---------

        if (cmd === "_time") {
            if (!rest) return msg.reply("Use `_time <timezone>` (ex: `_time Europe/Lisbon`).");
            const info = await obterHoraLugar(rest);
            if (!info) return msg.reply("Não consegui obter a hora para esse local.");
            return msg.reply({ embeds: [embedTime(rest, info, msg.author.username)] });
        }

        if (cmd === "_where") {
            if (!rest) return msg.reply("Use `_where <ip>`.");
            const info = await obterWhere(rest);
            if (!info) return msg.reply("Não consegui obter dados para esse IP.");
            return msg.reply({ embeds: [embedWhere(rest, info, msg.author.username)] });
        }

        if (cmd === "_weather") {
            if (!rest) return msg.reply("Use `_weather <cidade>`.");
            const info = await obterWeather(rest);
            if (!info) return msg.reply("Não consegui obter o estado do tempo.");
            return msg.reply({ embeds: [embedWeather(rest, info, msg.author.username)] });
        }

        if (cmd === "_info") {
            if (!rest) return msg.reply("Use `_info <termo>`.");
            const info = await obterInfo(rest);
            if (!info) return msg.reply("Não encontrei informação relevante.");
            return msg.reply({ embeds: [embedInfo(rest, info, msg.author.username)] });
        }

        if (cmd === "_search") {
            if (!rest) return msg.reply("Use `_search <termo>`.");
            const resultados = await pesquisarTermo(rest);
            if (!resultados) return msg.reply("Não encontrei resultados.");
            return msg.reply({ embeds: [embedSearch(rest, resultados, msg.author.username)] });
        }

        // Comando desconhecido
        return msg.reply("Comando não reconhecido pelo núcleo CrespoA.I.C.S.");
    }

    // ----------------- AQUI COMEÇA A PARTE DE IA / MENÇÕES -----------------
    // (continua no BLOCO 3)
});
// ======================================================
//  CRESPO A.I.C.S. — INDEX PRO (INSPIRADO NO TEU)
//  BLOCO 3/3 — IA Conversacional + Login
// ======================================================

// ----------------- IA / MENÇÕES -----------------

client.on("messageCreate", async (msg) => {
    if (msg.author.bot) return;

    const content = msg.content.trim();

    // Se não for comando e mencionar o bot → IA
    const isMention =
        msg.mentions.has(client.user) ||
        content.toLowerCase().startsWith("crespo") ||
        content.toLowerCase().includes("crespo");

    if (!isMention) return;

    // Criar memória por canal
    if (!memory[msg.channel.id]) memory[msg.channel.id] = [];

    const contexto = memory[msg.channel.id]
        .slice(-6)
        .map(m => `${m.user}: ${m.text}`)
        .join("\n");

    const inicio = Date.now();
    const respostaIA = await gerarIA(content, contexto, msg.author.username);
    const fim = Date.now();

    // Guardar na memória
    memory[msg.channel.id].push({
        user: msg.author.username,
        text: content
    });

    memory[msg.channel.id].push({
        user: "CrespoA.I.C.S.",
        text: respostaIA
    });

    const tempo = (fim - inicio) / 1000;

    const embed = new EmbedBuilder()
        .setTitle("🧠 CrespoA.I.C.S. — Núcleo IA 235")
        .setColor(0x00e5ff)
        .setDescription(respostaIA)
        .setFooter({ text: `${headerLine("IA", msg.author.username)} • ${formatThinkingTime(tempo)}` })
        .setTimestamp();

    return msg.reply({ embeds: [embed] });
});

// ======================================================
//  LOGIN
// ======================================================

client.login(process.env.TOKEN);
