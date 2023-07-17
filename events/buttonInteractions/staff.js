const Event = require('../../structures/event.js');
const config = require('../../config/config.json');
const database = require('../../functions/database.js');
const youtube = require('../../functions/youtube.js');
const deployCommands = require('../../scripts/deploy-commands.js');

module.exports = new Event("staff", async (interaction, params) => {
  let user = await interaction.client.guilds.cache.get(config.logging).members.fetch(interaction.member.id);
  if (!user._roles.includes(config.creator_role)) {
    return interaction.reply({ content: "You do not have the correct permissions to use this.", ephemeral: true });
  }

  let type = params[1], client = interaction.client;

  switch (type) {
    case "enableRadio":
    case "disableRadio": {
      client.player.disabled = type == "enableRadio" ? false : true;
      let action = client.player.disabled ? "disabled" : "enabled";
      interaction.reply({ content: `Radio has been ${action}.`, ephemeral: true });

      client.log.staff({
        type: "embed",
        color: config.informationEmbedColor,
        staff: interaction.member,
        title: `Radio ${action}`,
        description: `Hololive radio has been manually ${action} by a staff member.`
      });

      let buttons = interaction.message.components;
      buttons[0].components[0].data.label = `${client.player.disabled ? "Enable" : "Disable"} Radio`;
      buttons[0].components[0].data.customId = `${client.player.disabled ? "enable" : "disable"}Radio`;
      interaction.message.edit({ embeds: interaction.message.embeds, components: buttons });

      const b = require("../../config/botdata.json");
      b.playerDisabled = type == "enableRadio" ? false : true;
      fs.writeFile('./../config/botdata.json', JSON.stringify(b, null, "  "), (err) => {
        if (err) console.error(err);
      });

      break;
    }
    case "resendWeekly": {
      let cooldown = await interaction.client.checkCooldown({ interaction, name: interaction.customId, duration: 60 });
      if (cooldown.status == "oncooldown") return interaction.client.interactionOnCooldown({ interaction, time: cooldown.time });

      resendWeekly();
      interaction.reply({ content: "Successfully resent this weeks top 10 song messages.", ephemeral: true })
      break;
    }
    case "debug": {
      interaction.deferUpdate();
      let buttons = interaction.message.components;
      buttons[1].components[1].data.label = `${client.debugBot ? "Enable" : "Disable"} Debug Logs`;
      interaction.message.edit({ embeds: interaction.message.embeds, components: buttons });
      client.debugBot = client.debugBot ? false : true;
      break;
    }
    case "resetRadio": {
      client.player.initialized = false;
      let queue = client.player.nodes.get(config.guildID);
      await queue.delete();
      client.player.initQueue({ playlist: config.playlists.all });

      interaction.reply({ content: "Resetting the radio.", ephemeral: true });
      client.log.staff({
        type: "embed",
        color: config.informationEmbedColor,
        staff: interaction.member,
        title: "Radio Reset",
        description: `Hololive radio has been manually reset by a staff member.`
      });
      break;
    }
    case "deployCommands": {
      deployCommands.run();
      interaction.reply({ content: 'Successfully redeployed slash commands.', ephemeral: true });
      break;
    }
    case "sendRules": {
      interaction.client.sendRules();
      interaction.deferUpdate();
      break;
    }
    // case "video": {
    //   addVideos();
    //   interaction.deferUpdate();
    //   break;
    // }
  }

  // async function addVideos() {
  //   let { results } = await database.query(`SELECT * FROM \`music_topic\` WHERE \`playlist\`='0' ORDER BY \`id\` ASC LIMIT 10`);
  //   for (let i = 0; i < results.length; i++) { set(results[i], i, interaction.client); }

  //   function set(row, num, client) {
  //     setTimeout(() => client.playlist.addSong(row, row.video_id, "topic"), num * 5000);
  //   }
  // }

  async function resendWeekly() {
    let thisWeek = await client.videos.getLastWeekTopSongs();
    let ids = [];
    for (let song of thisWeek.songs) { ids.push(song.id); }

    //Delete the old weekly messages from the channel
    let channel = await client.channels.cache.get(config.weekly_channel);
    let old = Array.from(await channel.messages.fetch());
    await channel.bulkDelete(old.length + 5).catch(e => client.log.error(e));

    let videos = (await youtube.getVideos({ id: ids.join(",") })).data;

    //Create and send the weekly top song embed messages
    let messages = [], content = [], counter = 0;
    let lastWeekSongs = await getLastWeekTopSongs();
    let { up, down, neutral, newsong } = config.weeklyEmojis;

    for (let song of thisWeek.songs) {
      let { msg, embed } = await createMessage(song, videos.filter(x => x.id == song.id)[0], counter, client);
      content.push(msg);
      messages.push(embed);
      counter++;
    }

    messages = messages.reverse();
    messages.push(await finalMessage(content));

    await client.wait(5000);
    for (let p = 0; p < messages.length; p++) { sendEmbed(messages[p], p, client); }

    function sendEmbed(msg, num, client) {
      setTimeout(() => {
        client.channels.cache.get(config.weekly_channel).send({ content: num == (messages.length - 1) ? `<@&${config.weekly_role}>` : "", embeds: [msg] });
      }, num * 5000);
    }

    async function finalMessage(c) {
      return {
        color: config.informationEmbedColor,
        title: "Weekly Top 10 Hololive Songs",
        description: `Ranking of the top 10 Hololive songs from <t:${Math.round(lastWeekSongs.time / 1000)}:d> to <t:${Math.round(thisWeek.time / 1000)}:d> based on views.`,
        fields: c
      };
    }

    async function createMessage(song, vid, num, f) {
      return new Promise(async (resolve, reject) => {
        let fields = [
          { name: "Views", value: `${f.subscriberString(song.views)} (+${f.commaNumber(song.views - song.previous_views)})`, inline: true },
          { name: "Uploaded On", value: `<t:${Math.round(new Date(vid.snippet.publishedAt.replace("T", " ").replace("Z", "")).getTime() / 1000)}:D>`, inline: true }
        ];

        let text, emoji, statsong = lastWeekSongs.songs.filter(x => x.id == song.id);
        let views = `${f.subscriberString(song.views)}⠀(+${f.commaNumber(song.views - song.previous_views)})`;
        let positionText;

        if (song.previous_views == 0) {
          emoji = newsong;
          fields[0] = { name: "Views", value: `+${f.commaNumber(song.views)}`, inline: true };
          views = `+${f.commaNumber(song.views)}`;
          positionText = { name: "⠀", value: `New Song!`, inline: true };
        } else if (statsong.length !== 0) {
          let position = parseInt(statsong[0].position);
          positionText = { name: "Last Week", value: `Previously in #${statsong[0].position}`, inline: true };
          emoji = position == (num + 1) ? neutral : (position < (num + 1) ? down : up);
        } else {
          emoji = up;
          positionText = { name: "⠀", value: `New in Top 10!`, inline: true };
        }

        fields.push(positionText);
        let members = await database.getAllMembers();
        let channel = members.filter(x => x.link_id == vid.snippet.channelId)[0]

        const embed = {
          color: parseInt(channel.color, 16),
          url: `https://www.youtube.com/watch?v=${song.id}`,
          author: { name: vid.snippet.channelTitle, url: `https://www.youtube.com/channel/${vid.snippet.channelId}` },
          title: `${emoji}⠀**${num + 1}**. ${vid.snippet.title}`, //Add blank space after number
          fields: fields,
          image: { url: (vid.snippet.thumbnails.maxres || vid.snippet.thumbnails.default).url + "?" + Date.now()}
        };

        let field = {
          name: `${emoji} **${num + 1}**. ⠀${views}`,
          value: `[${vid.snippet.title}](https://www.youtube.com/watch?v=${song.id})\n`,
          inline: false
        }

        resolve({ msg: field, embed });
      });
    }
  }

  function getLastWeekTopSongs() {
    return new Promise(async (resolve, reject) => {
      let { results } = await database.query(`SELECT * FROM \`music_weekly_stats\` WHERE \`id\`=(SELECT MAX(id - 1) FROM \`music_weekly_stats\`)`).catch(e => { this.client.log.error(e); reject(e); });
      let stats = { time: results[0].week, top: {}, songs: [] };

      for (let i = 0; i < 10; i++) {
        let song_stats = results[0][`${i + 1}`].split("#");
        stats.top[`${i + 1}`] = song_stats[0];
        stats.songs.push({
          position: i + 1,
          id: song_stats[0],
          views: song_stats[1],
          previous_views: song_stats[2]
        });
      }

      resolve(stats);
    });
  }
});