const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ComponentType } = require('discord.js');
const fetch = require("node-fetch");
const config = require("../config/config.json");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, '../.env') });
const database = require("../functions/database.js");
const youtube = require('../functions/youtube.js');
const package = require("../package.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('livestreams')
    .setDescription('Gets information about hololive livestreams')
    .addSubcommand(subcommand =>
      subcommand.setName('current')
        .setDescription('Get all the current hololive livestreams'))
    .addSubcommand(subcommand =>
      subcommand.setName('upcoming')
        .setDescription('Get all the upcoming/scheduled hololive livestreams')),
  async execute(interaction) {
    let client = interaction.client;
    let type = interaction.options.getSubcommand();

    let cooldown = await client.checkCooldown({ interaction, name: "livestreams-" + type, duration: 300 });
    if (cooldown.status == "oncooldown") return client.interactionOnCooldown({ interaction, time: cooldown.time });

    await interaction.deferReply();

    let channels, data, videos = [];
    try {
      data = await database.query(`SELECT * FROM \`livestreams\` WHERE \`status\`='${type == "current" ? 1 : 0}' ORDER BY \`premiere\` ${type == "current" ? "DESC" : "ASC"}`);
      channels = await database.getAllMembers();
      let sorted = data.results.length > 0 ? await client.sortVideos(data.results) : { strings: [] };
      for (let string of sorted.strings) {
        let videoData = await youtube.getVideos({ id: string });
        videos.push(...videoData.data);
      }
    } catch (e) {
      client.log.error(e);
      return interaction.editReply(`This command could not be run due to an internal server error. Please contact a moderator for more information.`);
    }
    let description = "", { results } = data, pages = Math.ceil(results.length / 5);
    if (pages == 0) pages = 1;
    let currentPage = 0, pageArray = [""];

    for (let i = 0; i < results.length; i++) {
      let video = videos.filter(x => x.id == results[i].video_id)[0];
      if (!video || video == {}) { 
        client.log.error(`${results[i].video_id} did not receive a video object, deleting the sql data row.`); 
        client.videos.setPrivateLivestream(results[i].video_id);
        continue; 
      }
      if ((type == "current") && !video.liveStreamingDetails.actualStartTime) continue;

      let savePosition = Math.floor(i / 5);
      if (i % 5 === 0) pageArray[savePosition] = "";

      let channel = channels.filter(x => x.id == results[i].channel)[0];
      pageArray[savePosition] = pageArray[savePosition] + `${type == "current" ? "Started" : "Starts"} <t:${new Date(results[i].premiere) / 1000}:R>\n**${channel.simplified_name}**: [${video.snippet.title}](https://www.youtube.com/watch?v=${results[i].video_id})\n\n`
    }

    const embed = {
      title: `${type == "current" ? "Current" : "Upcoming"} Hololive Streams`,
      description: pageArray[0],
      color: config.informationEmbedColor,
      footer: { text:  `/livestreams ⠀•⠀ Page ${currentPage + 1}/${pages} ⠀•⠀ ${config.bot_name} v${package.version}` },
      //timestamp: new Date()
    }

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('back').setLabel('🠔').setStyle('Primary').setDisabled(true),
      new ButtonBuilder().setCustomId('pages').setLabel(`Page ${currentPage + 1}/${pages}`).setStyle('Secondary').setDisabled(true),
      new ButtonBuilder().setCustomId('forward').setLabel('🠖').setStyle('Primary').setDisabled(pages == 1 ? true : false),
    )

    await interaction.editReply({ embeds: [embed], components: [buttons] }).then(msg => {
      let collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });

      collector.on("collect", i => {
        if (i.member.id !== interaction.member.id) {
          return i.reply({ content: "You are not allowed to interact with an interaction that is not yours.", ephemeral: true });
        }

        i.deferUpdate();
        currentPage = i.customId == "back" ? currentPage - 1 : currentPage + 1;

        const newEmbed = {
          title: `${type == "current" ? "Current" : "Upcoming"} Hololive Streams`,
          description: pageArray[currentPage],
          color: config.informationEmbedColor,
          footer: { text: `/livestreams ⠀•⠀ Page ${currentPage + 1}/${pages} ⠀•⠀ ${config.bot_name} v${package.version}` },
          //timestamp: new Date()
        }

        const newButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('back').setLabel('🠔').setStyle('Primary').setDisabled(currentPage == 0 ? true : false),
          new ButtonBuilder().setCustomId('pages').setLabel(`Page ${currentPage + 1}/${pages}`).setStyle('Secondary').setDisabled(true),
          new ButtonBuilder().setCustomId('forward').setLabel('🠖').setStyle('Primary').setDisabled(((pages == 1) || ((currentPage + 1) == pages)) ? true : false),
        )

        interaction.editReply({ embeds: [newEmbed], components: [newButtons]});
      });

      collector.on("end", collected => interaction.editReply({ embeds: msg.embeds, components: [] }));
    });
  }
}