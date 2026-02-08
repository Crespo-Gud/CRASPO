require("dotenv").config();
const { Client, GatewayIntentBits, Events } = require("discord.js");
const fetch = require("node-fetch");
const http = require("http");

// --- Servidor HTTP para manter o Koyeb vivo ---
http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
}).listen(8000, () => {
    console.log("Servidor HTTP ativo na porta 8000");
});

// --- Bot Discord ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Função para gerar resposta com IA Cerebras
async function gerarIA(prompt) {
    const resposta = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.CEREBRAS_KEY}`
        },
        body: JSON.stringify({
            model: "llama3.1-8b",
            messages: [
                { role: "system", content: "Tu és o Craspo, um cão maluco, brincalhão, caótico e engraçado. Responde sempre de forma divertida." },
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

    // MENÇÃO → IA
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

        // Se mencionaram com texto → IA responde
        msg.channel.send("A pensar...");
        const respostaIA = await gerarIA(texto);
        msg.reply(respostaIA);
        return;
    }

    // Comando _Crespo
    if (msg.content === "_Crespo") {
        msg.reply({
            content: "Aqui está o Crespo!",
            files: ["COLOCA_AQUI_O_LINK_DA_IMAGEM_DO_CRESPO"]
        });
        return;
    }
});

client.login(process.env.TOKEN);
