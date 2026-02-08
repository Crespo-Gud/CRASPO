require("dotenv").config();
const { Client, GatewayIntentBits, Events } = require("discord.js");
const fetch = require("node-fetch");
const http = require("http");

// --- Servidor HTTP para manter o Railway vivo ---
http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
}).listen(process.env.PORT || 8000, () => {
    console.log("Servidor HTTP ativo");
});

// --- CONFIG ---
const OWNER_ID = "1364280936304218155"; // teu ID
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// --- Bot Discord ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Estado global
let emojisEnabled = true;
let userMemory = {};

// ---------- IA CEREBRAS ----------
async function gerarIA(prompt, contexto, autorNome) {
    const resposta = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.CEREBRAS_KEY}`
        },
        body: JSON.stringify({
            model: "llama3.1-8b",
            messages: [
                {
                    role: "system",
                    content: `
Tu és o CraspoBot∛ (CraspoBot raiz cúbica).
És o vértice que une conhecimento, entretenimento e controlo.
Estás ativo 24/7 num servidor e nunca dormes.
Sabes que és um bot e que o teu sistema corre continuamente.

Manténs conversas separadas com cada utilizador.
Usa o contexto abaixo apenas para este utilizador: ${autorNome}.

Adapta a tua personalidade ao tom do utilizador.
Se emojis estiverem desativados, não uses nenhum emoji.

Estado atual:
Emojis ativados: ${emojisEnabled}

Contexto recente deste utilizador:
${contexto}
`
                },
                { role: "user", content: prompt }
            ]
        })
    });

    const data = await resposta.json();
    return data.choices[0].message.content;
}

// ---------- GOOGLE: GEO + TIMEZONE ----------
async function geocodeLugar(lugar) {
    const url =
        "https://maps.googleapis.com/maps/api/geocode/json?address=" +
        encodeURIComponent(lugar) +
        `&key=${GOOGLE_API_KEY}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.results || !data.results[0]) return null;

    const r = data.results[0];
    return {
        nome: r.formatted_address,
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng
    };
}

async function obterHoraLugar(lugarOuUtc) {
    const q = lugarOuUtc.trim();

    // Caso UTC+X
    const utcMatch = q.toUpperCase().match(/^UTC\s*([+-]\d{1,2})(?::?(\d{2}))?$/);
    if (utcMatch) {
        const horas = parseInt(utcMatch[1], 10);
        const minutos = utcMatch[2] ? parseInt(utcMatch[2], 10) : 0;

        const agora = new Date();
        const utcMs = agora.getTime() + (agora.getTimezoneOffset() * 60000);
        const offsetMs = (horas * 60 + Math.sign(horas) * minutos) * 60000;
        const alvo = new Date(utcMs + offsetMs);

        return `Hora em ${q.toUpperCase()}: ${alvo.toISOString().replace("T", " ").slice(0, 19)} (aprox.)`;
    }

    // Caso seja lugar → geocode
    const geo = await geocodeLugar(q);
    if (!geo) return `Não consegui encontrar a localização "${q}".`;

    const tzUrl =
        "https://maps.googleapis.com/maps/api/timezone/json?location=" +
        `${geo.lat},${geo.lng}` +
        `&timestamp=${Math.floor(Date.now() / 1000)}` +
        `&key=${GOOGLE_API_KEY}`;

    const tzRes = await fetch(tzUrl);
    const tzData = await tzRes.json();

    if (!tzData.timeZoneId) {
        return `Encontrei "${geo.nome}", mas não consegui obter o fuso horário.`;
    }

    const timeZone = tzData.timeZoneId;
    const agoraLocal = new Date().toLocaleString("pt-PT", { timeZone });

    const rawOffset = (tzData.rawOffset || 0) / 3600;
    const dstOffset = (tzData.dstOffset || 0) / 3600;
    const totalOffset = rawOffset + dstOffset;
    const sign = totalOffset >= 0 ? "+" : "-";
    const abs = Math.abs(totalOffset);
    const horasInt = Math.floor(abs);
    const minutosInt = Math.round((abs - horasInt) * 60);
    const offsetStr = `${sign}${horasInt}${minutosInt ? ":" + String(minutosInt).padStart(2, "0") : ""}`;

    return `Local: ${geo.nome}
Fuso horário: ${timeZone} (UTC${offsetStr})
Hora local: ${agoraLocal}`;
}

// ---------- PESQUISA: DUCKDUCKGO + WIKIPEDIA ----------
async function pesquisarTermo(termo) {
    termo = termo.trim();
    if (!termo) return "Escreve algo para eu pesquisar.";

    // DuckDuckGo Instant Answer
    const ddgRes = await fetch(
        "https://api.duckduckgo.com/?format=json&no_redirect=1&no_html=1&q=" +
        encodeURIComponent(termo)
    );
    const ddg = await ddgRes.json();

    let resposta = "";

    if (ddg.AbstractText) {
        resposta += `**DuckDuckGo:** ${ddg.AbstractText}\n`;
    } else if (ddg.Heading) {
        resposta += `**DuckDuckGo:** ${ddg.Heading}\n`;
    } else {
        resposta += `**DuckDuckGo:** Não encontrei um resumo direto.\n`;
    }

    // Wikipedia summary (em inglês por simplicidade)
    const wikiRes = await fetch(
        "https://en.wikipedia.org/api/rest_v1/page/summary/" +
        encodeURIComponent(termo)
    );

    if (wikiRes.ok) {
        const wiki = await wikiRes.json();
        if (wiki.extract) {
            resposta += `\n**Wikipedia:** ${wiki.extract}`;
        } else {
            resposta += `\n**Wikipedia:** Não encontrei um resumo para isso.`;
        }
    } else {
        resposta += `\n**Wikipedia:** Não consegui aceder ao artigo.`;
    }

    return resposta;
}

