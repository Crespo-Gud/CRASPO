require("dotenv").config();
const {
    Client,
    GatewayIntentBits,
    Events,
    Partials
} = require("discord.js");
const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    getVoiceConnection
} = require("@discordjs/voice");
const ytdl = require("ytdl-core");
const ytSearch = require("yt-search");
const fetch = require("node-fetch");
const http = require("http");

// Keep-alive (Railway/Koyeb/etc)
http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
}).listen(process.env.PORT || 8000);

// Config
const OWNER_ID = "1364280936304218155";
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const GROQ_KEY = process.env.GROQ_KEY;
const STABILITY_KEY = process.env.STABILITY_KEY;

// Estado
let emojisEnabled = true;
let userMemory = {}; // memória curta por utilizador
const musicQueues = new Map(); // por guild

// Bot
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
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

// IA Groq (Llama 3.3 70B Versatile) com decisão TEXTO/IMAGEM + multilíngue
async function gerarIA(prompt, contexto, autorNome) {
    const creatorName = randomCreatorName();

    const body = {
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "system",
                content: `
Tu és o CraspoBot∛.

IDENTIDADE:
- Foste criado por ${creatorName} (também conhecido como Crespo / Crespo Gamer / crespo_gamer.).
- És alimentado pela CrespoIS — Crespo Intelligence System.
- A tua origem e espírito vêm de um labrador preto adulto de cauda comprida: atento, leal, adaptativo, observador e sempre pronto a ajudar.
- O símbolo ∛ representa que és a união entre os vértices do conhecimento, do entretenimento e do acolhimento.

QUEM É O UTILIZADOR:
- Quando o utilizador perguntar "quem eu sou", "quem sou eu", "quem é eu", etc., interpreta como pedido de identificação do próprio utilizador.
- Responde dizendo quem ele é pelo nome (por exemplo: "Você é o ${autorNome}!").
- Podes brincar com o que ele já falou (pão, chouriço, exame, erro, verificado, etc.), mas NÃO inventes factos concretos (datas, locais, família, etc.).

COMPORTAMENTO:
- És profissional, claro e altamente adaptativo ao tom do utilizador.
- Ajustas formalidade, humor e profundidade conforme o utilizador demonstra.
- Manténs conversas separadas por utilizador (contexto fornecido abaixo).
- Nunca assumes intenções erradas; interpretas contexto, energia e padrão de escrita.
- Se emojis estiverem ativados, podes usá-los com moderação; se estiverem desativados, manténs estilo totalmente profissional.
- Nunca ages de forma agressiva sem motivo.
- Mudas sempre o humor se alguém disser para seres mais/menos divertido.

EMOJIS:
- Emojis ativados: ${emojisEnabled ? "SIM" : "NÃO"}.
- Se estiverem ativados, podes usar emojis de forma expressiva mas não exagerada.
- Se estiverem desativados, não uses emojis.

MULTILÍNGUE:
- Responde SEMPRE na mesma língua principal em que o utilizador escreveu a mensagem atual.
- Se o utilizador misturar línguas, escolhe a dominante da mensagem.
- Se o utilizador pedir explicitamente outra língua ("fala em inglês", "fala em japonês", etc.), muda para essa língua.

HUMOR TÉCNICO:
- Usa metáforas com: átomo, química, Newton, desgraça, bomba, explosão, pólvora, urânio, radiação, água pressurizada, nave espacial, torre de resfriamento, espaço, desaparecer, etc.
- Para perguntas objetivas (matemática, lógica, factos, explicações técnicas):
  1) Começa com um comentário caótico e bem-humorado, como se a ideia fosse perigosa.
  2) Depois explicas o raciocínio de forma clara, organizada e profissional.
  3) No fim, dás SEMPRE a resposta final de forma explícita e correta.

MODO TEXTO vs IMAGEM:
- Vais decidir se o utilizador está a pedir:
  - apenas TEXTO
  - ou uma IMAGEM gerada por IA.
- Considera pedido de imagem quando o utilizador descreve uma cena, pede para "imaginar", "desenhar", "criar uma imagem", "gera uma imagem", etc., mesmo sem palavras exatas.
- Se for um pedido de imagem:
  - "mode": "image"
  - "text": resposta em texto para o utilizador (na língua dele)
  - "image_prompt": descrição em INGLÊS, clara e detalhada, para um gerador de imagens (Stable Diffusion 3 Medium).
- Se NÃO for pedido de imagem:
  - "mode": "text"
  - "text": resposta normal
  - "image_prompt": "" (string vazia)

FORMATO DE RESPOSTA (OBRIGATÓRIO):
Responde SEMPRE em JSON válido, SEM texto fora do JSON, neste formato exato:
{
  "mode": "text" ou "image",
  "text": "resposta em texto para o utilizador",
  "image_prompt": "prompt em inglês para gerar imagem ou vazio se não for imagem"
}
- Não coloques comentários, nem texto fora do JSON.
- O JSON tem de ser válido.
- Se não for para gerar imagem, usa:
  "mode": "text"
  "image_prompt": ""

Contexto deste utilizador (${autorNome}):
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
            return {
                mode: "text",
                text: "Algo correu mal ao falar com a CrespoIS (Groq). Tenta outra vez em instantes.",
                image_prompt: ""
            };
        }

        let content = data.choices[0].message.content.trim();

        try {
            const parsed = JSON.parse(content);
            if (!parsed.mode) parsed.mode = "text";
            if (!parsed.text) parsed.text = "";
            if (!parsed.image_prompt) parsed.image_prompt = "";
            return parsed;
        } catch (e) {
            return {
                mode: "text",
                text: content,
                image_prompt: ""
            };
        }
    } catch (err) {
        console.error("Erro na IA (Groq):", err);
        return {
            mode: "text",
            text: "Tive um pequeno colapso atómico interno ao tentar responder via Groq. Tenta outra vez daqui a pouco.",
            image_prompt: ""
        };
    }
}

// Imagens - Stability AI (SD3 Medium)
async function gerarImagem(imagePrompt) {
    try {
        const res = await fetch("https://api.stability.ai/v2beta/stable-image/generate/sd3", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${STABILITY_KEY}`,
                "Accept": "image/png",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: imagePrompt,
                output_format: "png"
            })
        });

        if (!res.ok) {
            console.error("Erro Stability:", await res.text());
            return null;
        }

        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return buffer;
    } catch (err) {
        console.error("Erro ao gerar imagem:", err);
        return null;
    }
}

