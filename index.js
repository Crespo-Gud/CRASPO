// index.js — CrespoA.I.C.S. PRO (Google + OpenWeather + Wikipedia, tudo em embed)

console.log("VERSÃO:", require("discord.js").version);

require("dotenv").config();
const { Client, GatewayIntentBits, Partials, Events, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");
const os = require("os");

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [
        Partials.Channel,
        Partials.Message
    ]
});

// =========================
//   CONFIG
// =========================

const TOKEN = process.env.TOKEN;
const GROQ_KEY = process.env.GROQ_KEY;
const GOOGLE_KEY = process.env.GOOGLE_KEY;
const OPENWEATHER_KEY = process.env.OPENWEATHER_KEY;

// =========================
//   IA (Groq) — função simples
// =========================

async function askGroqSimple(prompt) {
    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.1-70b-versatile",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.4
            })
        });
        if (!res.ok) {
            console.error("Groq error:", await res.text());
            return null;
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (e) {
        console.error("Groq exception:", e);
        return null;
    }
}

// =========================
//   HELPERS GERAIS
// =========================

function formatUptime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (seconds || parts.length === 0) parts.push(`${seconds}s`);
    return parts.join(" ");
}

function formatCoords(lat, lon) {
    const ns = lat >= 0 ? "N" : "S";
    const ew = lon >= 0 ? "E" : "W";
    return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

function buildMapsLink(lat, lon) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

// =========================
//   GOOGLE: GEOCODING + TIMEZONE
// =========================

async function geocodePlace(query) {
    const url =
        "https://maps.googleapis.com/maps/api/geocode/json?address=" +
        encodeURIComponent(query) +
        `&key=${GOOGLE_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Geocoding HTTP error");
    const data = await res.json();
    if (!data.results || data.results.length === 0) return null;
    const r = data.results[0];
    const loc = r.geometry.location;
    const countryComp = r.address_components.find(c => c.types.includes("country"));
    const country = countryComp ? countryComp.long_name : "Unknown";
    return {
        formatted: r.formatted_address,
        country,
        lat: loc.lat,
        lon: loc.lng
    };
}

async function getTimeZone(lat, lon) {
    const timestamp = Math.floor(Date.now() / 1000);
    const url =
        "https://maps.googleapis.com/maps/api/timezone/json?location=" +
        `${lat},${lon}&timestamp=${timestamp}&key=${GOOGLE_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Timezone HTTP error");
    const data = await res.json();
    if (data.status !== "OK") return null;

    const raw = data.rawOffset || 0;
    const dst = data.dstOffset || 0;
    const totalOffset = raw + dst; // em segundos
    const offsetHours = totalOffset / 3600;

    const sign = offsetHours >= 0 ? "+" : "-";
    const abs = Math.abs(offsetHours);
    const h = Math.floor(abs);
    const m = Math.round((abs - h) * 60);
    const utcStr = `UTC${sign}${h}${m ? ":" + String(m).padStart(2, "0") : ""}`;

    const localMs = Date.now() + totalOffset * 1000 - new Date().getTimezoneOffset() * 60000;
    const localDate = new Date(localMs);
    const localStr = localDate.toISOString().replace("T", " ").slice(0, 19);

    return {
        timeZoneId: data.timeZoneId,
        utc: utcStr,
        localTime: localStr
    };
}

// =========================
//   OPENWEATHER: CLIMA + PREVISÃO
// =========================

async function getWeatherAndForecast(lat, lon, lang = "pt") {
    const url =
        "https://api.openweathermap.org/data/3.0/onecall?lat=" +
        lat +
        "&lon=" +
        lon +
        `&appid=${OPENWEATHER_KEY}&units=metric&lang=${lang}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("OpenWeather HTTP error");
    const data = await res.json();
    if (!data.current || !data.daily) return null;

    const current = data.current;
    const today = data.daily[0];
    const tomorrow = data.daily[1];

    return {
        current: {
            temp: current.temp,
            feels: current.feels_like,
            humidity: current.humidity,
            wind: current.wind_speed,
            desc: current.weather?.[0]?.description || "N/A"
        },
        today: {
            min: today.temp?.min,
            max: today.temp?.max,
            desc: today.weather?.[0]?.description || "N/A"
        },
        tomorrow: tomorrow
            ? {
                  min: tomorrow.temp?.min,
                  max: tomorrow.temp?.max,
                  desc: tomorrow.weather?.[0]?.description || "N/A"
              }
            : null
    };
}

// =========================
//   WIKIPEDIA SUMMARY
// =========================

async function getWikipediaSummary(title) {
    const url =
        "https://en.wikipedia.org/api/rest_v1/page/summary/" +
        encodeURIComponent(title);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return {
        title: data.title,
        extract: data.extract || null,
        url: data.content_urls?.desktop?.page || null,
        thumb: data.thumbnail?.source || null
    };
}

// =========================
//   DISCORD BOT
// =========================

client.once(Events.ClientReady, () => {
    console.log(`CrespoA.I.C.S. online como ${client.user.tag}`);
});

client.on(Events.MessageCreate, async (msg) => {
    try {
        if (msg.author.bot) return;
        if (!msg.content) return;

        const content = msg.content.trim();

        // =========================
        //   IA LIVRE (ex: começa com "cresco" ou algo teu)
        // =========================

        if (content.startsWith("_ia ")) {
            const prompt = content.slice(4).trim();
            if (!prompt) return msg.reply("Escreve algo depois de `_ia`.");
            const thinking = await msg.reply("Processando sinal neural CrespoA.I.C.S....");

            const resposta = await askGroqSimple(prompt);
            if (!resposta) {
                return thinking.edit("Não consegui obter resposta da IA agora.");
            }

            return thinking.edit(resposta);
        }

        // =========================
        //   _search (Wikipedia, embed PRO)
        // =========================

        if (content.startsWith("_search ")) {
            const termo = content.slice(8).trim();
            if (!termo) return msg.reply("Use `_search <termo>`.");

            const thinking = await msg.reply("Consultando bases enciclopédicas...");

            const wiki = await getWikipediaSummary(termo);
            if (!wiki) {
                return thinking.edit("Não encontrei nada relevante na Wikipedia.");
            }

            const embed = new EmbedBuilder()
                .setTitle(`📡 CrespoA.I.C.S. — Pesquisa: ${wiki.title}`)
                .setColor("#4A90E2")
                .setDescription(wiki.extract || "Nenhum resumo disponível.")
                .setFooter({ text: "Fonte: Wikipedia • CrespoIS • Núcleo Técnico" })
                .setTimestamp();

            if (wiki.url) {
                embed.addFields({
                    name: "🔗 Link",
                    value: wiki.url
                });
            }

            if (wiki.thumb) {
                embed.setThumbnail(wiki.thumb);
            }

            return thinking.edit({ content: " ", embeds: [embed] });
        }

        // =========================
        //   _where (embed PRO)
        // =========================

        if (content.startsWith("_where ")) {
            const lugar = content.slice(7).trim();
            if (!lugar) return msg.reply("Use `_where <lugar>`.");

            const thinking = await msg.reply("Localizando coordenadas orbitais...");

            const geo = await geocodePlace(lugar);
            if (!geo) {
                return thinking.edit("Não consegui localizar esse lugar.");
            }

            const coordsStr = formatCoords(geo.lat, geo.lon);
            const mapsLink = buildMapsLink(geo.lat, geo.lon);

            const embed = new EmbedBuilder()
                .setTitle("📡 CrespoA.I.C.S. — Localização")
                .setColor("#4A90E2")
                .setDescription(`Resultado para **${lugar}**`)
                .addFields(
                    { name: "📍 Nome", value: geo.formatted, inline: false },
                    { name: "🌍 País", value: geo.country, inline: true },
                    { name: "🧭 Coordenadas", value: coordsStr, inline: true },
                    { name: "🗺️ Google Maps", value: mapsLink, inline: false }
                )
                .setFooter({ text: "CrespoIS • Núcleo Técnico" })
                .setTimestamp();

            return thinking.edit({ content: " ", embeds: [embed] });
        }

        // =========================
        //   _time (embed PRO)
        // =========================

        if (content.startsWith("_time ")) {
            const lugar = content.slice(6).trim();
            if (!lugar) return msg.reply("Use `_time <lugar>`.");

            const thinking = await msg.reply("Sincronizando relógios orbitais...");

            const geo = await geocodePlace(lugar);
            if (!geo) {
                return thinking.edit("Não consegui localizar esse lugar.");
            }

            const tz = await getTimeZone(geo.lat, geo.lon);
            if (!tz) {
                return thinking.edit("Não consegui obter o fuso horário.");
            }

            const coordsStr = formatCoords(geo.lat, geo.lon);

            const embed = new EmbedBuilder()
                .setTitle("⏱️ CrespoA.I.C.S. — Horário Local")
                .setColor("#4A90E2")
                .setDescription(`Informações de tempo para **${geo.formatted}**`)
                .addFields(
                    { name: "🕒 Hora local", value: tz.localTime, inline: false },
                    { name: "🌐 Fuso horário", value: tz.timeZoneId, inline: true },
                    { name: "🧭 UTC", value: tz.utc, inline: true },
                    { name: "🧭 Coordenadas", value: coordsStr, inline: false }
                )
                .setFooter({ text: "Dados via Google Time Zone API • CrespoIS" })
                .setTimestamp();

            return thinking.edit({ content: " ", embeds: [embed] });
        }

        // =========================
        //   _weather (embed PRO, clima + previsão)
        // =========================

        if (content.startsWith("_weather ")) {
            const lugar = content.slice(9).trim();
            if (!lugar) return msg.reply("Use `_weather <cidade>`.");

            const thinking = await msg.reply("Ajustando sensores meteorológicos...");

            const geo = await geocodePlace(lugar);
            if (!geo) {
                return thinking.edit("Não consegui localizar essa cidade.");
            }

            const meteo = await getWeatherAndForecast(geo.lat, geo.lon, "pt");
            if (!meteo) {
                return thinking.edit("Não consegui obter dados meteorológicos.");
            }

            const coordsStr = formatCoords(geo.lat, geo.lon);
            const mapsLink = buildMapsLink(geo.lat, geo.lon);

            const current = meteo.current;
            const today = meteo.today;
            const tomorrow = meteo.tomorrow;

            let previsaoHoje = `Mín: ${today.min.toFixed(1)}°C • Máx: ${today.max.toFixed(1)}°C\n${today.desc}`;
            let previsaoAmanha = tomorrow
                ? `Mín: ${tomorrow.min.toFixed(1)}°C • Máx: ${tomorrow.max.toFixed(1)}°C\n${tomorrow.desc}`
                : "Sem dados.";

            const embed = new EmbedBuilder()
                .setTitle(`🌦️ CrespoA.I.C.S. — Clima em ${geo.formatted}`)
                .setColor("#4A90E2")
                .addFields(
                    {
                        name: "🌡️ Condições atuais",
                        value:
                            `Temperatura: **${current.temp.toFixed(1)}°C** (sensação **${current.feels.toFixed(1)}°C**)\n` +
                            `Humidade: **${current.humidity}%**\n` +
                            `Vento: **${current.wind} m/s**\n` +
                            `Descrição: **${current.desc}**`
                    },
                    {
                        name: "📅 Hoje",
                        value: previsaoHoje
                    },
                    {
                        name: "📅 Amanhã",
                        value: previsaoAmanha
                    },
                    {
                        name: "🧭 Coordenadas",
                        value: coordsStr,
                        inline: true
                    },
                    {
                        name: "🗺️ Google Maps",
                        value: mapsLink,
                        inline: false
                    }
                )
                .setFooter({ text: "Dados via OpenWeather • CrespoIS • Núcleo Técnico" })
                .setTimestamp();

            return thinking.edit({ content: " ", embeds: [embed] });
        }

        // =========================
        //   _info-pt / _info-en (embed PRO cidade + clima + amanhã + resumo)
        // =========================

        if (content.startsWith("_info-pt ") || content.startsWith("_info-en ")) {
            const isPt = content.startsWith("_info-pt ");
            const lugar = content.slice(isPt ? 9 : 9).trim(); // ambos têm 9 chars
            if (!lugar) {
                return msg.reply(isPt ? "Use `_info-pt <cidade>`." : "Use `_info-en <city>`.");
            }

            const thinking = await msg.reply(
                isPt
                    ? "Compilando dossiê técnico da região..."
                    : "Compiling technical dossier for the region..."
            );

            const geo = await geocodePlace(lugar);
            if (!geo) {
                return thinking.edit(isPt ? "Não consegui localizar essa cidade." : "Could not locate that city.");
            }

            const tz = await getTimeZone(geo.lat, geo.lon);
            const meteo = await getWeatherAndForecast(geo.lat, geo.lon, isPt ? "pt" : "en");
            const wiki = await getWikipediaSummary(geo.formatted);

            const coordsStr = formatCoords(geo.lat, geo.lon);
            const mapsLink = buildMapsLink(geo.lat, geo.lon);

            const title = isPt
                ? `📡 CrespoA.I.C.S. — Info: ${geo.formatted}`
                : `📡 CrespoA.I.C.S. — Info: ${geo.formatted}`;

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setColor("#4A90E2")
                .setFooter({ text: "CrespoIS • Núcleo Técnico" })
                .setTimestamp();

            // Campos base
            embed.addFields(
                {
                    name: isPt ? "📍 Cidade" : "📍 City",
                    value: geo.formatted,
                    inline: false
                },
                {
                    name: isPt ? "🌍 País" : "🌍 Country",
                    value: geo.country,
                    inline: true
                },
                {
                    name: isPt ? "🧭 Coordenadas" : "🧭 Coordinates",
                    value: coordsStr,
                    inline: true
                },
                {
                    name: isPt ? "🗺️ Google Maps" : "🗺️ Google Maps",
                    value: mapsLink,
                    inline: false
                }
            );

            // Tempo / fuso
            if (tz) {
                embed.addFields(
                    {
                        name: isPt ? "⏱️ Hora local" : "⏱️ Local time",
                        value: tz.localTime,
                        inline: false
                    },
                    {
                        name: isPt ? "🌐 Fuso horário" : "🌐 Time zone",
                        value: tz.timeZoneId,
                        inline: true
                    },
                    {
                        name: "🧭 UTC",
                        value: tz.utc,
                        inline: true
                    }
                );
            }

            // Clima atual + previsão de amanhã
            if (meteo) {
                const current = meteo.current;
                const tomorrow = meteo.tomorrow;

                const climaLabel = isPt ? "🌦️ Clima atual" : "🌦️ Current weather";
                const climaValue =
                    (isPt
                        ? `Temperatura: **${current.temp.toFixed(1)}°C** (sensação **${current.feels.toFixed(1)}°C**)\n`
                        : `Temperature: **${current.temp.toFixed(1)}°C** (feels like **${current.feels.toFixed(1)}°C**)\n`) +
                    (isPt
                        ? `Humidade: **${current.humidity}%**\nVento: **${current.wind} m/s**\n`
                        : `Humidity: **${current.humidity}%**\nWind: **${current.wind} m/s**\n`) +
                    (isPt ? `Descrição: **${current.desc}**` : `Description: **${current.desc}**`);

                embed.addFields({
                    name: climaLabel,
                    value: climaValue,
                    inline: false
                });

                if (tomorrow) {
                    const prevLabel = isPt ? "📅 Previsão para amanhã" : "📅 Tomorrow's forecast";
                    const prevValue = isPt
                        ? `Mín: **${tomorrow.min.toFixed(1)}°C** • Máx: **${tomorrow.max.toFixed(1)}°C**\n${tomorrow.desc}`
                        : `Min: **${tomorrow.min.toFixed(1)}°C** • Max: **${tomorrow.max.toFixed(1)}°C**\n${tomorrow.desc}`;

                    embed.addFields({
                        name: prevLabel,
                        value: prevValue,
                        inline: false
                    });
                }
            }

            // Resumo Wikipedia
            if (wiki && wiki.extract) {
                embed.addFields({
                    name: isPt ? "📚 Resumo (Wikipedia)" : "📚 Summary (Wikipedia)",
                    value: wiki.extract.slice(0, 1024)
                });
            }

            if (wiki && wiki.url) {
                embed.addFields({
                    name: "🔗 Wikipedia",
                    value: wiki.url
                });
            }

            if (wiki && wiki.thumb) {
                embed.setThumbnail(wiki.thumb);
            }

            return thinking.edit({ content: " ", embeds: [embed] });
        }

        // =========================
        //   _info (fallback antigo, se quiseres manter)
        // =========================

        if (content === "_info") {
            const uptime = formatUptime(Date.now() - startTime);

            const embed = new EmbedBuilder()
                .setTitle("📡 CrespoA.I.C.S. — Sistema")
                .setColor("#4A90E2")
                .addFields(
                    {
                        name: "👤 Usuário",
                        value:
                            `Tag: **${msg.author.tag}**\n` +
                            `ID: \`${msg.author.id}\`\n` +
                            `Bot: **${msg.author.bot ? "sim" : "não"}**\n` +
                            `Criado em: ${msg.author.createdAt.toISOString().slice(0, 10)}`
                    },
                    {
                        name: "🖥️ Sistema CrespoA.I.C.S.",
                        value:
                            `Versão: **1.0.0-PRO**\n` +
                            `Uptime: **${uptime}**\n` +
                            `Plataforma: \`${os.platform()}\`\n` +
                            `CPU: \`${os.cpus()[0].model}\``
                    }
                )
                .setFooter({ text: "CrespoIS • Núcleo Técnico" })
                .setTimestamp();

            return msg.reply({ embeds: [embed] });
        }

        // =========================
        //   _ping (embed PRO)
        // =========================

        if (content === "_ping") {
            const before = Date.now();
            const pongMsg = await msg.reply("Medindo latência...");
            const latency = Date.now() - before;
            const apiLatency = Math.round(client.ws.ping || 0);

            const embed = new EmbedBuilder()
                .setTitle("📡 CrespoA.I.C.S. — Ping")
                .setColor("#4A90E2")
                .addFields(
                    { name: "⏱️ Latência", value: `**${latency}ms**`, inline: true },
                    { name: "🌐 API", value: `**${apiLatency}ms**`, inline: true }
                )
                .setFooter({ text: "CrespoIS • Núcleo Técnico" })
                .setTimestamp();

            return pongMsg.edit({ content: " ", embeds: [embed] });
        }

        // =========================
        //   _help (opcional)
        // =========================

        if (content === "_help") {
            const embed = new EmbedBuilder()
                .setTitle("📡 CrespoA.I.C.S. — Comandos")
                .setColor("#4A90E2")
                .setDescription("Lista de comandos disponíveis:")
                .addFields(
                    { name: "_ia <texto>", value: "Conversa com a IA CrespoA.I.C.S.", inline: false },
                    { name: "_search <termo>", value: "Pesquisa resumo na Wikipedia.", inline: false },
                    { name: "_where <lugar>", value: "Mostra coordenadas e link do Google Maps.", inline: false },
                    { name: "_time <lugar>", value: "Mostra hora local, fuso e UTC.", inline: false },
                    { name: "_weather <cidade>", value: "Clima atual + previsão hoje/amanhã.", inline: false },
                    { name: "_info-pt <cidade>", value: "Resumo técnico da cidade em PT.", inline: false },
                    { name: "_info-en <city>", value: "Technical city summary in EN.", inline: false },
                    { name: "_info", value: "Info do sistema CrespoA.I.C.S.", inline: false },
                    { name: "_ping", value: "Mostra latência do bot.", inline: false }
                )
                .setFooter({ text: "CrespoIS • Núcleo Técnico" })
                .setTimestamp();

            return msg.reply({ embeds: [embed] });
        }
    } catch (e) {
        console.error("Erro no handler:", e);
        try {
            await msg.reply("Ocorreu um erro interno no módulo CrespoA.I.C.S.");
        } catch {}
    }
});

client.login(TOKEN);
