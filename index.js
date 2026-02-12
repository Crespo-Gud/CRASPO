require("dotenv").config();
const {
    Client,
    GatewayIntentBits,
    Events,
    Partials
} = require("discord.js");
const fetch = require("node-fetch");
const http = require("http");

// Keep-alive (Railway/Koyeb/etc)
http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
}).listen(process.env.PORT || 8000);

// Config
const OWNER_ID = "1364280936304218155";
const GROQ_KEY = process.env.GROQ_KEY;

// Estado
let emojisEnabled = true;
let userMemory = {}; // memória curta por utilizador

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

// IA utilitária simples (para _time e _where)
async function askGroqSimple(prompt) {
    const body = {
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "system",
                content: "Responde de forma curta, direta e sem humor extra. Não expliques o raciocínio, só dá o resultado pedido."
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

// IA principal (CraspoBot∛, humor nuclear, multilíngue)
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
- Podes brincar com o que ele já falou, mas NÃO inventes factos concretos (datas, locais, família, etc.).

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

HUMOR TÉCNICO (SEMPRE ATIVO):
- Usa metáforas com: átomo, química, Newton, desgraça, bomba, explosão, pólvora, urânio, radiação, água pressurizada, nave espacial, torre de resfriamento, espaço, desaparecer, etc.
- Para perguntas objetivas (matemática, lógica, factos, explicações técnicas):
  1) Começa com um comentário caótico e bem-humorado, como se a ideia fosse perigosa.
  2) Depois explicas o raciocínio de forma clara, organizada e profissional.
  3) No fim, dás SEMPRE a resposta final de forma explícita e correta.

RESPOSTA:
- Responde em texto normal, sem JSON, sem estruturas especiais.
- O humor nunca pode substituir a resposta. A resposta tem de existir SEMPRE, clara e correta.

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
            return "Algo correu mal ao falar com a CrespoIS (Groq). Tenta outra vez em instantes.";
        }

        return data.choices[0].message.content.trim();
    } catch (err) {
        console.error("Erro na IA (Groq):", err);
        return "Tive um pequeno colapso atómico interno ao tentar responder via Groq. Tenta outra vez daqui a pouco.";
    }
}

// _time (UTC ou cidade via IA)
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

        return `Hora em ${q.toUpperCase()}: ${alvo
            .toISOString()
            .replace("T", " ")
            .slice(0, 19)} (aprox.)`;
    }

    // Caso contrário, usa IA para descobrir o offset UTC da cidade
    const pergunta = `Diz-me apenas o offset UTC atual da localidade "${q}" no formato UTC+H, UTC-H ou UTC+H:MM, sem mais texto.`;
    const resposta = await askGroqSimple(pergunta);

    if (!resposta) {
        return `Não consegui determinar o UTC de "${q}". Tenta usar diretamente algo como _time UTC-3.`;
    }

    const matchIA = resposta.toUpperCase().match(/UTC\s*([+-]\d{1,2})(?::?(\d{2}))?/);
    if (!matchIA) {
        return `Não consegui interpretar o UTC de "${q}" a partir de: ${resposta}\nTenta usar diretamente algo como _time UTC-3.`;
    }

    const horas = parseInt(matchIA[1], 10);
    const minutos = matchIA[2] ? parseInt(matchIA[2], 10) : 0;

    const agora = new Date();
    const utcMs = agora.getTime() + agora.getTimezoneOffset() * 60000;
    const offsetMs = (horas * 60 + Math.sign(horas) * minutos) * 60000;
    const alvo = new Date(utcMs + offsetMs);

    return `Hora aproximada em ${q} (${matchIA[0].toUpperCase()}): ${alvo
        .toISOString()
        .replace("T", " ")
        .slice(0, 19)} (aprox.)`;
}

// _where via IA (nome, país, lat, lon)
async function whereLugar(lugar) {
    const q = lugar.trim();
    if (!q) return "Escreve um lugar depois de _where.";

    const prompt = `
Para o lugar "${q}", responde APENAS neste formato exato, numa única linha:
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

    return `Encontrei: **${nome} (${pais})**\nLatitude: ${lat}\nLongitude: ${lon}`;
}

// DuckDuckGo + Wikipedia para _search
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
    "_time": "Mostra a hora usando UTC ou nome de cidade (ex: _time UTC+1 ou _time Brasília)",
    "_where": "Mostra localização aproximada de um lugar (via IA)",
    "_search": "Pesquisa no DuckDuckGo + Wikipedia",
    "_emojis enabled": "Ativa emojis nas respostas",
    "_emojis disabled": "Desativa emojis nas respostas",
    "_commands": "Mostra todos os comandos públicos"
};

const adminCommands = {
    "_reset": "Limpa a memória do utilizador",
    "_shutdown": "Reinicia o bot",
    "_adm-cmd": "Mostra comandos administrativos"
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
        const resposta = await whereLugar(lugar);
        return thinking.edit(resposta);
    }

    // _search
    if (content.startsWith("_search ")) {
        const termo = content.slice(8).trim();
        const thinking = await msg.reply("A pesquisar...");
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
            "O meu prefixo neste universo é _. Para falar comigo manda @CraspoBot∛ com uma mensagem depois!"
        );
    }

    if (!textoUser && isReplyToBot) {
        // se for reply sem texto, não faz nada
        return;
    }

    const contexto = userMemory[msg.author.id].join("\n");
    const thinkingMsg = await msg.reply("A pensar com CrespoIS...");

    const start = Date.now();
    const respostaIA = await gerarIA(textoUser, contexto, msg.author.username);
    const elapsed = (Date.now() - start) / 1000;
    const header = formatThinkingTime(elapsed);

    const finalText = `${header}\n${respostaIA}`;
    return thinkingMsg.edit(finalText);
});

client.login(process.env.TOKEN);