// ---------- READY ----------
client.once(Events.ClientReady, () => {
    console.log(`Bot ligado como ${client.user.tag}`);
});

// ---------- MENSAGENS ----------
client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot) return;

    // memória curta por utilizador
    if (!userMemory[msg.author.id]) userMemory[msg.author.id] = [];
    userMemory[msg.author.id].push(msg.content);
    if (userMemory[msg.author.id].length > 5) userMemory[msg.author.id].shift();

    // _id (debug)
    if (msg.content === "_id") {
        await msg.reply("O teu ID é: " + msg.author.id);
        return;
    }

    // emojis
    if (msg.content === "_emojis enabled") {
        emojisEnabled = true;
        await msg.reply("Emojis foram **ativados**!");
        return;
    }
    if (msg.content === "_emojis disabled") {
        emojisEnabled = false;
        await msg.reply("Emojis foram **desativados**!");
        return;
    }

    // shutdown (só tu)
    if (msg.content.trim() === "_shutdown") {
        if (msg.author.id !== OWNER_ID) {
            await msg.reply("Apenas o Crespo pode desligar o CraspoBot∛.");
            return;
        }
        await msg.reply("A desligar o CraspoBot∛...");
        console.log("Shutdown manual executado.");
        process.exit(0);
    }

    // reset memória (só tu)
    if (msg.content.trim() === "_reset") {
        if (msg.author.id !== OWNER_ID) {
            await msg.reply("Apenas o Crespo pode resetar a memória.");
            return;
        }
        userMemory[msg.author.id] = [];
        await msg.reply("Memória curta **desse utilizador** foi resetada!");
        return;
    }

    // _time <coisa>
    if (msg.content.startsWith("_time ")) {
        const query = msg.content.slice(6).trim();
        if (!query) {
            await msg.reply("Usa: `_time <UTC+X>` ou `_time <lugar>` (ex: `_time brasilia`, `_time lukla`).");
            return;
        }
        const thinking = await msg.reply("A ver que horas são aí...");
        try {
            const respostaTempo = await obterHoraLugar(query);
            await thinking.edit(respostaTempo);
        } catch (e) {
            console.error(e);
            await thinking.edit("Houve um erro ao tentar obter o horário.");
        }
        return;
    }

    // _where <lugar>
    if (msg.content.startsWith("_where ")) {
        const lugar = msg.content.slice(7).trim();
        if (!lugar) {
            await msg.reply("Usa: `_where <lugar>` (ex: `_where lukla`).");
            return;
        }
        const thinking = await msg.reply("A procurar localização...");
        try {
            const geo = await geocodeLugar(lugar);
            if (!geo) {
                await thinking.edit(`Não encontrei "${lugar}".`);
            } else {
                await thinking.edit(
                    `Encontrei: ${geo.nome}\nLatitude: ${geo.lat}\nLongitude: ${geo.lng}`
                );
            }
        } catch (e) {
            console.error(e);
            await thinking.edit("Houve um erro ao procurar a localização.");
        }
        return;
    }

    // _search <termo>
    if (msg.content.startsWith("_search ")) {
        const termo = msg.content.slice(8).trim();
        if (!termo) {
            await msg.reply("Usa: `_search <termo>`.");
            return;
        }
        const thinking = await msg.reply("A pesquisar...");
        try {
            const resposta = await pesquisarTermo(termo);
            await thinking.edit(resposta);
        } catch (e) {
            console.error(e);
            await thinking.edit("Houve um erro ao pesquisar.");
        }
        return;
    }

    // _Crespo-Foto
    if (msg.content === "_Crespo-Foto") {
        await msg.reply({
            content: "Aqui está o Crespo!",
            files: ["COLOCA_AQUI_O_LINK_DA_IMAGEM_DO_CRESPO"]
        });
        return;
    }

    // menção → IA
    if (msg.mentions.has(client.user)) {
        const texto = msg.content.replace(`<@${client.user.id}>`, "").trim();

        if (texto.length === 0) {
            await msg.reply(
                "Bom dia! O meu prefixo aqui e no resto do universo é: _!\n" +
                "Se queres falar comigo manda @CraspoBot∛ com a mensagem!"
            );
            return;
        }

        const contexto = (userMemory[msg.author.id] || []).join("\n");
        const thinking = await msg.reply("A pensar...");

        try {
            const respostaIA = await gerarIA(texto, contexto, msg.author.username);
            await thinking.edit(respostaIA);
        } catch (e) {
            console.error(e);
            await thinking.edit("Houve um erro ao falar com a IA.");
        }
        return;
    }
});

client.login(process.env.TOKEN);