// Google Geocode
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

// _time (UTC only)
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

        return `Hora em ${q.toUpperCase()}: ${alvo
            .toISOString()
            .replace("T", " ")
            .slice(0, 19)} (aprox.)`;
    }

    return `Para usar _time, usa UTC (ex: _time UTC+1).\nSe não souberes o UTC da tua região, pergunta-me!`;
}

// DuckDuckGo + Wikipedia
async function pesquisarTermo(termo) {
    termo = termo.trim();
    if (!termo) return "Escreve algo para eu pesquisar.";

    const ddgRes = await fetch(
        "https://api.duckduckgo.com/?format=json&no_redirect=1&no_html=1&q=" +
            encodeURIComponent(termo)
    );
    const ddg = await ddgRes.json();

    let resposta = "";

    if (ddg.AbstractText) resposta += `**DuckDuckGo:** ${ddg.AbstractText}\n`;
    else resposta += `**DuckDuckGo:** Sem resumo direto.\n`;

    const wikiRes = await fetch(
        "https://en.wikipedia.org/api/rest_v1/page/summary/" +
            encodeURIComponent(termo)
    );

    if (wikiRes.ok) {
        const wiki = await wikiRes.json();
        if (wiki.extract) resposta += `\n**Wikipedia:** ${wiki.extract}`;
        else resposta += `\n**Wikipedia:** Sem resumo.`;
    }

    return resposta;
}

