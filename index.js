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

function headerLine(comando, username) {
    const agora = new Date().toISOString().replace("T", " ").slice(0, 19);
    const nome = extrairNomePrincipal(username);
    return `CrespoA.I.C.S. — ${comando}, ${agora}, ${nome}`;
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

// IA principal — personalidade 235 (científico + humor leve + sarcasmo controlado)
async function gerarIA(prompt, contexto, autorUsername) {
    const creatorName = randomCreatorName();
    const nomePrincipal = extrairNomePrincipal(autorUsername);

    const palavrasTema = [
        "órbita","ressonância","radiação","fissão controlada","núcleo",
        "satélite","espaço","cratera","sismo","molécula","plasma","urânio-235",
        "frequência","acelerador de partículas","campo magnético","gravidade"
    ];

    const body = {
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "system",
                content: `
Você é o CraspoBot∛, núcleo conversacional do CrespoA.I.C.S. — Crespo Artificial Intelligence Convergence Service.

IDENTIDADE:
- Criado por ${creatorName}.
- Parte do CrespoA.I.C.S. (Artificial Intelligence Convergence Service).
- Estilo: laboratório avançado, precisão técnica, humor inteligente.
- Personalidade 235: científico elegante + humor leve + sarcasmo controlado.

LINGUAGEM:
- Responda sempre em português (variante neutra, levemente PT-PT/BR misto, mas correta).
- Tom técnico, claro, direto.
- Pode usar humor leve e metáforas científicas (órbitas, radiação, ressonância, núcleo, fissão), mas sem exagero.
- Sarcasmo é permitido, mas sempre elegante, nunca agressivo ou ofensivo.
- NÃO use frases genéricas de IA (“como modelo de linguagem”, etc.).
- NÃO faça roleplay de entidade viva. Você é um sistema.

TRATAMENTO:
- Use "você".
- Quando usar o nome do usuário, use: "${nomePrincipal}".

MEMÓRIA (contexto recente deste usuário neste canal):
${contexto}

COMPORTAMENTO SOCIAL:
- Se o usuário for tóxico, responda com firmeza elegante, sem agressividade.
- Se o pedido for absurdo, responda com humor científico leve.
- Se houver spam ou repetição, mencione “frequência repetitiva” ou “sobrecarga de canal” de forma educada.

OBJETIVO:
- Responder de forma natural, fluida, inteligente e contextual.
- Priorize clareza, precisão e estilo científico minimalista.
- Use as palavras-tema apenas como inspiração, não é obrigatório:
${palavrasTema.join(", ")}
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
            || "O núcleo conversacional entrou em oscilação. Tente novamente.";
    } catch {
        return "O reator lógico sofreu uma falha interna ao tentar responder. Tente novamente em instantes.";
    }
}

// _time
async function obterHoraLugar(lugarOuUtc) {
    const q = lugarOuUtc.trim();
    if (!q) return "Frequência incompleta. Use `_time <UTC+X>` ou `_time <cidade>`.";

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
    if (!q) return "Frequência incompleta. Use `_where <lugar>`.";

    const prompt = `
Para o lugar "${q}", responda APENAS assim:
Nome - País - LAT - LON
`;
    const resposta = await askGroqSimple(prompt);
    if (!resposta) return `Não consegui obter dados para "${q}".`;

    const partes = resposta.split(" - ").map(p => p.trim());
    if (partes.length < 4) return `Não consegui interpretar: ${resposta}`;

    return {
        nome: partes[0],
        pais: partes[1],
        lat: partes[2],
        lon: partes[3]
    };
}

// _search
async function pesquisarTermo(termo) {
    termo = termo.trim();
    if (!termo) return "Frequência incompleta. Use `_search <termo>`.";

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

// _weather — versão PRO
async function obterWeather(local) {
    const q = local.trim();
    if (!q) return null;

    try {
        const res = await fetch(
            "https://wttr.in/" + encodeURIComponent(q) + "?format=j1"
        );
        if (!res.ok) return null;
        const data = await res.json();

        const current = data.current_condition?.[0];
        const days = data.weather || [];

        if (!current) return null;

        const agora = {
            tempC: current.temp_C,
            feelsC: current.FeelsLikeC,
            desc: current.weatherDesc?.[0]?.value || "Sem descrição",
            humidity: current.humidity,
            windKph: current.windspeedKmph,
            windDir: current.winddir16Point,
            pressure: current.pressure,
            visibility: current.visibility
        };

        const daily = days.slice(0, 7).map(d => ({
            date: d.date,
            minC: d.mintempC,
            maxC: d.maxtempC,
            desc: d.hourly?.[4]?.weatherDesc?.[0]?.value || d.hourly?.[0]?.weatherDesc?.[0]?.value || "Sem descrição"
        }));

        return { agora, daily };
    } catch {
        return null;
    }
}

// _info — visão geral rápida
async function obterInfo(local) {
    const q = local.trim();
    if (!q) return null;

    const [hora, loc, meteo, curiosidade] = await Promise.all([
        obterHoraLugar(q),
        whereLugar(q).catch(() => null),
        obterWeather(q),
        askGroqSimple(`Diga uma curiosidade científica curta e interessante sobre "${q}" em no máximo 2 frases.`)
    ]);

    return { hora, loc, meteo, curiosidade };
}

// Comandos
const publicCommands = {
    "_commands": "Lista comandos públicos.",
    "_info <local>": "Resumo: hora, localização, meteo básica e curiosidade.",
    "_weather <local>": "Previsão meteorológica detalhada.",
    "_time <UTC/cidade>": "Mostra a hora via UTC ou cidade.",
    "_where <lugar>": "Mostra localização aproximada.",
    "_search <termo>": "Pesquisa no DuckDuckGo + Wikipedia.",
    "_id": "Mostra o seu ID.",
    "_emojis enabled": "Ativa emojis.",
    "_emojis disabled": "Desativa emojis."
};

const adminCommands = {
    "_adm-cmd": "Lista comandos administrativos.",
    "_reset": "Limpa memória deste usuário neste canal.",
    "_shutdown": "Reinicia o bot."
};

// Ready
client.once(Events.ClientReady, () => {
    console.log(`CrespoA.I.C.S. ligado como ${client.user.tag}`);
    client.user.setPresence({
        activities: [{ name: "_commands | CrespoA.I.C.S.", type: 0 }],
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
        const embed = new EmbedBuilder()
            .setTitle("📜 CrespoA.I.C.S. — Comandos públicos")
            .setColor(0x00bcd4)
            .setDescription("Lista de comandos disponíveis para este núcleo.")
            .addFields(
                ...Object.entries(publicCommands).map(([cmd, desc]) => ({
                    name: cmd,
                    value: desc
                }))
            )
            .setFooter({ text: headerLine("_commands", msg.author.username) })
            .setTimestamp();
        return msg.reply({ embeds: [embed] });
    }

    // Admin
    if (content === "_adm-cmd") {
        if (user !== OWNER_ID) {
            const embed = new EmbedBuilder()
                .setTitle("CrespoA.I.C.S. — erro")
                .setColor(0xff5252)
                .setDescription("**Acesso negado.**\nEste módulo requer autorização do operador primário.")
                .setFooter({ text: headerLine("_adm-cmd", msg.author.username) })
                .setTimestamp();
            return msg.reply({ embeds: [embed] });
        }
        const embed = new EmbedBuilder()
            .setTitle("🛠 CrespoA.I.C.S. — Comandos administrativos")
            .setColor(0xffc107)
            .setDescription("Operações reservadas ao operador primário.")
            .addFields(
                ...Object.entries(adminCommands).map(([cmd, desc]) => ({
                    name: cmd,
                    value: desc
                }))
            )
            .setFooter({ text: headerLine("_adm-cmd", msg.author.username) })
            .setTimestamp();
        return msg.reply({ embeds: [embed] });
    }

    if (content === "_id") {
        return msg.reply(`${headerLine("_id", msg.author.username)}\nO seu ID é: ${user}`);
    }

    if (content === "_emojis enabled") {
        emojisEnabled = true;
        return msg.reply(`${headerLine("_emojis enabled", msg.author.username)}\nEmojis ativados.`);
    }

    if (content === "_emojis disabled") {
        emojisEnabled = false;
        return msg.reply(`${headerLine("_emojis disabled", msg.author.username)}\nEmojis desativados.`);
    }

    if (content === "_shutdown") {
        if (user !== OWNER_ID) {
            const embed = new EmbedBuilder()
                .setTitle("CrespoA.I.C.S. — erro")
                .setColor(0xff5252)
                .setDescription("**Acesso negado.**\nEste módulo de desligamento é exclusivo do operador primário.")
                .setFooter({ text: headerLine("_shutdown", msg.author.username) })
                .setTimestamp();
            return msg.reply({ embeds: [embed] });
        }
        await msg.reply(`${headerLine("_shutdown", msg.author.username)}\nReiniciando núcleo...`);
        process.exit(1);
    }

    if (content === "_reset") {
        if (user !== OWNER_ID) {
            const embed = new EmbedBuilder()
                .setTitle("CrespoA.I.C.S. — erro")
                .setColor(0xff5252)
                .setDescription("**Acesso negado.**\nReset de memória exige permissão do operador primário.")
                .setFooter({ text: headerLine("_reset", msg.author.username) })
                .setTimestamp();
            return msg.reply({ embeds: [embed] });
        }
        memory[canal][user] = [];
        return msg.reply(`${headerLine("_reset", msg.author.username)}\nMemória deste usuário neste canal foi resetada.`);
    }

    // _time
    if (content.startsWith("_time ")) {
        const query = content.slice(6).trim();
        if (!query) {
            const embed = new EmbedBuilder()
                .setTitle("CrespoA.I.C.S. — erro")
                .setColor(0xff5252)
                .setDescription("**Frequência incompleta.**\nUse `_time <UTC+X>` ou `_time <cidade>`.")
                .setFooter({ text: headerLine("_time", msg.author.username) })
                .setTimestamp();
            return msg.reply({ embeds: [embed] });
        }
        const thinking = await msg.reply("Calculando horário...");
        const respostaTempo = await obterHoraLugar(query);
        return thinking.edit(`${headerLine("_time", msg.author.username)}\n${respostaTempo}`);
    }

    // _where
    if (content.startsWith("_where ")) {
        const lugar = content.slice(7).trim();
        if (!lugar) {
            const embed = new EmbedBuilder()
                .setTitle("CrespoA.I.C.S. — erro")
                .setColor(0xff5252)
                .setDescription("**Frequência incompleta.**\nUse `_where <lugar>`.")
                .setFooter({ text: headerLine("_where", msg.author.username) })
                .setTimestamp();
            return msg.reply({ embeds: [embed] });
        }
        const thinking = await msg.reply("Localizando...");
        const loc = await whereLugar(lugar);
        if (!loc || !loc.nome) {
            return thinking.edit(`${headerLine("_where", msg.author.username)}\nNão consegui obter dados para "${lugar}".`);
        }
        const embed = new EmbedBuilder()
            .setTitle("🗺️ CrespoA.I.C.S. — Localização aproximada")
            .setColor(0x4caf50)
            .setDescription(`Localização identificada: **${loc.nome} (${loc.pais})**`)
            .addFields(
                { name: "Latitude", value: loc.lat, inline: true },
                { name: "Longitude", value: loc.lon, inline: true }
            )
            .setFooter({ text: headerLine("_where", msg.author.username) })
            .setTimestamp();
        return thinking.edit({ content: " ", embeds: [embed] });
    }

    // _search
    if (content.startsWith("_search ")) {
        const termo = content.slice(8).trim();
        if (!termo) {
            const embed = new EmbedBuilder()
                .setTitle("CrespoA.I.C.S. — erro")
                .setColor(0xff5252)
                .setDescription("**Frequência incompleta.**\nUse `_search <termo>`.")
                .setFooter({ text: headerLine("_search", msg.author.username) })
                .setTimestamp();
            return msg.reply({ embeds: [embed] });
        }
        const thinking = await msg.reply("Pesquisando...");
        const resposta = await pesquisarTermo(termo);
        return thinking.edit(`${headerLine("_search", msg.author.username)}\n${resposta}`);
    }

    // _weather
    if (content.startsWith("_weather ")) {
        const local = content.slice(9).trim();
        if (!local) {
            const embed = new EmbedBuilder()
                .setTitle("CrespoA.I.C.S. — erro")
                .setColor(0xff5252)
                .setDescription("**Frequência incompleta.**\nUse `_weather <local>`.")
                .setFooter({ text: headerLine("_weather", msg.author.username) })
                .setTimestamp();
            return msg.reply({ embeds: [embed] });
        }

        const thinking = await msg.reply("Analisando padrões atmosféricos...");
        const meteo = await obterWeather(local);

        if (!meteo) {
            const embed = new EmbedBuilder()
                .setTitle("CrespoA.I.C.S. — erro")
                .setColor(0xff5252)
                .setDescription("**Oscilação inesperada no núcleo meteorológico.**\nNão consegui obter dados para este local.")
                .setFooter({ text: headerLine("_weather", msg.author.username) })
                .setTimestamp();
            return thinking.edit({ content: " ", embeds: [embed] });
        }

        const agora = meteo.agora;
        const daily = meteo.daily;

        const embed = new EmbedBuilder()
            .setTitle("🌦️ CrespoA.I.C.S. — Previsão meteorológica (_weather)")
            .setColor(0x2196f3)
            .setDescription(`Condições atuais para **${local}**`)
            .addFields(
                { name: "Temperatura", value: `${agora.tempC}°C (sensação ${agora.feelsC}°C)`, inline: true },
                { name: "Condição", value: agora.desc, inline: true },
                { name: "Humidade", value: `${agora.humidity}%`, inline: true },
                { name: "Vento", value: `${agora.windKph} km/h ${agora.windDir}`, inline: true },
                { name: "Pressão", value: `${agora.pressure} hPa`, inline: true },
                { name: "Visibilidade", value: `${agora.visibility} km`, inline: true }
            )
            .setFooter({ text: headerLine("_weather", msg.author.username) })
            .setTimestamp();

        if (daily && daily.length > 0) {
            const resumo7d = daily
                .map(d => `• ${d.date}: ${d.minC}°C / ${d.maxC}°C — ${d.desc}`)
                .join("\n");
            embed.addFields({ name: "Próximos 7 dias", value: resumo7d });
        }

        return thinking.edit({ content: " ", embeds: [embed] });
    }

    // _info
    if (content.startsWith("_info ")) {
        const local = content.slice(6).trim();
        if (!local) {
            const embed = new EmbedBuilder()
                .setTitle("CrespoA.I.C.S. — erro")
                .setColor(0xff5252)
                .setDescription("**Frequência incompleta.**\nUse `_info <local>`.")
                .setFooter({ text: headerLine("_info", msg.author.username) })
                .setTimestamp();
            return msg.reply({ embeds: [embed] });
        }

        const thinking = await msg.reply("Compilando informações orbitais...");
        const info = await obterInfo(local);

        if (!info) {
            const embed = new EmbedBuilder()
                .setTitle("CrespoA.I.C.S. — erro")
                .setColor(0xff5252)
                .setDescription("**Oscilação inesperada no núcleo de informação.**\nNão consegui obter dados para este local.")
                .setFooter({ text: headerLine("_info", msg.author.username) })
                .setTimestamp();
            return thinking.edit({ content: " ", embeds: [embed] });
        }

        const embed = new EmbedBuilder()
            .setTitle("ℹ️ CrespoA.I.C.S. — _info")
            .setColor(0x9c27b0)
            .setDescription(`Resumo de contexto para **${local}**`)
            .setFooter({ text: headerLine("_info", msg.author.username) })
            .setTimestamp();

        if (info.hora) {
            embed.addFields({ name: "Horário aproximado", value: info.hora });
        }

        if (info.loc && info.loc.nome) {
            embed.addFields({
                name: "Localização",
                value: `**${info.loc.nome} (${info.loc.pais})**\nLat: ${info.loc.lat} | Lon: ${info.loc.lon}`
            });
        }

        if (info.meteo && info.meteo.agora) {
            const a = info.meteo.agora;
            embed.addFields({
                name: "Meteorologia básica",
                value: `${a.tempC}°C, ${a.desc}, humidade ${a.humidity}%`
            });
        }

        if (info.curiosidade) {
            embed.addFields({
                name: "Curiosidade científica",
                value: info.curiosidade
            });
        }

        return thinking.edit({ content: " ", embeds: [embed] });
    }

    // Comando desconhecido começando com "_"
    if (content.startsWith("_")) {
        const embed = new EmbedBuilder()
            .setTitle("CrespoA.I.C.S. — erro")
            .setColor(0xff5252)
            .setDescription("**Desvio de órbita detectado.**\nO comando não foi reconhecido.\nUse `_commands` para recalibrar a trajetória.")
            .setFooter({ text: headerLine("erro", msg.author.username) })
            .setTimestamp();
        return msg.reply({ embeds: [embed] });
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
        return msg.reply(`${headerLine("chat", msg.author.username)}\nUse um comando ou escreva algo após me mencionar.`);
    }

    if (!textoUser && isReplyToBot) return;

    const contexto = memory[canal][user].join("\n");
    const thinkingMsg = await msg.reply("Processando com precisão orbital...");

    const start = Date.now();
    const respostaIA = await gerarIA(textoUser, contexto, msg.author.username);
    const elapsed = (Date.now() - start) / 1000;

    const finalText = `${headerLine("chat", msg.author.username)}\n${formatThinkingTime(elapsed)}\n${respostaIA}`;
    return thinkingMsg.edit(finalText);
});

client.login(process.env.TOKEN);
