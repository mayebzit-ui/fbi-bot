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
            message.channel.send(`Moved ${target.user.username} to **${destination.name}** ?`);
        } catch {
            message.channel.send('I don\'t have permission to move them.');
        }
        return;
    }

    // ================= EXPANDED VOICE CONTROL COMMANDS (.v) =================
    if (message.content.startsWith('.v ')) {
        const voiceChannel = message.member.voice.channel;
        
        if (!voiceChannel) {
            return message.channel.send('? You must be in your temporary voice channel to use this command.');
        }

        if (!tempChannels.has(voiceChannel.id)) {
            return message.channel.send('? This is not a temporary voice channel managed by the bot.');
        }

        const ownerId = tempChannels.get(voiceChannel.id);
        if (message.author.id !== ownerId) {
            return message.channel.send('? Only the channel owner can manage this room.');
        }

        const args = message.content.slice(3).trim().split(/ +/);
        const subCommand = args.shift().toLowerCase();

        // 1. Rename: .v name [text]
        if (subCommand === 'name') {
            const newName = args.join(' ');
            if (!newName) return message.channel.send('Usage: `.v name Gaming Room`');
            try {
                await voiceChannel.setName(`🔊 | ${newName}`);
                return message.channel.send(`? Channel renamed to **?? | ${newName}**`);
            } catch (err) {
                return message.channel.send('? Failed to rename channel due to Discord rate limits.');
            }
        }

        // 2. Limit: .v limit [0-99]
        if (subCommand === 'limit') {
            const limit = parseInt(args);
            if (isNaN(limit) || limit < 0 || limit > 99) {
                return message.channel.send('Usage: `.v limit [0-99]` (Use 0 to clear limits)');
            }
            try {
                await voiceChannel.setUserLimit(limit);
                return message.channel.send(`?? User limit updated to **${limit === 0 ? 'Unlimited' : limit}**.`);
            } catch (err) {
                return message.channel.send('? Failed to update user limit.');
            }
        }

        // 3. Reject: .v reject @user
        if (subCommand === 'reject') {
            const target = message.mentions.members.first();
            if (!target) return message.channel.send('Usage: `.v reject @user`');
            try {
                if (target.voice.channelId === voiceChannel.id) {
                    await target.voice.setChannel(null);
                }
                await voiceChannel.permissionOverwrites.create(target.id, { Connect: false });
                return message.channel.send(`?? Kicked and locked out ${target.user.username}.`);
            } catch (err) {
                return message.channel.send('? Failed to reject user.');
            }
        }

        // 4. Lock Channel: .v lock
        if (subCommand === 'lock') {
            try {
                await voiceChannel.permissionOverwrites.create(message.guild.roles.everyone, { Connect: false });
                return message.channel.send('?? The channel is now **Locked**. Nobody else can join.');
            } catch (err) {
                return message.channel.send('? Failed to lock the channel.');
            }
        }

        // 5. Unlock Channel: .v unlock
        if (subCommand === 'unlock') {
            try {
                await voiceChannel.permissionOverwrites.create(message.guild.roles.everyone, { Connect: true });
                return message.channel.send('?? The channel is now **Unlocked**. Anyone can join.');
            } catch (err) {
                return message.channel.send('? Failed to unlock the channel.');
            }
        }

        // 6. Give Trust / Co-owner Perms: .v trust @user
        if (subCommand === 'trust') {
            const target = message.mentions.members.first();
            if (!target) return message.channel.send('Usage: `.v trust @user`');
            try {
                await voiceChannel.permissionOverwrites.create(target.id, { 
                    ManageChannels: true, 
                    MoveMembers: true,
                    Connect: true 
                });
                return message.channel.send(`? Granted co-owner/trust permissions to ${target.user.username} for this session.`);
            } catch (err) {
                return message.channel.send('? Failed to give permissions to user.');
            }
        }

        // 7. Transfer Ownership Permanently: .v transfer @user
        if (subCommand === 'transfer') {
            const target = message.mentions.members.first();
            if (!target) return message.channel.send('Usage: `.v transfer @user`');
            if (target.id === message.author.id) return message.channel.send('? You already own this channel.');
            
            if (target.voice.channelId !== voiceChannel.id) {
                return message.channel.send('? The new owner must be connected inside your voice room first.');
            }

            try {
                tempChannels.set(voiceChannel.id, target.id);
                await voiceChannel.permissionOverwrites.create(target.id, { ManageChannels: true, MoveMembers: true });
                await voiceChannel.permissionOverwrites.create(message.author.id, { ManageChannels: null, MoveMembers: null });
                
                return message.channel.send(`?? Ownership of this channel has been completely transferred to ${target.user.username}!`);
            } catch (err) {
                return message.channel.send('? Failed to complete ownership transfer.');
            }
        }

        return message.channel.send('?? **Available settings:** `.v name`, `.v limit`, `.v reject`, `.v lock`, `.v unlock`, `.v trust`, `.v transfer`');
    }
});

// ================= DYNAMIC VOICE CHANNEL CREATOR =================
client.on('voiceStateUpdate', async (oldState, newState) => {
    const { guild, member } = newState;
    
    // ?? REPLACE THESE placeholders with your actual numeric Discord IDs
    const SETUP_CHANNEL_ID = '1561765624332689592'; 
    const CATEGORY_ID = '1561765456698810378'; 

    if (newState.channelId === SETUP_CHANNEL_ID) {
        try {
            const channel = await guild.channels.create({
                name: `🔊 | ${member.displayName}'s Room`,
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
        } catch (error) {
            console.error('Error creating voice room:', error);
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
