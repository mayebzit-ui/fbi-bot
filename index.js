const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ChannelType, 
    PermissionFlagsBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ==========================================
// ?? REPLACE THESE WITH YOUR ACTUAL SERVER IDs
// ==========================================
const TRIGGER_CHANNEL_ID = '1561765624332689592'; // The voice channel users join to create a temp channel
const CATEGORY_ID = '1561765456698810378';        // The category where temp channels are created
// ==========================================

// Stores the owner ID and text channel ID for each temp channel
const tempChannels = new Map(); 

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// --- ??? TEMP VOICE SYSTEM (Join/Leave) ---
client.on('voiceStateUpdate', async (oldState, newState) => {
    const member = newState.member;
    if (!member || member.user.bot) return;

    // 1. User joins the Trigger Channel
    if (newState.channelId === TRIGGER_CHANNEL_ID) {
        try {
            // Create the Voice Channel
            const newVoiceChannel = await newState.guild.channels.create({
                name: `?? ${member.displayName}'s room`,
                type: ChannelType.GuildVoice,
                parent: CATEGORY_ID,
                permissionOverwrites: [
                    {
                        id: newState.guild.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                    },
                    {
                        id: member.id,
                        allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect],
                    },
                ],
            });

            // Create the Text Channel for the panel
            const newTextChannel = await newState.guild.channels.create({
                name: `??-${member.displayName}'s-chat`,
                type: ChannelType.GuildText,
                parent: CATEGORY_ID,
                permissionOverwrites: [
                    {
                        id: newState.guild.id,
                        deny: [PermissionFlagsBits.ViewChannel], // Hidden from everyone by default
                    },
                    {
                        id: member.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    },
                ],
            });

            // Move user to voice, save data, and send panel
            await member.voice.setChannel(newVoiceChannel);
            tempChannels.set(newVoiceChannel.id, { ownerId: member.id, textChannelId: newTextChannel.id });

            await sendControlPanel(newTextChannel, member, newVoiceChannel);
        } catch (error) {
            console.error("Error creating temp channels:", error);
        }
    }

    // 2. Auto-delete channels when empty
    if (oldState.channelId && oldState.channelId !== TRIGGER_CHANNEL_ID) {
        const channel = oldState.channel;
        const channelData = tempChannels.get(channel.id);

        if (channelData && channel.members.size === 0) {
            setTimeout(async () => {
                const fetchedVoice = channel.guild.channels.cache.get(channel.id);
                if (fetchedVoice && fetchedVoice.members.size === 0) {
                    // Delete Voice Channel
                    await fetchedVoice.delete().catch(console.error);
                    // Delete Text Channel
                    const textChannel = channel.guild.channels.cache.get(channelData.textChannelId);
                    if (textChannel) await textChannel.delete().catch(console.error);
                    
                    tempChannels.delete(channel.id);
                }
            }, 3000);
        }
    }
});

