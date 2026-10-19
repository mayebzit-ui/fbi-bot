const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Map to track temporary channels: key = channelId, value = ownerId
const tempChannels = new Map();

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // ================= EXISTING COMMANDS (Avatar, Banner, Move) =================
    if (message.content === 'a' || message.content.startsWith('a ')) {
        const target = message.mentions.users.first() || message.author;
        const embed = new EmbedBuilder()
            .setTitle(`${target.username}'s Avatar`)
            .setImage(target.displayAvatarURL({ size: 1024, forceStatic: false }))
            .setColor(0x3498db);
        return message.channel.send({ embeds: [embed] });
    }

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
        return;
    }

    if (message.content.startsWith('Aji ')) {
        const target = message.mentions.members.first();
        const channelMention = message.mentions.channels.first();

        if (!target) return message.channel.send('Usage: `Aji @user` or `Aji @user #channel`');
        if (!target.voice) return message.channel.send(`${target.user.username} is not in a voice channel.`);

        let destination = channelMention || (message.member.voice ? message.member.voice.channel : null);
        if (!destination) return message.channel.send('Either tag a voice channel with `#` or join a voice channel first.');
        if (destination.type !== 2) return message.channel.send('That\'s not a voice channel.');

        try {
            await target.voice.setChannel(destination);
            message.channel.send(`Moved ${target.user.username} to **${destination.name}** ✅`);
        } catch {
            message.channel.send('I don\'t have permission to move them.');
        }
        return;
    }

    // ================= BACKUP TEXT COMMANDS (.v) =================
    if (message.content.startsWith('.v ')) {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel || !tempChannels.has(voiceChannel.id)) return;

        const ownerId = tempChannels.get(voiceChannel.id);
        if (message.author.id !== ownerId) return message.channel.send('❌ Only the channel owner can manage this room.');

        const args = message.content.slice(3).trim().split(/ +/);
        const subCommand = args.shift().toLowerCase();

        if (subCommand === 'name') {
            const newName = args.join(' ');
            if (!newName) return message.channel.send('Usage: `.v name Room Name`');
            try { await voiceChannel.setName(`[V] ${newName}`); return message.channel.send(`✨ Renamed to **[V] ${newName}**`); } catch { return message.channel.send('❌ Rate limited by Discord.'); }
        }

        if (subCommand === 'limit') {
            const limit = parseInt(args);
            if (isNaN(limit) || limit < 0 || limit > 99) return message.channel.send('Usage: `.v limit [0-99]`');
            try { await voiceChannel.setUserLimit(limit); return message.channel.send(`👥 Limit set to **${limit}**.`); } catch { return message.channel.send('❌ Error changing limit.'); }
        }

        if (subCommand === 'reject') {
            const target = message.mentions.members.first();
            if (!target) return message.channel.send('Usage: `.v reject @user`');
            try {
                if (target.voice.channelId === voiceChannel.id) await target.voice.setChannel(null);
                await voiceChannel.permissionOverwrites.create(target.id, { Connect: false });
                return message.channel.send(`🚫 Kicked and locked out ${target.user.username}.`);
            } catch { return message.channel.send('❌ Error rejecting user.'); }
        }
    }
});

