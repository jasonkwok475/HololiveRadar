const { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ComponentType, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const fetch = require("node-fetch");
const config = require("../config/config.json");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, '../.env') });
const youtube = require("../functions/youtube.js");
const database = require("../functions/database.js");
const f = require("../scripts/functions.js");
const package = require("../package.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('songs')
    .setDescription('Get information on all songs by a Hololive member')
    .addStringOption(option =>
      option.setName('member')
        .setDescription('Get all the songs uploaded by member')
        .setAutocomplete(true)
        .setRequired(true)),
  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const values = focusedValue.toLowerCase().split(" ");
    let members = await database.getAllMembers().catch(e => {
      interaction.respond("Error retreiving channel data.");
      return interaction.client.log.error(e);
    });

    const choices = members.sort((a, b) => a.simplified_name.localeCompare(b.simplified_name));
    let filtered = choices.filter(x => {
      //? Returns the options that contain all of the words typed
      if (!values.some(y => !x.name.toLowerCase().includes(y))) return true;
      if (!values.some(y => !x.simplified_name.toLowerCase().includes(y))) return true;
    }).slice(0, 25);

    if (filtered.length == 0) filtered = choices.filter(x => {
      //? Returns options that contain any of the given words
      if (values.some(y => x.name.toLowerCase().includes(y))) return true;
      if (values.some(y => x.simplified_name.toLowerCase().includes(y))) return true;
    }).slice(0, 25);

    await interaction.respond(filtered.map(choice => ({ name: `${choice.simplified_name}  -  ${choice.name}`, value: choice.name })));
  },
  async execute(interaction) {

    //!MAKE SURE ALL OF THIS WORKS EVEN WHEN THERE ARE NO SONGS OR TOPIC SONGS

    let cooldown = await interaction.client.checkCooldown({ interaction, name: "songs", duration: 300 });
    if (cooldown.status == "oncooldown") return interaction.client.interactionOnCooldown({ interaction, time: cooldown.time });

    let client = interaction.client;

    await interaction.deferReply();
    const name = interaction.options.getString('member');

    let members = await database.getAllMembers().catch(e => {
      interaction.respond("Error retreiving channel data.");
      return interaction.client.log.error(e);
    });

    let member = members.filter(x => x.name.toLowerCase().includes(name.toLowerCase()));
    if (!member[0] || member == []) return await interaction.reply({ content: `\`${name}\ was not found. Please use the autocomplete function to get better results.`, ephemeral: true });
    if (member.length > 1) return await interaction.reply({ content: `More than one result was found. Please use the autocomplete function to get better results.`, ephemeral: true });

    let channelData = await youtube.getChannel({ client: interaction.client, id: member[0].link_id, part: "snippet,id,brandingSettings,statistics,contentDetails" }).catch(e => this.client.log.error(e));
    if (!channelData || channelData.status == "private") return interaction.reply({ content: `Unable to fetch channel data. Please contact a moderator for more information.`, ephemeral: true });
    let channel = channelData.data, thumbnails = channel.snippet.thumbnails;

    let allSongs = await database.getAllSongs();
    let memberSongs = allSongs.filter(x => x.channel == member[0].id);
    let topicSongs = await database.getTopicSongs(member[0].id);

    let { strings } = await interaction.client.sortVideos([...memberSongs, ...topicSongs]);
    let allVideos = [];

    if (strings[0] !== '') {
      for (let string of strings) {
        allVideos.push(...(await youtube.getVideos({ id: string })).data);
      }
    }

    let videos = [...allVideos].filter(x => topicSongs.findIndex(y => y.video_id == x.id) == -1);
    let topicVideos = [...allVideos].filter(x => topicSongs.findIndex(y => y.video_id == x.id) !== -1);
    let allViews = memberSongs.length > 1 ? memberSongs.reduce((a, b) => (a.views || a) + b.views) : (memberSongs.length == 0 ? 0 : memberSongs[0].views);
    let viewsDesc = [...videos].sort((a, b) => b.statistics.viewCount - a.statistics.viewCount);
    let dateDesc = [...videos].sort((a, b) => new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt));

    //Stats embed
    let statFields = [
      { name: "Songs", value: `${memberSongs.length}`, inline: true },
      { name: "Total Song Views", value: `${f.subscriberString(allViews)}`, inline: true },
      { name: "Topic Songs", value: `${topicSongs.length}`, inline: true },
      {
        name: "\u202F", value: `
        Cover Songs: ${memberSongs.filter(x => x.type == 0).length}
        Original Songs: ${memberSongs.filter(x => x.type == 1).length}`, inline: true
      },
      {
        name: "\u202F", value: `
        Avg. Songs/Month: ${Math.round(memberSongs.length / f.monthDiff(new Date(channel.snippet.publishedAt), new Date()) * 10) / 10}
        Avg. Views/Song: ${f.subscriberString(Math.round(allViews / memberSongs.length)) || 0}`, inline: true
      }
      
    //percentage of videos that are songs
    //percentage of views that are songs
    ]

    memberSongs.length > 0 ? statFields.push({
      name: "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯", value: `
        **Most Popular Song - ${f.subscriberString(viewsDesc[0].statistics.viewCount)} views**
        [${viewsDesc[0].snippet.title}](https://www.youtube.com/watch?v=${viewsDesc[0].id})

        **Most Recent Song - ${f.subscriberString(dateDesc[0].statistics.viewCount)} views - <t:${Math.round(new Date(dateDesc[0].snippet.publishedAt.replace("T", " ").replace("Z", "")).getTime() / 1000)}:R>**
        [${dateDesc[0].snippet.title}](https://www.youtube.com/watch?v=${dateDesc[0].id})
        `, inline: false
    }) : statFields.push({ name: "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯", value: "\u202F", inline: false });

    const stats = {
      color: parseInt(member[0].color, 16),
      author: { name: channel.snippet.title },
      thumbnail: { url: (thumbnails.medium || thumbnails.default).url },
      fields: statFields
    }    //!consider adding a stat like top x in number of songs, in number of views per song, or number of total song views

    let currentPage = 0, currentSorting = [...dateDesc], sortType = "All", sortRule = null, currentSortRule = "Date Desc.", condensed = true, pages = Math.floor(currentSorting.length / (condensed ? 10 : 1)) + 1;
    await interaction.editReply({ embeds: [stats], components: [await createDropdown("details")] }).then(msg => {
      let collector = msg.createMessageComponentCollector({ time: 300000 });
      let currentMenu = "details";

      collector.on("collect", async i => {
        if (i.member.id !== interaction.member.id) return i.reply({ content: "You are not allowed to interact with an interaction that is not yours.", ephemeral: true });

        let collectionCooldown = await i.client.checkCooldown({ interaction: i, name: i.customId + "-" + msg.id, duration: 10 });
        if (collectionCooldown.status == "oncooldown") return i.client.interactionOnCooldown({ interaction: i, time: collectionCooldown.time });

        i.deferUpdate();
        let embeds, comp = [await createDropdown((i.values && ["details", "songs"].includes(i.values[0])) ? i.values[0] : currentMenu)];
        if (i.isButton() && !i.customId.includes("set")) currentPage = i.customId == "back" ? currentPage - 1 : currentPage + 1;

        if (i.isStringSelectMenu()) {
          switch (i.values[0]) {
            case "details": {
              embeds = [stats];
              currentPage = 0;
              currentSorting = [...dateDesc];
              pages = Math.floor(currentSorting.length / (condensed ? 10 : 1)) + 1
              condensed = true;
              break;
            }
            case "songs": {
              embeds = [await createCondensedEmbed(currentSorting, 0)];
              comp.push(await createSortDropdown("all"), await newButtons([new ButtonBuilder().setCustomId('setExpanded').setLabel("Expanded View").setStyle("Secondary")]));
              break;
            }
            default: {
              let originals = memberSongs.filter(x => x.type == 1), x = i.values[0];
              currentPage = 0, sortRule = x;

              if (x == "all") currentSorting = [...dateDesc], currentSortRule = "Date Desc.", sortType = "All";
              if (x == "originals") currentSorting = [...dateDesc].filter(x => originals.findIndex(y => y.video_id == x.id) !== -1), currentSortRule = "Date Desc.", sortType = "Originals";
              if (x == "covers") currentSorting = [...dateDesc].filter(x => originals.findIndex(y => y.video_id == x.id) == -1), currentSortRule = "Date Desc.", sortType = "Covers";
              if (x == "topic") currentSorting = [...topicVideos].sort((a, b) => new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt)), currentSortRule = "Date Desc.", sortType = "Topic Songs";
              if (x == "datedesc") currentSorting = currentSorting.sort((a, b) => new Date(b.snippet.publishedAt) - new Date(a.snippet.publishedAt)), currentSortRule = "Date Desc.";
              if (x == "dateasc") currentSorting = currentSorting.sort((a, b) => new Date(a.snippet.publishedAt) - new Date(b.snippet.publishedAt)), currentSortRule = "Date Asc.";
              if (x == "viewsdesc") currentSorting = currentSorting.sort((a, b) => b.statistics.viewCount - a.statistics.viewCount), currentSortRule = "Views Desc.";
              if (x == "viewsasc") currentSorting = currentSorting.sort((a, b) => a.statistics.viewCount - b.statistics.viewCount), currentSortRule = "Views Asc.";
              pages = Math.floor(currentSorting.length / (condensed ? 10 : 1)) + 1

              embeds = [condensed ? await createCondensedEmbed(currentSorting, currentPage) : await createSongEmbed(currentSorting[currentPage])];
              comp.push(await createSortDropdown(sortRule), await newButtons([new ButtonBuilder().setCustomId(condensed ? 'setExpanded' : 'setCondensed').setLabel(`${condensed ? 'Expanded' : 'Condensed'} View`).setStyle("Secondary")]));
            }
          }
        } else {
          if (i.customId.includes("set")) {
            condensed = i.customId == "setExpanded" ? false : true;
            pages = Math.floor(currentSorting.length / (condensed ? 10 : 1)) + 1
            currentPage = 0;
          }

          embeds = [condensed ? await createCondensedEmbed(currentSorting, currentPage) : await createSongEmbed(currentSorting[currentPage])];
          comp.push(await createSortDropdown(sortRule), await newButtons([new ButtonBuilder().setCustomId(condensed ? 'setExpanded' : 'setCondensed').setLabel(`${condensed ? 'Expanded' : 'Condensed'} View`).setStyle("Secondary")]));
        }

        interaction.editReply({ embeds: embeds, components: comp });
        if (i.isStringSelectMenu() && ["details", "songs"].includes(i.values[0])) currentMenu = i.values[0];
      });

      collector.on("end", collected => interaction.editReply({ embeds: interaction.embeds, components: [] }));
    });

    function newButtons( comps = [] ) {
      return new ActionRowBuilder({
        components: [
          new ButtonBuilder().setCustomId('back').setLabel('🠔').setStyle('Primary').setDisabled(currentPage == 0 ? true : false),
          new ButtonBuilder().setCustomId('pages').setLabel(`Page ${currentPage + 1}/${pages}`).setStyle('Secondary').setDisabled(true),
          new ButtonBuilder().setCustomId('forward').setLabel('🠖').setStyle('Primary').setDisabled(((pages == 1) || ((currentPage + 1) == pages)) ? true : false),
          ...comps
        ]
      }
      )
    }

    function createSongEmbed(video) {
      return {
        color: parseInt(member[0].color, 16),
        url: `https://www.youtube.com/watch?v=${video.id}`,
        author: { name: video.snippet.channelTitle, url: `https://www.youtube.com/channel/${video.snippet.channelId}` },
        title: `${video.snippet.title}`,
        fields: [
          { name: "Views", value: `${client.subscriberString(video.statistics.viewCount)}`, inline: true },
          { name: "Uploaded On", value: `<t:${Math.round(new Date(video.snippet.publishedAt.replace("T", " ").replace("Z", "")).getTime() / 1000)}:D>`, inline: true }
        ],
        image: { url: (video.snippet.thumbnails.maxres || video.snippet.thumbnails.default).url + "?" + Date.now() }
      };
    }

    function createCondensedEmbed(songs, page) {
      let fields = [], v = [...songs].slice(page * 10, page * 10 + 10), counter = 1;
      for (let song of v) {
        fields.push({
          name: `${counter + (page * 10)}. <t:${Math.round(new Date(song.snippet.publishedAt.replace("T", " ").replace("Z", "")).getTime() / 1000)}:D> - ${client.subscriberString(song.statistics.viewCount)} views`,
          value: `[${song.snippet.title}](https://www.youtube.com/watch?v=${song.id})`,
          inline: false
        });
        counter++;
      }
      return {
        color: parseInt(member[0].color, 16),
        author: { name: channel.snippet.title },
        image: { url: channel.brandingSettings.image ? channel.brandingSettings.image.bannerExternalUrl + config.ytbannerSize['2120x351'] : "" },
        fields: [
          { name: "Song Type", value: sortType, inline: true },
          { name: "Sorting", value: currentSortRule, inline: true },
          { name: "Results", value: songs.length, inline: true },
          ...fields
        ],
        footer: { text: `/songs ⠀•⠀ Page ${page + 1}/${Math.floor(songs.length / 10) + 1} ⠀•⠀ ${config.bot_name} v${package.version}` },
      }
    }

    function createDropdown(page) {
      return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('memberview').addOptions(
          { label: "General Details", value: "details", description: "General member song details", default: page == "details" ? true : false },
          { label: "Song Details", value: "songs", description: "Hololive member songs details", default: page == "songs" ? true : false },
        )
      );
    }

    function createSortDropdown(page) {
      return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('songsort').setPlaceholder("Sort Songs By:").addOptions(
          { label: "All Songs", value: "all", default: page == "all" ? true : false },
          { label: "Originals", value: "originals", default: page == "originals" ? true : false },
          { label: "Covers", value: "covers", default: page == "covers" ? true : false },
          { label: "Topic Songs", value: "topic", default: page == "topic" ? true : false },
          { label: "Date Desc. (Most Recent)", value: "datedesc", default: page == "datedesc" ? true : false },
          { label: "Date Asc.", value: "dateasc", default: page == "dateasc" ? true : false },
          { label: "Views Desc. (Most Popular)", value: "viewsdesc", default: page == "viewsdesc" ? true : false },
          { label: "Views Asc.", value: "viewsacs", default: page == "viewsacs" ? true : false },
        )
      );
    }
  }
}