// --- ?? COMMANDS ---
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
        const target = message.mentions.members.first();
        const channelMention = message.mentions.channels.first();

        if (!target) return message.channel.send('Usage: `Aji @user` or `Aji @user #channel`');
        if (!target.voice) return message.channel.send(`${target.user.username} is not in a voice channel.`);

        let destination = channelMention;
        if (!destination) destination = message.member.voice ? message.member.voice.channel : null;
        if (!destination) return message.channel.send('Either tag a voice channel with `#` or join a voice channel first.');
        if (destination.type !== 2) return message.channel.send('That\'s not a voice channel.');

        try {
            await target.voice.setChannel(destination);
            message.channel.send(`Moved ${target.user.username} to **${destination.name}** ?`);
        } catch {
            message.channel.send('I don\'t have permission to move them.');
        }
    }

    // --- ?? TEMP VOICE COMMANDS (.v) ---
    if (message.content.startsWith('.v')) {
        const args = message.content.slice(2).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        const voiceChannel = message.member.voice.channel;

        if (!voiceChannel) return message.reply("? You must be in a voice channel.");
        
        const channelData = tempChannels.get(voiceChannel.id);
        if (!channelData || channelData.ownerId !== message.author.id) {
            return message.reply("? You are not the owner of this temporary channel.");
        }

        switch (command) {
            case 'lock':
                await voiceChannel.permissionOverwrites.edit(message.guild.id, { Connect: false });
                await message.reply("?? Channel locked.");
                break;
            case 'unlock':
                await voiceChannel.permissionOverwrites.edit(message.guild.id, { Connect: true });
                await message.reply("?? Channel unlocked.");
                break;
            case 'name':
                const newName = args.join(' ');
                if (!newName) return message.reply("? Please provide a name.");
                await voiceChannel.setName(newName);
                await message.reply(`?? Channel renamed to **${newName}**.`);
                break;
            case 'limit':
                const limit = parseInt(args[0]);
                if (isNaN(limit) || limit < 0 || limit > 99) return message.reply("? Please provide a number between 0 and 99.");
                await voiceChannel.setUserLimit(limit);
                await message.reply(`?? User limit set to **${limit}**.`);
                break;
            case 'reject':
                const targetUser = message.mentions.members.first();
                if (!targetUser) return message.reply("? Mention a user to reject.");
                await voiceChannel.permissionOverwrites.edit(targetUser.id, { Connect: false });
                if (targetUser.voice.channelId === voiceChannel.id) await targetUser.voice.disconnect();
                await message.reply(`?? Rejected **${targetUser.user.username}**.`);
                break;
            case 'permit':
                const permitUser = message.mentions.members.first();
                if (!permitUser) return message.reply("? Mention a user to permit.");
                await voiceChannel.permissionOverwrites.edit(permitUser.id, { Connect: true });
                // Also give them access to the text channel
                const textChan = message.guild.channels.cache.get(channelData.textChannelId);
                if (textChan) await textChan.permissionOverwrites.edit(permitUser.id, { ViewChannel: true });
                await message.reply(`? Permitted **${permitUser.user.username}**.`);
                break;
            default:
                message.reply("? Unknown command.");
        }
    }
});

// --- ?? BEAUTIFUL PANEL CREATOR ---
async function sendControlPanel(textChannel, member, voiceChannel) {
    const embed = new EmbedBuilder()
        .setColor('#ff0000') 
        .setTitle('?? ? Bienvenido, <3')
        .setDescription('? ? Tu sala de Priv está lista! Gestiona la configuración de tu canal usando la guía de referencia rápida que aparece a continuación... <3')
        .addFields(
            { name: '?? Lock', value: 'Locks / Unlocks Your Voice Channel', inline: true },
            { name: '?? Name', value: 'Changes Your Voice Channel Name', inline: true },
            { name: '?? Limit', value: 'Sets A Limit To Your Voice Channel', inline: true },
            { name: '?? Reject', value: 'Rejects A User From Your Voice Channel', inline: true },
            { name: '? Permit', value: 'Allows A User To Join Your Voice Channel', inline: true }
        )
        .setFooter({ text: 'Respect the rules & Follow the Discord TOS...' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('vc_lock').setLabel('Lock').setEmoji('??').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('vc_unlock').setLabel('Unlock').setEmoji('??').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('vc_rename').setLabel('Rename').setEmoji('??').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('vc_limit').setLabel('Limit').setEmoji('??').setStyle(ButtonStyle.Secondary),
    );

    await textChannel.send({ 
        content: `?? <@${member.id}>, here is your control panel!`, 
        embeds: [embed], 
        components: [row] 
    });
}

// --- ?? BUTTON INTERACTIONS ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) return interaction.reply({ content: '? You must be in a voice channel.', ephemeral: true });

    const channelData = tempChannels.get(voiceChannel.id);
    if (!channelData || channelData.ownerId !== interaction.user.id) {
        return interaction.reply({ content: '? You are not the owner of this channel.', ephemeral: true });
    }

    if (interaction.customId === 'vc_lock') {
        await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        await interaction.reply({ content: '?? Channel locked.', ephemeral: true });
    }
    if (interaction.customId === 'vc_unlock') {
        await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
        await interaction.reply({ content: '?? Channel unlocked.', ephemeral: true });
    }
    if (interaction.customId === 'vc_rename') {
        await interaction.reply({ content: '?? Type `.v name [New Name]` in chat to rename.', ephemeral: true });
    }
    if (interaction.customId === 'vc_limit') {
        await interaction.reply({ content: '?? Type `.v limit [Number]` in chat to set a limit.', ephemeral: true });
    }
});

client.login(process.env.TOKEN);