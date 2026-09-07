const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates]
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

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
    if (message.content.startsWith('Aji ')) {
        const args = message.content.slice(4).trim().split(' ');
        const target = message.mentions.members.first();
        const channelName = args.join(' ').replace(/<@!?\d+>/g, '').trim();

        if (!target) {
            message.channel.send('Usage: `Aji @user channel name`');
            return;
        }

        if (!target.voice) {
            message.channel.send(`${target.user.username} is not in a voice channel.`);
            return;
        }

        const channel = message.guild.channels.cache.find(
            c => c.type === 2 && c.name.toLowerCase() === channelName.toLowerCase()
        );

        if (!channel) {
            message.channel.send(`Voice channel "${channelName}" not found.`);
            return;
        }

        try {
            await target.voice.setChannel(channel);
            message.channel.send(`Moved ${target.user.username} to **${channel.name}** ✅`);
        } catch {
            message.channel.send('I don\'t have permission to move them. Make sure I have **Move Members** permission.');
        }
    }
});

client.login(process.env.TOKEN);