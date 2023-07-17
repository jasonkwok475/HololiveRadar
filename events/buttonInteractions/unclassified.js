const { EmbedBuilder, ButtonBuilder, ActionRowBuilder } = require("discord.js");
const Event = require('../../structures/event.js');
const config = require('../../config/config.json');
const database = require('../../functions/database.js');
const youtube = require('../../functions/youtube.js');
const ytFormat = require("youtube-duration-format");
const { capitalize } = require("../../scripts/functions.js");

module.exports = new Event("unclassified", async (interaction, params) => {
  if (!interaction.member._roles.includes(config.admin_role) && !interaction.member._roles.includes(config.staff_role)) {
    return interaction.reply({ content: "You do not have the correct permissions to use this.", ephemeral: true });
  }

  let type = params[1], client = interaction.client;
  let id = await getVideoId(interaction);

  switch (type) {
    case "not_music":
    case "finished_livestream": { //works
      let msg = type == "not_music" ? "Other" : "Finished Livestream";
      await deleteSQL(id).then(() => {
        interaction.reply({ content: `Successfully classified video as "${msg}".`, ephemeral: true });
        interaction.message.delete();
        logClassification(msg);
      }).catch(e => {
        client.log.error(e);
        return interaction.reply({ content: "There was an error running this command. Please contact the developer.", ephemeral: true });
      });
      break;
    }
    case "premiered_song": { //works
      await checkKeywords(interaction).then(async songType => {
        await addSong(id, songType.toLowerCase()).then(msg => {
          let text = songType == "Cover" ? "a" : "an";
          interaction.reply({ content: `Successfully classified video as a \"Premiered Song\".\nAutomatically detected keywords and saved video as ${text} ${songType} Song.`, ephemeral: true });
          interaction.message.delete();

          logClassification(type.charAt(0).toUpperCase() + type.slice(1), "", `\nAutomatically detected and saved as ${text} ${songType} Song.`);
          deleteSQL(id);
        }).catch(e => interaction.reply({ content: e, ephemeral: true }));
      }).catch(e => interaction.reply({ content: e, ephemeral: true }));
      break;
    }
    case "premiere":
    case "livestream": {
      let video = (await youtube.getVideo({ client: interaction.client, id })).data;
      let unclassified = (await database.query(`SELECT * FROM \`music_unclassified\` WHERE \`video_id\`='${id}'`)).results[0];
    
      if (params[2]) return insertPremiere("manual", capitalize(params[2]), video, unclassified);
      
      let music = (await database.query(`SELECT * FROM \`${type == "premiere" ? "music_scheduled" : "livestreams"}\` WHERE \`video_id\`='${id}'`)).results;
      if (!music || !unclassified || unclassified == {} || !video) return interaction.reply({ content: "Error retreiving video data. Please contact an administrator.", ephemeral: true });
      let thumbnails = video.snippet.thumbnails;

      if (video.liveStreamingDetails.actualEndTime) {
        let embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setFields({ name: "Duration", value: `${ytFormat(video.contentDetails.duration)}`, inline: true })
          .setDescription(`**[${video.snippet.title}](https://www.youtube.com/watch?v=${video.id})**`)
          .setImage((thumbnails.maxres || thumbnails.default).url + "?" + Date.now());
        interaction.message.edit({
          embeds: [embed],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('unclassified-finished_livestream').setLabel('Finished Livestream').setStyle('Success'),
              new ButtonBuilder().setCustomId('unclassified-premiered_song').setLabel('Premiered Song').setStyle('Secondary'),
              new ButtonBuilder().setCustomId('unclassified-not_music').setLabel('Other').setStyle('Secondary'),
              new ButtonBuilder().setCustomId('unclassified-refresh').setLabel('Refresh').setStyle('Success')
            )
          ]
        })

        return interaction.reply({ content: `${type == "premiere" ? "Premiere song" : "Livestream"} has already finished. Please reclassify the video.`, ephemeral: true });
      } else {
        if (type == "premiere") {
          await checkKeywords(interaction).then(async songType => {
            insertPremiere("auto", songType, video, unclassified);
          }).catch(e => interaction.reply({ content: e, ephemeral: true }));
        } else {
          await database.query(`INSERT INTO \`livestreams\` (video_id, channel, premiere, sent, status) VALUES ('${id}', '${unclassified.channel}', '${video.liveStreamingDetails.scheduledStartTime}', '0', '0')`).then(() => {
            interaction.reply({ content: `Successfully classified video as an \"Upcoming Livestream\".`, ephemeral: true });
            interaction.message.delete();

            logClassification("Upcoming Livestream");
            deleteSQL(id);
          });
        }
      }
      break;
    }
    case "cover":
    case "original": { //works
      let admin = interaction.message.components.length > 1; //Premiered song override
      let title = interaction.message.embeds[0].data.description.split("]")[0].replace("**(", "");

      let songType = false;
      for (i = 0; i < config.keywords.length; i++) { if (title.includes(config.keywords[i])) songType = "song"; }
      if ((songType == false) && (!interaction.member._roles.includes(config.admin_role))) {
        return interaction.reply({ content: "Video title does not contain any song keywords. Please contact an administrator in order to classify video as an \"Original Song\".", ephemeral: true });
      }

      let unclassified = (await database.query(`SELECT * FROM \`music_unclassified\` WHERE \`video_id\`='${id}'`)).results[0];
      let music = (await database.query(`SELECT * FROM \`music\` WHERE \`video_id\`='${id}'`)).results;
      if (!music || !unclassified || unclassified == {}) return interaction.reply({ content: "Error retreiving video data. Please contact an administrator.", ephemeral: true });

      await addSong(id, type).then(msg => {
        interaction.reply({ content: msg, ephemeral: true });
        interaction.message.delete();

        logClassification(type.charAt(0).toUpperCase() + type.slice(1), {
          name: "**Note**",
          value: `Admin override as no keywords were detected from the song.`,
          inline: false
        });

        deleteSQL(id);
      }).catch(e => interaction.reply({ content: e, ephemeral: true }));
      break;
    }
    case "refresh": { //works 
      let video = (await youtube.getVideo({ client: interaction.client, id })).data;
      if (!video || video == {}) return interaction.reply({ content: "Error retreiving video data.", ephemeral: true });

      let { embeds, buttons } = await client.videos.getUnclassifiedComponents(video);

      await interaction.message.edit({ embeds, components: buttons });
      await interaction.deferUpdate();
      break;
    }
  }

  async function insertPremiere(type, songType, video, unclassified) {
    await database.query(`INSERT INTO \`music_scheduled\` (video_id, channel, type, sent, premiere) VALUES ('${id}', '${unclassified.channel}', '${songType == "Original" ? 1 : 0}', '0', '${video.liveStreamingDetails.scheduledStartTime.replace("T", " ").replace("Z", "")}')`).then(() => {
      let text = songType == "Cover" ? "a" : "an";
      interaction.reply({ content: `Successfully classified video as a \"Premiere Song\".\nAutomatically detected keywords and saved video as ${text} ${songType} Song.`, ephemeral: true });
      interaction.message.delete();

      logClassification("Premiere Song", type !== "auto" ? {
        name: "**Note**",
        value: `Admin override as no keywords were detected from the song.`,
        inline: false
      } : "", type == "auto" ? `\nAutomatically detected and saved as ${text} ${songType} Song.` : "");
      deleteSQL(id);
    });
  }

  function getVideoId(interaction) {
    let embed = interaction.message.embeds[0].data;
    let title = embed.description.split("=");
    return title[title.length - 1].replace(")**", "");
  }

  function logClassification(msg, note, des) {
    let thumbnail = interaction.message.embeds[0].data.image.url;
    let fields = [
      { name: "Video ID", value: id, inline: true },
      { name: "Video", value: `${interaction.message.embeds[0].data.description}`, inline: false },
      { name: "Channel", value: `${interaction.message.embeds[0].data.author.name}`, inline: false }
    ];

    if (note && note !== "") fields.push(note);

    client.log.classification({
      type: "embed",
      staff: interaction.member,
      title: "Classified Video",
      description: `Classified video as "**${msg}**".${des || ""}`,
      fields: fields,
      color: config.informationEmbedColor,
      thumbnail: thumbnail
    });
  }

  function deleteSQL(ID) {
    return new Promise(async (resolve, reject) => {
      await database.query(`DELETE FROM \`music_unclassified\` WHERE \`video_id\`='${ID}'`).then(r => {
        resolve();
      }).catch(e => reject(e));
    });
  }

  function addSong(id, type) {
    return new Promise(async (resolve, reject) => {
      let video = (await youtube.getVideo({ client: interaction.client, id })).data;

      let unclassified = (await database.query(`SELECT * FROM \`music_unclassified\` WHERE \`video_id\`='${id}'`)).results[0];
      let music = (await database.query(`SELECT * FROM \`music\` WHERE \`video_id\`='${id}'`)).results;
      if (!music || !unclassified || unclassified == {}) return reject("Error retreiving video data. Please contact an administrator.");
      if (music.length !== 0) return reject("Error classifying video. Video has already been saved in music. Please contact an administrator.");

      await database.query(`INSERT INTO \`music\` (title, video_id, channel, type, sent) VALUES ('${video.snippet.title}', '${unclassified.video_id}', '${unclassified.channel}', '${type == "original" ? 1 : 0}', '0')`).then(r => {
        return resolve(`Successfully classified video as a \"${type.charAt(0).toUpperCase() + type.slice(1)} Song\".`);
      }).catch(e => {
        interaction.client.log.error(e);
        return reject("Error inserting data into database.");
      });
    });
  }

  function checkKeywords(interaction) {
    return new Promise((resolve, reject) => {
      let songType = false;
      let title = interaction.message.embeds[0].data.description.split("]")[0].replace("**(", "");

      //use foreach or some instead of for here
      for (i = 0; i < config.keywords.length; i++) {
        if (title.toLowerCase().includes(config.keywords[i])) songType = "Original";
      }
      for (i = 0; i < config.cover_keywords.length; i++) {
        if (title.toLowerCase().includes(config.cover_keywords[i])) songType = "Cover";
      }

      if (songType == false) {
        if (!interaction.member._roles.includes(config.admin_role)) {
          return reject("Video title does not contain any song keywords. Please contact an administrator in order to classify this video.");
        } else {
          interaction.message.edit({
            embeds: [interaction.message.embeds[0]],
            components: [
              interaction.message.components[0],
              new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('unclassified-premiere-original').setLabel('Original Song').setStyle('Primary'),
                new ButtonBuilder().setCustomId('unclassified-premiere-cover').setLabel('Cover Song').setStyle('Primary')
              )
            ]
          });
          return reject("No keywords were found. Please confirm whether the song is an Original or Cover.");
        }
      } else resolve(songType);
    });
  }
});