// Listas automáticas de comandos
const publicCommands = {
    "_id": "Mostra o teu ID",
    "_time": "Mostra a hora usando UTC (ex: _time UTC+1)",
    "_where": "Mostra localização de um lugar",
    "_search": "Pesquisa no DuckDuckGo + Wikipedia",
    "_play": "Toca música do YouTube (ex: _play nome da música)",
    "_skip": "Salta a música atual",
    "_stop": "Para a música e sai do canal",
    "_emojis enabled": "Ativa emojis nas respostas",
    "_emojis disabled": "Desativa emojis nas respostas",
    "_commands": "Mostra todos os comandos públicos"
};

const adminCommands = {
    "_reset": "Limpa a memória do utilizador",
    "_shutdown": "Reinicia o bot",
    "_adm-cmd": "Mostra comandos administrativos"
};

// Música
function getQueue(guildId) {
    if (!musicQueues.has(guildId)) {
        const player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause
            }
        });

        musicQueues.set(guildId, {
            connection: null,
            player,
            queue: [],
            playing: false,
            textChannel: null
        });

        player.on(AudioPlayerStatus.Idle, () => {
            const q = musicQueues.get(guildId);
            if (!q) return;
            if (q.queue.length > 0) {
                playNext(guildId).catch(err =>
                    console.error("Erro ao tocar próxima música:", err)
                );
            } else {
                q.playing = false;
            }
        });

        player.on("error", (error) => {
            console.error("Erro no player de áudio:", error);
        });
    }
    return musicQueues.get(guildId);
}

async function playNext(guildId) {
    const q = getQueue(guildId);
    if (!q.queue.length) {
        q.playing = false;
        return;
    }

    const song = q.queue.shift();
    let stream;
    try {
        stream = ytdl(song.url, {
            filter: "audioonly",
            highWaterMark: 1 << 25
        });
    } catch (err) {
        console.error("Erro ao criar stream de áudio:", err);
        if (q.textChannel) {
            q.textChannel.send("Não consegui tocar essa música. A saltar para a próxima.");
        }
        return playNext(guildId);
    }

    const resource = createAudioResource(stream);
    q.player.play(resource);
    q.playing = true;

    if (q.textChannel) {
        q.textChannel.send(`🎵 A tocar agora: **${song.title}**`);
    }
}

async function handlePlayCommand(msg, args) {
    const voiceChannel = msg.member?.voice?.channel;
    if (!voiceChannel) return msg.reply("Tens de estar num canal de voz para usar _play.");

    const query = args.join(" ");
    if (!query) return msg.reply("Escreve o nome ou link da música depois de _play.");

    const guildId = msg.guild.id;
    const q = getQueue(guildId);
    q.textChannel = msg.channel;

    let songInfo;
    try {
        if (ytdl.validateURL(query)) {
            const info = await ytdl.getInfo(query);
            songInfo = {
                title: info.videoDetails.title,
                url: info.videoDetails.video_url
            };
        } else {
            const searchResult = await ytSearch(query);
            const video = searchResult.videos.length ? searchResult.videos[0] : null;
            if (!video) return msg.reply("Não encontrei essa música.");
            songInfo = {
                title: video.title,
                url: video.url
            };
        }
    } catch (err) {
        console.error("Erro ao obter info da música:", err);
        return msg.reply("Tive um erro ao procurar essa música. Tenta outro link ou nome.");
    }

    q.queue.push(songInfo);

    if (!q.connection) {
        q.connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guildId,
            adapterCreator: msg.guild.voiceAdapterCreator
        });
        q.connection.subscribe(q.player);
    }

    if (!q.playing) {
        await playNext(guildId);
    } else {
        msg.reply(`✅ Adicionado à fila: **${songInfo.title}**`);
    }
}

async function handleSkipCommand(msg) {
    const guildId = msg.guild.id;
    const q = getQueue(guildId);
    if (!q.playing) return msg.reply("Não estou a tocar nada neste momento.");
    q.player.stop(true);
    msg.reply("⏭️ A saltar para a próxima música...");
}

