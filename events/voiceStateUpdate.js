const { ActionRowBuilder, ButtonBuilder, ChannelType, EmbedBuilder, InteractionType, ButtonStyle, ComponentType } = require('discord.js');
const fetch = require('node-fetch');
const path = require("node:path");
const Event = require('../structures/event.js');
const config = require('../config/config.json');

module.exports = new Event("voiceStateUpdate", async (client, o, n) => {
  let player = client.player;
  let isClient = (o.member || n.member).id == config.clientID;
  let isRadio = (o.channel || n.channel).id == config.radiochannel;
  let voiceMembers = Array.from((o.channel || n.channel).members.values());

  if (!player.initialized) return;

  if (o.channel && isClient) client.log.debug(`Bot has left the <#${o.channel.id}> voice channel`);
  if (n.channel && isClient) client.log.debug(`Bot has joined the <#${n.channel.id}> voice channel`);

  //If a new listener joins after the radio has been paused because it was empty
  if (n.channel && isRadio && player.radioEmpty) {
    if (isClient) return;
    if (player.isDisabled()) return queue.metadata.channel.send(` :x:⠀|⠀The player has been disabled. Unable to start the queue.`);
    player.radioEmpty = false;

    let queue = player.nodes.get(config.guildID);
    player.queuePaused == null ? await queue.node.play() : await queue.node.resume();

    player.queuePaused = false;
    queue.metadata.channel.send(`▶️⠀|⠀A listener has joined the Radio channel, the radio has been resumed.`);
    await player.updateCurrentlyPlayingEmbed();
  }

  //If the bot is the last in the stage
  if (o.channel && isRadio && (voiceMembers.length == 1) && (voiceMembers[0] == config.clientID)) {
    let queue = player.nodes.get(config.guildID);
    player.radioEmpty = true;
    player.queuePaused = true;
    await queue.node.pause();
    await player.pauseRadioEmbed();
    queue.metadata.channel.send(`⏸️⠀|⠀The radio has been paused as there are no more active listeners.`);
  }

  //If the bot for some reason gets disconnected
  if (o.channel && isClient && player.initialized) {
    client.log.debug("Bot has disconnected from the stage channel. Automatically reinitiating queue...");
    player.initialized = false;
    let queue = player.nodes.get(config.guildID);
    await queue.delete();
    player.initQueue({ playlist: config.playlists.all });
  }
});