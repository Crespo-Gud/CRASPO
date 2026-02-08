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

// --- Bot Discord ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Estado global para emojis
let emojisEnabled = true;

// Memória curta: últimas 5 mensagens por canal
let shortMemory = {};

// Função para gerar resposta com IA Cerebras (com contexto)
async function gerarIA(prompt, contexto) {
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
Tu és o CraspoBot∛, um assistente inteligente, educado e formal por padrão.
Falas de forma clara, lógica e com raciocínio forte.

Adapta a tua personalidade ao tom do utilizador:
- Se o utilizador falar de forma normal → responde formal.
- Se o utilizador usar um tom leve e brincalhão → responde com leveza e humor.
- Se o utilizador pedir um pouco de loucura → responde com caos moderado.
- Se o utilizador pedir MUITA loucura → responde de forma extremamente caótica, energética e exagerada.
- Ajusta o nível de loucura proporcionalmente à intensidade, emoção e escolha de palavras do utilizador.

Regras:
- Se emojis estiverem desativados, não uses nenhum emoji.
- Depois de momentos de loucura, volta gradualmente ao tom formal.

Estado atual:
Emojis ativados: ${emojisEnabled}

Contexto recente da conversa:
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

client.once(Events.ClientReady, () => {
    console.log(`Bot ligado como ${client.user.tag}`);
});
client.on(Events.MessageCreate, async (msg) => {
    if (msg.author.bot) return;

    // --- MEMÓRIA CURTA (últimas 5 mensagens por canal) ---
    if (!shortMemory[msg.channel.id]) {
        shortMemory[msg.channel.id] = [];
    }

    shortMemory[msg.channel.id].push(`${msg.author.username}: ${msg.content}`);

    if (shortMemory[msg.channel.id].length > 5) {
        shortMemory[msg.channel.id].shift(); // remove a mais antiga
    }

    // ---------------------------
    // COMANDO: _emojis enabled / disabled
    // ---------------------------
    if (msg.content === "_emojis enabled") {
        emojisEnabled = true;
        msg.reply("Emojis foram **ativados**!");
        return;
    }

    if (msg.content === "_emojis disabled") {
        emojisEnabled = false;
        msg.reply("Emojis foram **desativados**!");
        return;
    }

    // ---------------------------
    // MENÇÃO → IA
    // ---------------------------
    if (msg.mentions.has(client.user)) {
        const texto = msg.content.replace(`<@${client.user.id}>`, "").trim();

        // Se só mencionaram o bot
        if (texto.length === 0) {
            msg.reply(
                "Bom dia! O meu prefixo aqui e no resto do universo é: _!\n" +
                "Se queres falar comigo manda @Craspo∛ com a mensagem!"
            );
            return;
        }

        // --- CONTEXTO DA MEMÓRIA CURTA ---
        const contexto = (shortMemory[msg.channel.id] || []).join("\n");

        // Mensagem "A pensar..." editável
        const thinking = await msg.reply("A pensar...");

        // Gerar resposta com contexto
        const respostaIA = await gerarIA(texto, contexto);

        // Editar a mensagem
        thinking.edit(respostaIA);
        return;
    }

    // ---------------------------
    // COMANDO: _Crespo-Foto
    // ---------------------------
    if (msg.content === "_Crespo-Foto") {
        msg.reply({
            content: "Aqui está o Crespo!",
            files: ["COLOCA_AQUI_O_LINK_DA_IMAGEM_DO_CRESPO"]
        });
        return;
    }
});

client.login(process.env.TOKEN);