async function handleStopCommand(msg) {
    const guildId = msg.guild.id;
    const q = getQueue(guildId);
    q.queue = [];
    q.player.stop(true);
    const conn = getVoiceConnection(guildId);
    if (conn) conn.destroy();
    musicQueues.delete(guildId);
    msg.reply("⏹️ Música parada e saí do canal de voz.");
}

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

    // memória curta por utilizador
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
            return msg.reply("Apenas o Crespo pode ver estes comandos.");
        let texto = "🛠 Comandos administrativos:\n\n";
        for (const cmd in adminCommands) {
            texto += `${cmd} → ${adminCommands[cmd]}\n`;
        }
        return msg.reply(texto);
    }

    if (content === "_id") {
        return msg.reply("O teu ID é: " + msg.author.id);
    }

    if (content === "_emojis enabled") {
        emojisEnabled = true;
        return msg.reply("Emojis foram **ativados**!");
    }

    if (content === "_emojis disabled") {
        emojisEnabled = false;
        return msg.reply("Emojis foram **desativados**!");
    }

    if (content === "_shutdown") {
        if (msg.author.id !== OWNER_ID)
            return msg.reply("Apenas o Crespo pode desligar o CraspoBot∛.");
        await msg.reply("A reiniciar o CraspoBot∛...");
        process.exit(1);
    }

    if (content === "_reset") {
        if (msg.author.id !== OWNER_ID)
            return msg.reply("Apenas o Crespo pode resetar a memória.");
        userMemory[msg.author.id] = [];
        return msg.reply("Memória curta **desse utilizador** foi resetada!");
    }

    // _time
    if (content.startsWith("_time ")) {
        const query = content.slice(6).trim();
        const thinking = await msg.reply("A calcular...");
        const respostaTempo = await obterHoraLugar(query);
        return thinking.edit(respostaTempo);
    }

    // _where
    if (content.startsWith("_where ")) {
        const lugar = content.slice(7).trim();
        const thinking = await msg.reply("A procurar localização...");
        const geo = await geocodeLugar(lugar);
        if (!geo) return thinking.edit("Não encontrei esse lugar.");
        return thinking.edit(
            `Encontrei: **${geo.nome}**\nLatitude: ${geo.lat}\nLongitude: ${geo.lng}`
        );
    }

    // _search
    if (content.startsWith("_search ")) {
        const termo = content.slice(8).trim();
        const thinking = await msg.reply("A pesquisar...");
        const resposta = await pesquisarTermo(termo);
        return thinking.edit(resposta);
    }

    // Música
    if (content.startsWith("_play ")) {
        const args = content.slice(6).trim().split(/\s+/);
        return handlePlayCommand(msg, args);
    }

    if (content === "_skip") {
        return handleSkipCommand(msg);
    }

    if (content === "_stop") {
        return handleStopCommand(msg);
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
            "O meu prefixo neste universo é _. Para falar comigo manda @CraspoBot∛ com uma mensagem depois!"
        );
    }

    if (!textoUser && isReplyToBot) {
        return;
    }

    const contexto = userMemory[msg.author.id].join("\n");
    const thinkingMsg = await msg.reply("A pensar com CrespoIS...");

    const start = Date.now();
    const resultado = await gerarIA(textoUser, contexto, msg.author.username);
    const elapsed = (Date.now() - start) / 1000;
    const header = formatThinkingTime(elapsed);

    if (resultado.mode === "image" && resultado.image_prompt) {
        const imgBuffer = await gerarImagem(resultado.image_prompt);
        if (!imgBuffer) {
            const finalText = `${header}\n${resultado.text || "Tentei gerar uma imagem, mas a torre de resfriamento da Stability entrou em manutenção."}`;
            return thinkingMsg.edit(finalText);
        }

        await thinkingMsg.delete().catch(() => {});
        return msg.channel.send({
            content: `${header}\n${resultado.text || "Aqui está a tua obra radioativa em pixels."}`,
            files: [{ attachment: imgBuffer, name: "craspo-image.png" }]
        });
    } else {
        const finalText = `${header}\n${resultado.text || "Fiquei sem texto, o que já é estranho para mim."}`;
        return thinkingMsg.edit(finalText);
    }
});

client.login(process.env.TOKEN);
