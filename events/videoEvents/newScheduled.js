const { ActionRowBuilder, ButtonBuilder } = require("discord.js");
const Event = require('../../structures/event.js');
const database = require('../../functions/database.js');
const config = require('../../config/config.json');
const youtube = require('../../functions/youtube.js');

module.exports = new Event("newScheduled", async (client, videos) => {

  for (let video of videos) {
    if (video.sent == 1) continue;
    if ((new Date(video.premiere)).getTime() < Date.now()) {
      premierePassed(video);
      continue;
    } 
    sendUpcomingMusic(video, new Date(video.premiere));
  }

  async function premierePassed(video) {
    try {
      let { status, data, time } = await client.videos._checkPremiereTime("music", video.video_id);

      if (status == "premiered") return sendMusic(video, data);
      if (status == "ok") return sendUpcomingMusic(video, time);
      if (["early", "delayed"].includes(status)) {        
        if (new Date(time).getTime() < Date.now()) return sendMusic(video, data);
        sendUpcomingMusic(video, time);
      }
    } catch (e) {
      client.log.error(e);
    }
  }

  async function sendMusic(video, data) {
    try {
      let { results } = await database.query(`SELECT * FROM \`music\` WHERE \`video_id\`='${video.video_id}'`);
      if (results.length !== 0) {
        await database.query(`DELETE FROM \`music_scheduled\` WHERE \`video_id\`='${video.video_id}'`);
        return client.log.info(`${data.snippet.title} has already been sent in the music channel.`);
      }

      let channel = (await database.getAllMembers().catch(e => client.log.error(e))).filter(x => x.id == video.channel)[0];
      let type = video.type == 1 ? "Original" : "Cover";
      client.channels.cache.get(config.covers_channel).send(`**${channel.name}** Premiered a New **${type}** Song!\n<@&${config.music_role}> <@&${channel.role}>\nhttps://www.youtube.com/watch?v=${video.video_id}`).then(msg => msg.crosspost());
    } catch (e) {
      this.client.log.error(e);
    }

    if (video.message_id) await client.channels.cache.get(config.premieres_channel).messages.fetch(video.message_id).then(msg => { msg.delete(); });
    await database.query("SET character_set_results = 'utf8mb4', character_set_client = 'utf8mb4', character_set_connection = 'utf8mb4', character_set_database = 'utf8mb4', character_set_server = 'utf8mb4'");
    await database.query(`INSERT INTO music (title, video_id, channel, type, sent, plays, previous_views) VALUES ('${data.snippet.title.replace("'", "\\'")}', '${video.video_id}', '${video.channel}', '${video.type}', '1', '0', '0')`).catch(e => client.log.errorSQL("INSERT", "music", e));
    await database.query(`DELETE FROM \`music_scheduled\` WHERE \`video_id\`='${video.video_id}'`).catch(e => client.log.errorSQL("DELETE FROM", "music_scheduled", e));
    await database.query(`DROP TABLE IF EXISTS \`sched-${video.video_id}\``).catch(e => client.log.errorSQL("DROP TABLE", `sched-${video.video_id}`, e));
  }

  async function sendUpcomingMusic(video, time) {
    let data;
    try {
      let d = await youtube.getVideo({ client: client, id: video.video_id, part: 'snippet,id,liveStreamingDetails,statistics,contentDetails,topicDetails' });
      data = d.data;
    } catch (e) { client.log.error(e) }
    if ((data == [] || (data == undefined))) return client.log.error(`Video ID ${video.video_id} has been either privated or deleted. Unable to send an upcoming premiere message.`);

    let startTime = new Date(data.liveStreamingDetails.scheduledStartTime).getTime();
    if ((startTime - Date.now()) < 1000 * 60 * 5) return setTimeout(() => client.videos.sendScheduledMusic(video.video_id, data, video), startTime - Date.now());

    let channel = (await database.getAllMembers().catch(e => client.log.error(e))).filter(x => x.id == video.channel)[0] || {};
    if (channel == {}) return this.client.log.info(`No channel was found, scheduled video message was not sent.`);
    let thumbnail = data.snippet.thumbnails.maxres.url || data.snippet.thumbnails.default.url;

    const Button = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('notification-premiere-live').setLabel('Notify me on premiere').setStyle('Danger'),
      new ButtonBuilder().setCustomId('notification-premiere-5').setLabel('Remind me 5 minutes before').setStyle('Success')
    );

    const liveMessage = {
      color: parseInt(channel.color, 16),
      title: `Upcoming music premiere on Youtube`,
      description: data.snippet.title,
      url: `https://www.youtube.com/watch?v=${data.id}`,
      author: { name: data.snippet.channelTitle, url: `https://www.youtube.com/channel/${data.snippet.channelId}` },
      image: { url: thumbnail + "?" + Date.now()},
      fields: [{ name: "🕒 Premieres", value: `<t:${new Date(time).getTime() / 1000}:R>`, inline: true }],
      footer: { text: "Youtube", icon_url: config.youtube_icon },
      timestamp: new Date(time)
    }

    client.channels.cache.get(config.premieres_channel).send({ content: `<@&${config.premiere_role}> <@&${channel.role}>`, embeds: [liveMessage], components: [Button] }).then(async msg => {
      await database.query(`UPDATE \`music_scheduled\` SET \`sent\`='1', \`message_id\`='${msg.id}' WHERE \`video_id\`='${video.video_id}'`).catch(e => client.log.errorSQL("UPDATE", "music_scheduled", e));
      await database.query(`CREATE TABLE IF NOT EXISTS \`sched-${video.video_id}\` (id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(100), live_notif BOOLEAN COMMENT '0=false' DEFAULT '0', \`5_notif\` BOOLEAN COMMENT '0=false' DEFAULT '0')`).catch(e => client.log.errorSQL("CREATE TABLE", `sched-${video.video_id}`, e));
    });

    setTimer(video.video_id, startTime);
  }

  function setTimer(id, startTime) {
    let scheduled = client.scheduledVideos;
    if ((startTime - Date.now()) < 1000 * 60 * 60 * 24) {
      let timer = scheduled.get(id);
      let time = (startTime - Date.now()) < 1000 * 60 * 5 ? 0 : 1000 * 60 * 5;
      if (!timer) {
        scheduled.set(id, {type: "five", timeout: setTimeout(() => client.videos.sendNotification(id, "five", "music"), (startTime - Date.now() - time))});
        client.log.debug(`Successfully set the notification timer for a new scheduled video ID: ${id}`);
      }
    }
  }
});