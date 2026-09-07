const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    console.log(message.content);

    // Avatar command
    if (message.content === 'a' || message.content.startsWith('a ')) {
        const target = message.mentions.users.first() || message.author;

        const embed = new EmbedBuilder()
            .setTitle(`${target.username}'s Avatar`)
            .setImage(target.displayAvatarURL({ size: 1024, forceStatic: false }))
            .setColor(0x3498db);

        message.channel.send({ embeds: [embed] });
    }

    // Banner command
    if (message.content === 'b' || message.content.startsWith('b ')) {
        const target = message.mentions.users.first() || message.author;
        const fetchedUser = await target.fetch();
        const bannerUrl = fetchedUser.bannerURL({ size: 1024 });

        if (bannerUrl) {
            const embed = new EmbedBuilder()
                .setTitle(`${fetchedUser.username}'s Banner`)
                .setImage(bannerUrl)
                .setColor(0x3498db);
            message.channel.send({ embeds: [embed] });
        } else {
            message.channel.send(`${fetchedUser.username} doesn't have a banner (needs Discord Nitro)`);
        }
    }

    // Move command
    if (message.content.startsWith('Aji ') || message.content.startsWith('aji ')) {
        const target = message.mentions.members.first();
        const channelMention = message.mentions.channels.first();

        if (!target) {
            message.channel.send('Usage: `Aji @user` or `Aji @user #channel`');
            return;
        }

        if (!target.voice.channelID) {
            return message.channel.send(`${target} is not in any voice channel.`);
        }

        let destination = channelMention;
        if (!destination) {
            destination = message.member.voice ? message.member.voice.channel : null;
        }

        if (!destination) {
            return message.channel.send('Join a voice channel first or tag one with `#`.');
        }

        if (destination.type !== 2) {
            return message.channel.send('That\'s not a voice channel.');
        }

        if (target.voice.channelID === destination.id) {
            return message.channel.send(`${target} is already in <#${destination.id}> 🎧`);
        }

        try {
            await target.voice.setChannel(destination);
            message.channel.send(`Moved ${target} to <#${destination.id}> ✅`);
        } catch {
            message.channel.send('I don\'t have permission to move them.');
        }
    }
});

client.login(process.env.TOKEN);