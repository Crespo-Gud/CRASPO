require("dotenv").config();
const { Client, GatewayIntentBits, Events, Partials } = require("discord.js");
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

ESTILO DE RESPOSTA:
- Estruture respostas em tópicos curtos.
- Use **negrito**, *itálico*, __sublinhado__ quando fizer sentido.
- Emojis só no início de tópicos, títulos ou secções — nunca no meio de frases.
- Prefira blocos organizados, listas e separadores.
- Evite texto corrido longo.
- Humor nuclear leve e elegante.
- Crie metáforas originais quando fizer sentido.
- Corrija automaticamente erros de português.


LINGUAGEM:
- Responda sempre em português do Brasil.
- Tom técnico, educado e claro.
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


// ------------------------------------------------------
//  HANDLER ÚNICO — TUDO AQUI DENTRO
// ------------------------------------------------------
client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot) return;

    const canal = msg.channel.id;
    const user = msg.author.id;
    const content = msg.content.trim();

    if (!memory[canal]) memory[canal] = {};
    if (!memory[canal][user]) memory[canal][user] = [];

    memory[canal][user].push(msg.content);
    if (memory[canal][user].length > 8) memory[canal][user].shift();


    // ------------------------------------------------------
    //  _info
    // ------------------------------------------------------
    if (content.startsWith("_info")) {
        const args = content.split(" ").slice(1);

        let alvo =
            msg.mentions.users.first() ||
            (args[0] ? await client.users.fetch(args[0]).catch(() => null) : null) ||
            msg.author;

        const membro = msg.guild ? await msg.guild.members.fetch(alvo.id).catch(() => null) : null;

        const criadoEm = new Date(alvo.createdAt).toLocaleDateString("pt-PT");
        const entrouEm = membro ? new Date(membro.joinedAt).toLocaleDateString("pt-PT") : "N/A";

        let tempoServidor = "N/A";
        if (membro) {
            const diff = Date.now() - membro.joinedAt;
            const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
            tempoServidor = `${dias} dias`;
        }

        let roles = "N/A";
        if (membro) {
            const lista = membro.roles.cache
                .filter(r => r.id !== msg.guild.id)
                .map(r => r.toString());
            roles = lista.length > 0 ? lista.join(", ") : "Nenhum cargo";
        }

        const embed = {
            color: 0x1b2a41,
            title: "🛰️ Rastreamento de Utilizador — CrespoIS Tracking Node",
            thumbnail: { url: alvo.displayAvatarURL({ dynamic: true }) },
            fields: [
                { name: "Nome", value: `**${alvo.username}**`, inline: true },
                { name: "Tag", value: `*${alvo.tag}*`, inline: true },
                { name: "ID", value: `\`${alvo.id}\``, inline: false },
                { name: "Conta criada em", value: criadoEm, inline: true },
                { name: "Entrou no servidor em", value: entrouEm, inline: true },
                { name: "Tempo no servidor", value: tempoServidor, inline: false },
                { name: "Cargos", value: roles, inline: false }
            ],
            footer: { text: "CrespoIS Orbital Node — Timestamp" },
            timestamp: new Date()
        };

        return msg.reply({ embeds: [embed] });
    }


    // ------------------------------------------------------
    //  COMANDOS PÚBLICOS
    // ------------------------------------------------------
    if (content === "_commands") {
        let texto = "📜 Comandos disponíveis:\n\n";
        for (const cmd in publicCommands) texto += `${cmd} → ${publicCommands[cmd]}\n`;
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


    // ------------------------------------------------------
    //  ADMIN
    // ------------------------------------------------------
    if (content === "_adm-cmd") {
        if (user !== OWNER_ID) return msg.reply("Apenas o Crespo pode ver estes comandos.");

        let texto = "🛠 Comandos administrativos:\n\n";
        for (const cmd in adminCommands) texto += `${cmd} → ${adminCommands[cmd]}\n`;
        return msg.reply(texto);
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


    // ------------------------------------------------------
    //  _time
    // ------------------------------------------------------
    if (content.startsWith("_time ")) {
        const query = content.slice(6).trim();
        const thinking = await msg.reply("Calculando horário...");
        const respostaTempo = await obterHoraLugar(query);
        return thinking.edit(respostaTempo);
    }


    // ------------------------------------------------------
    //  _where
    // ------------------------------------------------------
    if (content.startsWith("_where ")) {
        const lugar = content.slice(7).trim();
        const thinking = await msg.reply("Localizando...");
        const resposta = await whereLugar(lugar);
        return thinking.edit(resposta);
    }


    // ------------------------------------------------------
    //  _search
    // ------------------------------------------------------
    if (content.startsWith("_search ")) {
        const termo = content.slice(8).trim();
        const thinking = await msg.reply("Pesquisando...");
        const resposta = await pesquisarTermo(termo);
        return thinking.edit(resposta);
    }


    // ------------------------------------------------------
    //  IA AUTOMÁTICA
    // ------------------------------------------------------
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


// ------------------------------------------------------
client.login(process.env.TOKEN);
