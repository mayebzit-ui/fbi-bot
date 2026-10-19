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

const TRIGGER_CHANNEL_ID = '1561765624332689592'; 
const CATEGORY_ID = '1561765456698810378';        

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildVoiceStates
    ]
});

const tempChannels = new Map(); 

client.once('ready', () => {
    console.log(`✅ Bot is online: ${client.user.tag}`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.content === 'a' || message.content.startsWith('a ')) {
        const target = message.mentions.users.first() || message.author;
        const embed = new EmbedBuilder()
            .setTitle(`${target.username}'s Avatar`)
            .setImage(target.displayAvatarURL({ size: 1024, forceStatic: false }))
            .setColor(0x3498db);
        message.channel.send({ embeds: [embed] });
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
    }

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
            message.channel.send(`Moved ${target.user.username} to **${destination.name}** ✅`);
        } catch {
            message.channel.send('I don\'t have permission to move them.');
        }
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const member = newState.member;
    if (!member || member.user.bot) return;

    if (newState.channelId === TRIGGER_CHANNEL_ID && oldState.channelId !== TRIGGER_CHANNEL_ID) {
        try {
            const newVoice = await newState.guild.channels.create({
                name: `🔊 ${member.displayName}'s room`,
                type: ChannelType.GuildVoice,
                parent: CATEGORY_ID,
                permissionOverwrites: [
                    { id: newState.guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
                    { id: member.id, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect] },
                ],
            });

            const newText = await newState.guild.channels.create({
                name: `💬-${member.displayName}'s-chat`,
                type: ChannelType.GuildText,
                parent: CATEGORY_ID,
                permissionOverwrites: [
                    { id: newState.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                ],
            });

            await member.voice.setChannel(newVoice);
            tempChannels.set(newVoice.id, { ownerId: member.id, textChannelId: newText.id });

            await sendControlPanel(newText, member);
        } catch (error) {
            console.error(`[ERROR] Failed to create room:`, error);
        }
    }

    if (oldState.channelId && oldState.channelId !== TRIGGER_CHANNEL_ID) {
        const channel = oldState.channel;
        const data = tempChannels.get(channel.id);

        if (data && channel.members.size === 0) {
            setTimeout(async () => {
                const fetchedVoice = channel.guild.channels.cache.get(channel.id);
                if (fetchedVoice && fetchedVoice.members.size === 0) {
                    await fetchedVoice.delete().catch(() => {});
                    const textChan = channel.guild.channels.cache.get(data.textChannelId);
                    if (textChan) await textChan.delete().catch(() => {});
                    tempChannels.delete(channel.id);
                }
            }, 3000);
        }
    }
});

async function sendControlPanel(textChannel, member) {
    const embed = new EmbedBuilder()
        .setColor('#ff0000') 
        .setTitle('🔥 ⇝ Bienvenido, <3')
        .setDescription('✧ ⇝ Tu sala de Priv está lista! Gestiona la configuración de tu canal usando la guía de referencia rápida que aparece a continuación... <3')
        .addFields(
            { name: '🔒 Lock', value: 'Locks / Unlocks Your Voice Channel', inline: true },
            { name: '✏️ Name', value: 'Changes Your Voice Channel Name', inline: true },
            { name: '👥 Limit', value: 'Sets A Limit To Your Voice Channel', inline: true },
            { name: '🚫 Reject', value: 'Rejects A User From Your Voice Channel', inline: true },
            { name: '✅ Permit', value: 'Allows A User To Join Your Voice Channel', inline: true }
        )
        .setFooter({ text: 'Respect the rules & Follow the Discord TOS...' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('vc_lock').setLabel('Lock').setEmoji('🔒').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('vc_unlock').setLabel('Unlock').setEmoji('🔓').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('vc_rename').setLabel('Rename').setEmoji('✏️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('vc_limit').setLabel('Limit').setEmoji('👥').setStyle(ButtonStyle.Secondary),
    );

    await textChannel.send({ 
        content: `👋 <@${member.id}>, here is your control panel!`, 
        embeds: [embed], 
        components: [row] 
    });
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) return interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });

    const data = tempChannels.get(voiceChannel.id);
    if (!data || data.ownerId !== interaction.user.id) {
        return interaction.reply({ content: '❌ You are not the owner of this channel.', ephemeral: true });
    }

    if (interaction.customId === 'vc_lock') {
        await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
        await interaction.reply({ content: '🔒 Channel locked.', ephemeral: true });
    }
    if (interaction.customId === 'vc_unlock') {
        await voiceChannel.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
        await interaction.reply({ content: '🔓 Channel unlocked.', ephemeral: true });
    }
    if (interaction.customId === 'vc_rename') {
        await interaction.reply({ content: '✏️ Please reply to this message with the new name for your channel.', ephemeral: true });
    }
    if (interaction.customId === 'vc_limit') {
        await interaction.reply({ content: '👥 Please reply to this message with a number (0-99) for the user limit.', ephemeral: true });
    }
});

client.login(process.env.TOKEN);