const { Client, GatewayIntentBits } = require("discord.js");
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require("@discordjs/voice");
const ytdl = require("ytdl-core");
const ytSearch = require("yt-search");

require("dotenv").config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.on("ready", () => {
    console.log(`🔥 CraspoBot∛ está online como ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
    if (!message.content.startsWith("!play")) return;
    if (!message.member.voice.channel) {
        return message.reply("Tens de estar num canal de voz para tocar música.");
    }

    const query = message.content.replace("!play", "").trim();
    if (!query) return message.reply("Diz o nome da música ou link do YouTube.");

    let url = query;

    // Se não for link, pesquisar no YouTube
    if (!ytdl.validateURL(query)) {
        const search = await ytSearch(query);
        if (!search || !search.videos.length) {
            return message.reply("Não encontrei essa música.");
        }
        url = search.videos[0].url;
    }

    const stream = ytdl(url, { filter: "audioonly", highWaterMark: 1 << 25 });

    const resource = createAudioResource(stream);
    const player = createAudioPlayer();

    const connection = joinVoiceChannel({
        channelId: message.member.voice.channel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator
    });

    player.play(resource);
    connection.subscribe(player);

    message.reply(`🎶 A tocar: ${url}`);

    player.on(AudioPlayerStatus.Idle, () => {
        connection.destroy();
    });
});

client.login(process.env.TOKEN);
