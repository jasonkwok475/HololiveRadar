const { ActionRowBuilder, ButtonBuilder } = require("discord.js");
const Event = require('../../structures/event.js');
const database = require('../../functions/database.js');
const config = require('../../config/config.json');
const { categories } = require("../../config/categories.json");

module.exports = new Event("newLivestream", async (client, livestreams) => {
  for (let live of livestreams) { checkTime(live); }

  async function checkTime(live) {
    try {
      let { status, data, time } = await client.videos._checkPremiereTime("livestream", live.video_id);
      let difference = new Date(data.liveStreamingDetails.scheduledStartTime).getTime() - Date.now();

      //If the livestreams starts in less than 5 minutes, just set a timer for sending the message
      if (difference < 1000 * 60 * 5) return setTimeout(() => client.videos.sendLiveMessage(live.video_id, data, live), difference);

      if (status == "over") client.videos.finishedLive(live.video_id);
      if (status == "ok") sendUpcomingLive(live, data, time);
      if (["delayed", "early"].includes(status)) {
        if (data.liveStreamingDetails.actualStartTime) {
          client.videos.sendLiveMessage(data, live);
        } else sendUpcomingLive(live, data, time);
      }
    } catch (e) { client.log.error(e); }
  }

  async function sendUpcomingLive(data, video, time) {
    if (!video) return client.videos.setPrivateLivestream(video.id);
    if (video.liveStreamingDetails.actualStartTime) return client.videos.sendLiveMessage(video, data);

    let channel = await database.getMember(data.channel).catch(e => client.log.error(e));
    if (channel == {}) return client.log.error(`Channel was not found, livestream message was not sent for ID: ${video.id || data.video_id}`);
    let thumbnail = (video.snippet.thumbnails.maxres || video.snippet.thumbnails.default).url || "";

    const Button = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('notification-livestream-live').setLabel('Notify me when live').setStyle('Danger'),
      new ButtonBuilder().setCustomId('notification-livestream-10').setLabel('Remind me 10 minutes before').setStyle('Success')
    );

    const liveMessage = {
      color: parseInt(channel.color, 16),
      title: `Upcoming stream on Youtube`,
      description: video.snippet.title,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      author: { name: video.snippet.channelTitle, url: `https://www.youtube.com/channel/${video.snippet.channelId}` },
      image: { url: thumbnail + "?" + Date.now() },
      fields: [
        { name: "🕒 Live", value: `<t:${new Date(time) / 1000}:R>`, inline: true },
        { name: "Category", value: categories.filter(x => x.id == video.snippet.categoryId)[0].snippet.title, inline: true }
      ],
      footer: { text: "Youtube", icon_url: config.youtube_icon },
      timestamp: new Date(time)
    }

    client.channels.cache.get(config.upcoming_live).send({ content: `<@&${channel.role}>`, embeds: [liveMessage], components: [Button] }).then(async msg => {
      await database.query(`UPDATE \`livestreams\` SET \`sent\`='1', \`message_id\`='${msg.id}' WHERE \`video_id\`='${data.video_id}'`).catch(e => client.log.errorSQL("UPDATE", "livestreams", e));
      await database.query(`CREATE TABLE IF NOT EXISTS \`notifs-${data.video_id}\` (id INT AUTO_INCREMENT PRIMARY KEY, user_id VARCHAR(100), live_notif BOOLEAN COMMENT '0=false' DEFAULT '0', \`10_notif\` BOOLEAN COMMENT '0=false' DEFAULT '0')`).catch(e => client.log.errorSQL("CREATE TABLE", `notifs-${data.video_id}`, e));
    });

    setTimer(video);
  }

  function setTimer(video) {
    let livestreams = client.livestreams;
    let startTime = new Date(video.liveStreamingDetails.scheduledStartTime).getTime();
    if ((startTime - Date.now()) < 1000 * 60 * 60 * 24) {
      let timer = livestreams.get(video.id);
      let time = (startTime - Date.now()) < 1000 * 60 * 10 ? 0 : 1000 * 60 * 10;
      if (!timer) {
        livestreams.set(video.id, { type: "ten", timeout: setTimeout(() => client.videos.sendNotification(video.id, "ten", "livestream"), (startTime - Date.now() - time)) });
        client.log.debug(`Successfully set the notification timer for a new livestream ID: ${video.id}`);
      }
    }
  }
});
