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
// ⚠️ REPLACE THESE WITH YOUR ACTUAL SERVER IDs
// ==========================================
const TRIGGER_CHANNEL_ID = '1561765624332689592'; // The voice channel users join to create a temp channel
const CATEGORY_ID = '1561765456698810378';        // The category where temp channels are created
const CONTROL_TEXT_CHANNEL_ID = '1561765624332689592'; // The text channel where the panel will show up
// ==========================================

// Stores the owner ID for each temp channel
const tempChannels = new Map(); 

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

// --- 🎙️ TEMP VOICE SYSTEM (Join/Leave) ---
client.on('voiceStateUpdate', async (oldState, newState) => {
    const member = newState.member;
    if (!member || member.user.bot) return;

    // 1. User joins the Trigger Channel to create a new one
    if (newState.channelId === TRIGGER_CHANNEL_ID) {
        try {
            const newChannel = await newState.guild.channels.create({
                name: `🔊 ${member.displayName}'s channel`,
                type: ChannelType.GuildVoice,
                parent: CATEGORY_ID,
                permissionOverwrites: [
                    {
                        id: newState.guild.id, // @everyone
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
                    },
                    {
                        id: member.id, // The owner
                        allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect],
                    },
                ],
            });

            await member.voice.setChannel(newChannel);
            tempChannels.set(newChannel.id, member.id);

            // Send the Control Panel
            await sendControlPanel(newChannel);
        } catch (error) {
            console.error("Error creating temp channel:", error);
        }
    }

    // 2. Auto-delete channel when empty
    if (oldState.channelId && oldState.channelId !== TRIGGER_CHANNEL_ID) {
        const channel = oldState.channel;
        if (tempChannels.has(channel.id) && channel.members.size === 0) {
            setTimeout(async () => {
                const fetchedChannel = channel.guild.channels.cache.get(channel.id);
                if (fetchedChannel && fetchedChannel.members.size === 0) {
                    await fetchedChannel.delete().catch(console.error);
                    tempChannels.delete(channel.id);
                }
            }, 3000);
        }
    }
});

// --- 💻 COMMANDS ---
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

        if (!target) {
            message.channel.send('Usage: `Aji @user` or `Aji @user #channel`');
            return;
        }

        if (!target.voice) {
            message.channel.send(`${target.user.username} is not in a voice channel.`);
            return;
        }

        let destination = channelMention;
        if (!destination) {
            destination = message.member.voice ? message.member.voice.channel : null;
        }

        if (!destination) {
            message.channel.send('Either tag a voice channel with `#` or join a voice channel first.');
            return;
        }

        if (destination.type !== 2) {
            message.channel.send('That\'s not a voice channel.');
            return;
        }

        try {
            await target.voice.setChannel(destination);
            message.channel.send(`Moved ${target.user.username} to **${destination.name}** ✅`);
        } catch {
            message.channel.send('I don\'t have permission to move them.');
        }
    }

    // --- 🆕 TEMP VOICE COMMANDS (.v) ---
    if (message.content.startsWith('.v')) {
        const args = message.content.slice(2).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        
        const voiceChannel = message.member.voice.channel;

        if (!voiceChannel) return message.reply("❌ You must be in a voice channel.");
        
        if (tempChannels.get(voiceChannel.id) !== message.author.id) {
            return message.reply("❌ You are not the owner of this temporary channel.");
        }

        switch (command) {
            case 'lock':
                await voiceChannel.permissionOverwrites.edit(message.guild.id, { Connect: false });
                await message.reply("🔒 Channel locked. No one else can join.");
                break;

            case 'unlock':
                await voiceChannel.permissionOverwrites.edit(message.guild.id, { Connect: true });
                await message.reply("🔓 Channel unlocked. Everyone can join.");
                break;

            case 'name':
                const newName = args.join(' ');
                if (!newName) return message.reply("❌ Please provide a name.");
                await voiceChannel.setName(newName);
                await message.reply(`✏️ Channel renamed to **${newName}**.`);
                break;

            case 'limit':
                const limit = parseInt(args[0]);
                if (isNaN(limit) || limit < 0 || limit > 99) return message.reply("❌ Please provide a number between 0 and 99.");
                await voiceChannel.setUserLimit(limit);
                await message.reply(`👥 User limit set to **${limit}**.`);
                break;

            case 'reject':
                const targetUser = message.mentions.members.first();
                if (!targetUser) return message.reply("❌ Mention a user to reject.");
                
                await voiceChannel.permissionOverwrites.edit(targetUser.id, { Connect: false });
                if (targetUser.voice.channelId === voiceChannel.id) {
                    await targetUser.voice.disconnect();
                }
                await message.reply(`🚫 Rejected **${targetUser.user.username}**. They cannot join.`);
                break;

            case 'permit':
                const permitUser = message.mentions.members.first();
                if (!permitUser) return message.reply("❌ Mention a user to permit.");
                
                await voiceChannel.permissionOverwrites.edit(permitUser.id, { Connect: true });
                await message.reply(`✅ Permitted **${permitUser.user.username}** to join.`);
                break;
                
            default:
                message.reply("❌ Unknown command. Use `.v lock`, `.v unlock`, `.v name`, `.v limit`, `.v reject`, `.v permit`.");
        }
    }
});

// --- 🎨 BEAUTIFUL PANEL CREATOR ---
async function sendControlPanel(voiceChannel) {
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

    try {
        // Sends the panel to the specific text channel you chose
        const textChannel = await voiceChannel.guild.channels.fetch(CONTROL_TEXT_CHANNEL_ID);
        if (textChannel) {
            await textChannel.send({ 
                content: `👋 <@${tempChannels.get(voiceChannel.id)}>, here is your control panel for **${voiceChannel.name}**!`, 
                embeds: [embed], 
                components: [row] 
            });
        }
    } catch (error) {
        console.error("Could not find the control text channel. Check the ID!", error);
    }
}

// --- 🔘 BUTTON INTERACTIONS ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) return interaction.reply({ content: '❌ You must be in a voice channel.', ephemeral: true });

    if (tempChannels.get(voiceChannel.id) !== interaction.user.id) {
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
        await interaction.reply({ content: '✏️ To rename your channel, please type: `.v name [Your New Name]` in the chat.', ephemeral: true });
    }

    if (interaction.customId === 'vc_limit') {
        await interaction.reply({ content: '👥 To set a limit, please type: `.v limit [Number]` in the chat.', ephemeral: true });
    }
});

client.login(process.env.TOKEN);
