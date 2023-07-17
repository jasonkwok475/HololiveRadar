const { EmbedBuilder, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ComponentType, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const fetch = require("node-fetch");
const config = require("../config/config.json");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, '../.env') });
const youtube = require("../functions/youtube.js");
const database = require("../functions/database.js");
const memberRole = require("../events/buttonInteractions/role.js");
const categories = require("../config/categories.json");
const { createCanvas, loadCanvas, loadImage } = require("canvas");
const note = "https://i.imgur.com/84bMeVA.png";
//!imgur.com links do not work for canvas, but i.imgur.com links might
//Test this out
const statsImg = "https://cdn-icons-png.flaticon.com/512/2636/2636334.png";//"https://imgur.com/j4Jgf1T.png";
const f = require("../scripts/functions.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName('member')
    .setDescription('Gets information about a Hololive Member')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('The name of the hololive member')
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
    let cooldown = await interaction.client.checkCooldown({ interaction, name: "member", duration: 300 });
    if (cooldown.status == "oncooldown") return interaction.client.interactionOnCooldown({ interaction, time: cooldown.time });
    
    await interaction.deferReply();
    const name = interaction.options.getString('name');

    let members = await database.getAllMembers().catch(e => {
      interaction.respond("Error retreiving channel data.");
      return interaction.client.log.error(e);
    });

    let member = members.filter(x => x.name.toLowerCase().includes(name.toLowerCase()));
    if (!member[0] || member == []) return await interaction.reply({ content: `\`${name}\ was not found. Please use the autocomplete function to get better results.`, ephemeral: true });
    if (member.length > 1) return await interaction.reply({ content: `More than one result was found. Please use the autocomplete function to get better results.`, ephemeral: true });

    let channelData = await youtube.getChannel({ client: interaction.client, id: member[0].link_id, part: "snippet,id,brandingSettings,statistics,contentDetails" }).catch(e => this.client.log.error(e));
    if (!channelData || channelData.status == "private") return interaction.reply({ content: `Unable to fetch channel data. Please contact a moderator for more information.`, ephemeral: true });
    let channel = channelData.data;


    //Interactions
    let userRoles = interaction.member._roles;
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`memberRoleCommand-${member[0].role}-memberCommand`).setLabel(userRoles.includes(member[0].role) ? "Remove Member Role" : 'Get Member Role').setStyle('Secondary'),
    );


    //Get all needed data
    let thumbnails = channel.snippet.thumbnails;
    let allSongs = await database.getAllSongs();
    let livestreams = (await database.query(`SELECT * FROM \`livestreams\` WHERE \`channel\`='${member[0].id}' AND \`sent\`='1' ORDER BY \`premiere\` ASC`)).results;
    let premieres = (await database.query(`SELECT * FROM \`music_scheduled\` WHERE \`channel\`='${member[0].id}' AND \`sent\`='1' ORDER BY \`premiere\` ASC`)).results;
    let memberSongs = [...allSongs].filter(x => x.channel == member[0].id).sort((a, b) => parseInt(b.views) - parseInt(a.views));
    
    let mostRecentSong = [...allSongs].filter(x => x.channel == member[0].id).sort((a, b) => b.id - a.id)[0];
    //!Use the upload field in the future to check for the most recent song
      //the songs tab is giving the wrong most reent song sometimes because of our insert order

    let videoIds = [];
    videoIds.push(...livestreams, ...premieres, memberSongs[0], mostRecentSong);

    let { strings } = await interaction.client.sortVideos(videoIds);
    let videos = [], premiere = [];

    for (let string of strings) {
      videos.push(...(await youtube.getVideos({ id: string })).data);
    }

    if (premieres.length > 1) {
      let video = videos.filter(x => x.id == preimeres[0].video_id)[0];
      premiere.push({
        color: parseInt(channel.color, 16),
        title: `Upcoming music premiere on Youtube`,
        description: video.snippet.title,
        url: `https://www.youtube.com/watch?v=${video.id}`,
        author: { name: video.snippet.channelTitle, url: `https://www.youtube.com/channel/${video.snippet.channelId}` },
        image: { url: (video.snippet.thumbnails.maxres || video.snippet.thumbnails.default).url + "?" + Date.now() },
        fields: [{ name: "🕒 Premieres", value: `<t:${new Date(premieres[0].premiere).getTime() / 1000}:R>`, inline: true }],
        footer: { text: "Youtube", icon_url: config.youtube_icon },
        timestamp: new Date(premieres[0].premiere)
      });
    }


    //Member details embed
    const channelMessage = {
      color: parseInt(member[0].color, 16),
      author: { name: channel.snippet.title },
      thumbnail: { url: (thumbnails.medium || thumbnails.default).url },
      fields: [
        { name: "Subscribers", value: `${f.subscriberString(channel.statistics.subscriberCount)}`, "inline": true },
        { name: "Generation", value: `${member[0].gen}`, inline: true },
        //{ name: "\u200b", value: "\u200b", inline: true },
        { name: "Fan Mark", value: `${member[0].fan_mark}`, inline: true },
        { name: "Role", value: `<@&${member[0].role}>`, inline: true },
        { name: "Fan Name", value: `${member[0].fan_name}`, inline: true },
        { name: "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯", value: `**Youtube**: [www.youtube.com/${channel.snippet.customUrl}](https://www.youtube.com/${channel.snippet.customUrl})`, "inline": false },
      ],
    };

    //? Since it is deprecated, make sure it exists before putting it in the embed
    if (channel.brandingSettings.image) channelMessage.image = { url: channel.brandingSettings.image.bannerExternalUrl + config.ytbannerSize['2120x351'] };


    //Livestream embeds
    let liveEmbed = {
      color: parseInt(member[0].color, 16),
      description: `${member[0].name} has no upcoming livestreams.`
    }

    let liveArray = [], currentPage = 0, pages = livestreams.length > 0 ? livestreams.length : 1;
    for (let live of livestreams) {
      let video = videos.filter(x => x.id == live.video_id)[0];
      let thumbnails = video.snippet.thumbnails;

      let embed = {
        color: parseInt(member[0].color, 16),
        description: video.snippet.title,
        url: `https://www.youtube.com/watch?v=${video.id}`,
        author: { name: video.snippet.channelTitle, url: `https://www.youtube.com/channel/${video.snippet.channelId}` },
        image: { url: (thumbnails.maxres || thumbnails.default).url + "?" + Date.now() },
        footer: { text: "Youtube", icon_url: config.youtube_icon }
      }

      if (live.status == 1) {
        let viewers = video.liveStreamingDetails.concurrentViewers ? f.subscriberString(video.liveStreamingDetails.concurrentViewers) : "-";
        embed.title = `Currently streaming on Youtube`;
        embed.fields = [
          { name: "Stream Started", value: `<t:${new Date(live.premiere) / 1000}:R>`, inline: true },
          { name: "Current Viewers", value: `${viewers}`, inline: true },
          { name: "Category", value: categories.categories.filter(x => x.id == video.snippet.categoryId)[0].snippet.title, inline: false }
        ];
        embed.timestamp = new Date();
      } else {
        embed.title = `Upcoming stream on Youtube`;
        embed.fields = [
          { name: "🕒 Live", value: `<t:${new Date(video.liveStreamingDetails.scheduledStartTime) / 1000}:R>`, inline: true },
          { name: "Category", value: categories.categories.filter(x => x.id == video.snippet.categoryId)[0].snippet.title, inline: true }
        ];
        embed.timestamp = new Date(video.liveStreamingDetails.scheduledStartTime);
      }
      liveArray.push(embed);
    }
    if (livestreams.length == 0) liveArray.push(liveEmbed);


    //Songs embed message
    let top = videos.filter(x => x.id == memberSongs[0].video_id)[0];
    let recent = videos.filter(x => x.id == mostRecentSong.video_id)[0];
    let allViews = memberSongs.reduce((a, b) => (a.views || a) + b.views);
    let songFields = [
      { name: "Statistics", value: `Songs: ${memberSongs.length}`, inline: true },
      { name: "Average Views/Song", value: `${f.subscriberString(Math.round(allViews / memberSongs.length))}`, inline: true },
      { name: `Most Popular Song - ${f.subscriberString(top.statistics.viewCount)} views`, value: `[${top.snippet.title}](https://www.youtube.com/watch?v=${top.id})`, inline: false },
      { name: `Most Recent Song - ${f.subscriberString(recent.statistics.viewCount)} views - <t:${Math.round(new Date(recent.snippet.publishedAt.replace("T", " ").replace("Z", "")).getTime() / 1000)}:R>`, value: `[${recent.snippet.title}](https://www.youtube.com/watch?v=${recent.id})`, inline: false },
    ]

    if (premieres.length > 0) {
      let video = videos.filter(x => x.id == premieres[0].video_id)[0];
      songFields.push({ name: "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯", value: `**Upcoming Song Premiere <t:${Math.round(new Date(premieres[0].premiere).getTime() / 1000)}:R>**:\n[${video.snippet.title}](https://www.youtube.com/watch?v=${video.id})`, "inline": false });
    }

    const songs = {
      color: parseInt(member[0].color, 16),
      author: { name: `Songs - ${member[0].name}`, icon_url: (thumbnails.medium || thumbnails.default).url },
      description: `Please use </songs:1104915325419524187> for more detailed information.`,
      thumbnail: { url: note },
      fields: songFields
    }


    //Stats embed message
    let statsPic = new AttachmentBuilder(await createThumbnail((thumbnails.medium || thumbnails.default).url, statsImg, "square"), { name: "stats.png" });
    const stats = {
      color: parseInt(member[0].color, 16),
      author: { name: `Statistics - ${member[0].name}` },
      thumbnail: { url: 'attachment://stats.png' },
      fields: [
        { name: "Subscribers", value: `${f.subscriberString(channel.statistics.subscriberCount)}`, "inline": true },
        { name: "Country", value: `${channel.snippet.country.toUpperCase()}`, inline: true },
        { name: "Created On", value: `<t:${Math.round(new Date(channel.snippet.publishedAt) / 1000)}:D>`, inline: true },
        { name: "Channel Type", value: `-`, inline: true },
        { name: "Videos", value: `${channel.statistics.videoCount}`, "inline": true },
        { name: "Total Views", value: `${f.subscriberString(channel.statistics.viewCount)}`, "inline": true },
        { name: "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯", value: `
        Uploaded Songs: ${memberSongs.length}
        Avg. Views/Video: ${f.subscriberString(Math.round(channel.statistics.viewCount / channel.statistics.videoCount))}
        Avg. Views/Song: ${f.subscriberString(Math.round(allViews / memberSongs.length))}
        Avg. Subscribers/Month: ${f.subscriberString(Math.round(channel.statistics.subscriberCount / f.monthDiff(new Date(channel.snippet.publishedAt), new Date())))}`, "inline": false },
      ]
    }
    //consider adding twitter stats

    //pie graph showing which percentage of views came from songs

    //!Use these two to show graphs on this embed
    //?Show graphs of views over time and subscribers over time
    //https://www.chartjs.org/docs/master/
    //https://socialblade.com/business-api



    //Collectors and responses
    await interaction.editReply({ embeds: [channelMessage], components: [await createDropdown("details"), buttons] }).then(msg => {
      if (premiere.length > 0) interaction.followUp({
        embeds: [premiere[0]], components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('notification-premiere-live').setLabel('Notify me on premiere').setStyle('Danger'),
          new ButtonBuilder().setCustomId('notification-premiere-5').setLabel('Remind me 5 minutes before').setStyle('Success')
        )], ephemeral: true
      });

      let collector = msg.createMessageComponentCollector({ time: 300000 });
      let currentMenu = "details";

      collector.on("collect", async i => {
        if (i.member.id !== interaction.member.id) return i.reply({ content: "You are not allowed to interact with an interaction that is not yours.", ephemeral: true });

        let collectionCooldown = await i.client.checkCooldown({ interaction: i, name: i.customId + "-" + msg.id, duration: 10 });
        if (collectionCooldown.status == "oncooldown") return i.client.interactionOnCooldown({ interaction: i, time: collectionCooldown.time });

        if (i.isButton() && i.customId.split("-")[0] == "memberRoleCommand") return memberRole.run(i, i.customId.split("-"), member[0].role);
        if (i.customId.split("-")[0] == "notification") return;

        i.deferUpdate();
        let embeds, addFiles = [];
        let comp = [await createDropdown(i.values ? i.values[0] : currentMenu), buttons];
        if (i.isButton()) currentPage = i.customId == "back" ? currentPage - 1 : currentPage + 1;

        const liveButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('back').setLabel('🠔').setStyle('Primary').setDisabled(currentPage == 0 ? true : false),
          new ButtonBuilder().setCustomId('pages').setLabel(`Page ${currentPage + 1}/${pages}`).setStyle('Secondary').setDisabled(true),
          new ButtonBuilder().setCustomId('forward').setLabel('🠖').setStyle('Primary').setDisabled(((pages == 1) || ((currentPage + 1) == pages)) ? true : false),
        )

        let livebutton = liveButtons;
        if (i.isStringSelectMenu()) {
          switch (i.values[0]) {
            case "details": {
              embeds = [channelMessage];
              break;
            }
            case "stats": {
              addFiles = [statsPic];
              embeds = [stats];
              break;
            }
            case "song": {
               embeds = [songs];
               break;
            }
            case "live": {
              embeds = [liveArray[0]];
              if (livestreams.length > 0) {
                if (livestreams[currentPage].status == 0) {
                  livebutton.addComponents(new ButtonBuilder().setCustomId('notification-livestream-live').setLabel('Notify me when live').setStyle('Danger'))
                } else livebutton.addComponents(new ButtonBuilder().setURL(`https://www.youtube.com/watch?v=${livestreams[currentPage].video_id}`).setLabel("Watch Stream").setStyle('Link'),);
                comp.unshift(livebutton);
              }
              break;
            }
          }
        } else {
          if (livestreams[currentPage].status == 0) {
            livebutton.addComponents(new ButtonBuilder().setCustomId('notification-livestream-live').setLabel('Notify me when live').setStyle('Danger'))
          } else livebutton.addComponents(new ButtonBuilder().setURL(`https://www.youtube.com/watch?v=${livestreams[currentPage].video_id}`).setLabel("Watch Stream").setStyle('Link'),);

          comp.unshift(livebutton);
          embeds = [liveArray[currentPage]];
        }

        interaction.editReply({ embeds: embeds, components: comp, files: addFiles });
        if (i.isStringSelectMenu()) currentMenu = i.values[0];
      });

      collector.on("end", collected => interaction.editReply({ embeds: interaction.embeds, components: [] }));
    });

    function createDropdown(page) {
      return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('memberview').addOptions(
          { label: "Member Details", value: "details", description: "General Hololive member details", default: page == "details" ? true : false },
          { label: "Livestreams", value: "live", description: "Upcoming and current livestreams", default: page == "live" ? true : false },
          { label: "Music and Songs", value: "song", description: "Song/Music information", default: page == "song" ? true : false },
          { label: "Statistics", value: "stats", description: "Youtube/Song statistics for the member", default: page == "stats" ? true : false }
        )
      );
    }

    function createThumbnail(background, image, type) {
      return new Promise(async (resolve, reject) => {
        try {
          const canvas = createCanvas(240, 240);
          const ctx = canvas.getContext('2d');

          let bg = await loadImage(background);
          let ratio = Math.min(canvas.width / bg.width, canvas.height / bg.height)
          let img = await loadImage(image);

          ctx.drawImage(bg, 0, 0, bg.width, bg.height, (canvas.width - bg.width * ratio) / 2, (canvas.height - bg.height * ratio) / 2, bg.width * ratio, bg.height * ratio);
          type == "square" ? square(150, 150, 90, 90) : round(150, 150, 90, 90, 10);
          ctx.clip();
          ctx.fillStyle = "white";
          ctx.fill();
          ctx.drawImage(img, 150, 150, 90, 90);
          ctx.restore();

          return resolve(canvas.toBuffer());

          function square(x, y, w, h) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + w, y);
            ctx.lineTo(x + w, y + h);
            ctx.lineTo(x, y + h);
            ctx.lineTo(x, y);
            ctx.closePath();
          }

          function round(x, y, width, height, radius) {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
          }
        } catch (e) {
          console.error(e);
          return reject(e);
        }
      });
    }
  },
};