// ================= INTERACTIVE BUTTON TRIGGER HANDLING =================
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const voiceChannel = interaction.member.voice.channel;
    
    // Check if user is connected to a dynamic room
    if (!voiceChannel || !tempChannels.has(voiceChannel.id)) {
        return interaction.reply({ content: '❌ You must be connected inside your temporary voice channel to use these buttons.', ephemeral: true });
    }

    // Verify button user is the room creator
    const ownerId = tempChannels.get(voiceChannel.id);
    if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '❌ Only the creator of this room can click these controls.', ephemeral: true });
    }

    try {
        if (interaction.customId === 'vc_lock') {
            await voiceChannel.permissionOverwrites.create(interaction.guild.roles.everyone, { Connect: false });
            return interaction.reply({ content: '🔒 Your voice channel has been **Locked**.', ephemeral: true });
        } 
        if (interaction.customId === 'vc_unlock') {
            await voiceChannel.permissionOverwrites.create(interaction.guild.roles.everyone, { Connect: true });
            return interaction.reply({ content: '🔓 Your voice channel has been **Unlocked**.', ephemeral: true });
        } 
        if (interaction.customId === 'vc_rename') {
            return interaction.reply({ content: 'ℹ️ Use the command `.v name [New Name]` in chat to quickly change your room name!', ephemeral: true });
        } 
        if (interaction.customId === 'vc_limit') {
            return interaction.reply({ content: 'ℹ️ Use the command `.v limit [Number]` in chat to set player slots!', ephemeral: true });
        }
    } catch (err) {
        console.error(err);
        return interaction.reply({ content: '❌ Failed to execute permission change. Check bot role hierarchy.', ephemeral: true });
    }
});

// ================= DYNAMIC VOICE CHANNEL CREATOR + EMBED INTERFACE =================
client.on('voiceStateUpdate', async (oldState, newState) => {
    const { guild, member } = newState;
    
    // ⚠️ REPLACE THESE strings below with your actual numerical Discord IDs
    const SETUP_CHANNEL_ID = 'YOUR_JOIN_TO_CREATE_CHANNEL_ID'; 
    const CATEGORY_ID = 'YOUR_CATEGORY_ID'; 

    if (newState.channelId === SETUP_CHANNEL_ID) {
        try {
            const channel = await guild.channels.create({
                name: `[V] ${member.displayName}'s Room`,
                type: 2, 
                parent: CATEGORY_ID,
                permissionOverwrites: [
                    {
                        id: member.id,
                        allow: ['ManageChannels', 'MoveMembers', 'Connect'], 
                    },
                ],
            });

            await member.voice.setChannel(channel);
            tempChannels.set(channel.id, member.id); 

            // --- BUILD THE INTERACTIVE EMBED LAYOUT ---
            const interfaceEmbed = new EmbedBuilder()
                .setTitle(`火 ➜ ¡Bienvenido, ${member.displayName}! <3`)
                .setDescription(
                    `✨ ➜ **¡Tu Sala Prv está lista!** Gestiona la configuración de tu canal usando la guía de referencia rápida o los botones interactivos que aparecen a continuación...\n\n` +
                    `🔒 ‖ **Lock / Unlock** ➜ Locks / Unlocks your voice channel\n` +
                    `📝 ‖ **Name** ➜ Changes your voice channel name\n` +
                    `\u221E ‖ **Limit** ➜ Sets a slot limit to your channel\n` +
                    `👤 ‖ **Reject** ➜ Rejects a user from your channel`
                )
                .setColor(0x560404) // Custom dark wine red color matching your panel image
                .setFooter({ text: 'Respect the rules & Follow the Discord TOS • Create Communities' });

            // --- BUILD THE BUTTON ROW CONTROLS ---
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('vc_lock').setLabel('🔒 Lock').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('vc_unlock').setLabel('🔓 Unlock').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('vc_rename').setLabel('📝 Rename').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('vc_limit').setLabel('👥 Limit').setStyle(ButtonStyle.Secondary)
            );

            // Transmit interface message straight into the voice channel's integrated chat room
            await channel.send({ content: `${member}`, embeds: [interfaceEmbed], components: [row1] });

        } catch (error) {
            console.error('Error constructing room panel elements:', error);
        }
    }

    if (oldState.channelId && oldState.channelId !== newState.channelId) {
        const oldChannel = oldState.channel;
        
        if (tempChannels.has(oldChannel.id) && oldChannel.members.size === 0) {
            try {
                await oldChannel.delete();
                tempChannels.delete(oldChannel.id); 
            } catch (error) {
                console.error('Error removing empty channel:', error);
            }
        }
    }
});

client.login(process.env.TOKEN);
