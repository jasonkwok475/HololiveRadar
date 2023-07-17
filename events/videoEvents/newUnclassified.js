const { ActionRowBuilder, ButtonBuilder } = require("discord.js");
const Event = require('../../structures/event.js');
const database = require('../../functions/database.js');
const config = require('../../config/config.json');
const ytFormat = require("youtube-duration-format");
const { google } = require('googleapis');

module.exports = new Event("newUnclassified", async (client, videos) => {
  let idstrings = await client.sortVideos(videos);
  if (idstrings.strings.length == 0) return;
  for (var i = 0; i < idstrings.strings.length; i++) {
    getVideos(idstrings.strings[i], videos);
  }

  async function getVideos(ids, sqldata) {
    await google.youtube('v3').videos.list({
      auth: process.env.youtube_key,
      part: 'snippet,id,liveStreamingDetails,statistics,contentDetails',
      id: ids
    }).then(r => {
      database.addYoutubeRequestCount(1);
      if ((r.status !== 200) || (r.statusText !== "OK")) return client.log.error(`Error while requesting video data: \`\`\`${r.status} ${r.errors[0].message}: ${r.errors[0].reason}\`\`\``);

      let array = ids.split(",");
      for (i = 0; i < array.length; i++) {
        set(sqldata.filter(x => x.video_id == array[i])[0], r.data.items.filter(x => x.id == array[i])[0], i);
      }
    });
  }

  function set(sql, video, num) {
    setTimeout(() => sendUnclassified(sql, video), (num * 500));
  }

  async function sendUnclassified(data, video) {
    if (!video || !video.id || (video == {})) return await database.query(`UPDATE \`music_unclassified\` SET \`sent\`= '2' WHERE \`video_id\`='${data.video_id}'`).catch(e => { return this.client.log.errorSQL("UPDATE", "music_unclassified", e) });

    let { embeds, buttons } = await client.videos.getUnclassifiedComponents(video);

    client.channels.cache.get(config.unclassified_channel).send({ embeds, components: buttons });
    await database.query(`UPDATE \`music_unclassified\` SET \`sent\`= '1' WHERE \`video_id\`='${video.id}'`).catch(e => this.client.log.errorSQL("UPDATE", "music_unclassified", e));
  }
});
