const { ActionRowBuilder, ButtonBuilder, EmbedBuilder } = require("discord.js");
const EventEmitter = require('events');
const database = require('../functions/database.js');
const youtube = require('../functions/youtube.js');
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, '../.env') });
const categories = require("../config/categories.json");
const config = require("../config/config.json");
const ytFormat = require("youtube-duration-format");


//!TEMP
const fs = require("fs");
/**
 * @class
 * @classdesc Module to handle all video events and notifications
 */
class VideoHandler extends EventEmitter {
  timers = {};

  constructor(client) {
    super();
    this.client = client;
  }

  /**
   * Initiate the videos handler
   */
  async init() {

    //Sets the alerts for the livestreams/videos happening in the next 24h
    this._checkUpcomingScheduled();
    this._checkUpcomingLivestreams();

    this._setWeeklySongUpdate();

    this.timers.checkMusic = setInterval(() => this._checkNewMusic(), 1000 * 60 * 5); //Check for unsent music notifications
    this.timers.checkTopic = setInterval(() => this._checkNewTopic(), 1000 * 60 * 5); //Check for unsent topic music
    this.timers.checkUnclassified = setInterval(() => this._checkUnclassified(), 1000 * 60 * 5); //Check for unsent unclassified videos
    this.timers.checkScheduled = setInterval(() => this._checkScheduled(), 1000 * 60 * 5); //Check unsent scheduled videos
    this.timers.checkLivestreams = setInterval(() => this._checkLivestreams(), 1000 * 60 * 5); //Check unsent livestream alerts
    this.timers.checkStillLive = setInterval(() => this._checkStillLive(), 1000 * 60 * 5); //Check if the livestreams are still live
    this.timers.checkSongsinPlaylist = setInterval(() => this.checkSongsinPlaylist(), 1000 * 60 * 60);
    //!Make a function to add topic songs into playlist, or put it in the new topic song file, which would work too

    //Check every hour to set timeouts for the scheduled videos/livestreams happening in the next day
    this.timers.checkUpcomingScheduled = setInterval(() => this._checkUpcomingScheduled(), 1000 * 60 * 60);
    this.timers.checkUpcomingLivestreams = setInterval(() => this._checkUpcomingLivestreams(), 1000 * 60 * 60);
  }

  async _setWeeklySongUpdate() {
    let { results } = await database.query(`SELECT * FROM \`apiusage\` WHERE \`id\`='4'`);

    if (results[0].next_reset < Date.now()) {
      this._weeklySongUpdate(results[0]);
    } else {
      this.timers.weeklySongUpdate = setTimeout(() => this._weeklySongUpdate(results[0]), (results[0].next_reset - Date.now()));
    }
  }

  async _checkUnclassified() {
    let videos = (await database.query("SELECT * FROM music_unclassified WHERE sent='0'").catch(e => this.client.log.errorSQL("SELECT", "music_unclassified", e))).results;
    if (videos.length > 0) this.emit("newUnclassified", videos);
  }

  async _checkScheduled() {
    let videos = (await database.query(`SELECT * FROM \`music_scheduled\` WHERE \`sent\`='0'`).catch(e => this.client.log.errorSQL("SELECT", "music_scheduled", e))).results;
    if (videos.length > 0) this.emit(`newScheduled`, videos);
  }

  async _checkLivestreams() {
    let results = (await database.query("SELECT * FROM livestreams WHERE `status`='0' AND `sent`='0'").catch(e => this.client.log.errorSQL("SELECT", "livestreams", e))).results;
    if (results.length > 0) this.emit(`newLivestream`, results);
  }

  async _checkNewMusic() {
    try {
      let songs = (await database.query("SELECT * FROM music WHERE sent=0 ORDER BY id ASC")).results;
      if (songs.length == 0) return;
      let channels = (await database.query("SELECT * FROM channels")).results;

      for (var i = 0; i < songs.length; i++) {
        this.emit("newSong", songs[i], channels.filter(x => x.id == songs[i].channel)[0]);
      }
    } catch (e) { this.client.log.error(e); }
  }

  async _checkNewTopic() {
    try {
      let songs = (await database.query("SELECT * FROM music_topic WHERE sent=0 ORDER BY id ASC")).results;
      if (songs.length == 0) return;

      for (let song of songs) {
        this.emit("newTopic", song);
      }
    } catch (e) { this.client.log.error(e); }
  }

  _checkPremiereTime(type, id) { //type="music"||"livestream"
    return new Promise(async (resolve, reject) => {
      let youtubeData, video;
      try {
        youtubeData = await youtube.getVideo({ client: this.client, id: id, part: "snippet,id,liveStreamingDetails,statistics" }).catch(e => reject(e));
        video = (await database.query(`SELECT * FROM \`${type == "music" ? "music_scheduled" : "livestreams"}\` WHERE \`video_id\`='${id}'`)).results[0];
      } catch (e) { return this.client.log.error(e); }

      let { status, data } = youtubeData;
      if (status == "private") {
        this.setPrivateLivestream(id);
        return reject(`No video found/Privated video for ${type} ID: ${id}`);
      }
      if ((data == []) || !data) return reject(`No data received for ${type} ID: ${id}`);
      let live = data.liveStreamingDetails;
      if (!live) return reject(`liveStreamingDetails object not present for ${type} ID: ${id}`);

      let startTime = new Date(live.scheduledStartTime).getTime();
      let oldStartTime = new Date(video.premiere).getTime();
      let premiereTime = live.scheduledStartTime.toString().split("T").join(" ").slice(0, -1);
      if (live.actualEndTime) return resolve({ status: type == "music" ? "premiered" : "over", data, sql: video, time: premiereTime });

      let result = { data, sql: video, time: premiereTime, status: "ok" };
      if (startTime !== oldStartTime) {
        result.status = oldStartTime > startTime ? "early" : "delayed";

        let table = type == "music" ? "music_scheduled" : "livestreams";
        await database.query(`UPDATE \`${table}\` SET \`premiere\`='${premiereTime}' WHERE \`video_id\`='${id}'`).catch(e => client.log.errorSQL("UPDATE", table, e));
        this.client.channels.cache.get(type == "music" ? config.premieres_channel : config.upcoming_live).messages.fetch(video.message_id).then(async msg => {
          let embed = msg.embeds[0];
          embed.fields[0].value = `<t:${startTime / 1000}:R>`;
          await msg.edit({ embeds: [embed], components: msg.components });
        }).catch(e => this.client.log.error(`Failed to update upcoming ${type} time: ${e}`));
      }

      return resolve(result);
    });
  }

  async _checkUpcomingLivestreams() {
    try {
      let { results } = await database.query(`SELECT * FROM \`livestreams\` WHERE \`sent\`='1' AND \`status\`='0'`);
      let videos = results.filter(x => (new Date(x.premiere).getTime() - Date.now()) < 1000 * 60 * 60 * 24);
      let scheduled = this.client.livestreams;

      for (const video of videos) {
        let timer = scheduled.get(video.video_id);
        if (!timer) {
          let data = await youtube.getVideo({ client: this.client, id: video.video_id });
          if (data.status == "private") return this.setPrivateLivestream(video.video_id);

          let type = (new Date(video.premiere).getTime() - Date.now()) > (1000 * 60 * 10) ? "ten" : "live";
          let time = type == "ten" ? (1000 * 60 * 10) : 0;

          scheduled.set(video.video_id, { type: type, timeout: setTimeout(() => this.client.videos.sendNotification(video.video_id, type, "livestream"), (new Date(video.premiere).getTime() - Date.now() - time)) });
          this.client.log.debug(`Successfully set the notification timer for livestream ID: ${video.video_id}`);
        }
      }
    } catch (e) { this.client.log.error(e); }
  }

  async _checkStillLive() {
    let sql, self = this, client = this.client;
    try {
      sql = await database.query("SELECT * FROM \`livestreams\` WHERE \`status\`='1'");
    } catch (e) { client.log.error(e); }
    if (sql.results.length == 0) return;
    let { strings, videos } = await client.sortVideos(sql.results);
    
    let ids = [];
    for (let string of strings) { 
      ids.push(...string.split(","));
      getVideos(string, sql.results); 
    }

    async function getVideos(id, sql) {
      try {
        let { status, data } = await youtube.getVideos({ id }), array = id.split(",");
        for (let id of array) {
          self.updateLiveMessage(id, sql.filter(x => x.video_id == id)[0], data.filter(x => x.id == id)[0]);
        }
      } catch (e) { client.log.error(e); }
    }

    let messages = [...(await client.channels.cache.get(config.current_live).messages.fetch()).values()];
    for (let message of messages) {
      let embed = message.embeds[0].data;
      let id = (new URL(embed.url)).searchParams.get("v");
      if (ids.includes(id)) continue;
      message.delete();
    }
  }

  async _streamNotYetLive(id, sql, video) {
    let timeDifference = new Date(video.liveStreamingDetails.scheduledStartTime).getTime() - Date.now();
    if (timeDifference < 0) return this.updateLiveMessage(id, sql, video, "Waiting on streamer to start...");
    if (timeDifference < (1000 * 60 * 5)) return;
    await this.client.channels.cache.get(config.current_live).messages.fetch(sql.message_id).then(msg => msg.delete());
    await database.query(`UPDATE \`livestreams\` SET \`sent\`='0', \`status\`='0', \`premiere\`='${video.liveStreamingDetails.scheduledStartTime.toString().split("T").join(" ").slice(0, -1)}' WHERE \`video_id\`='${id}'`).catch(e => this.client.log.error(e));
  }

  async updateLiveMessage(id, sql, video, text) {
    if (!sql.id) return this.client.log.error("No SQL data was forwarded to update the message for livestream ID: " + id);

    if (!video || !video.id || (video == {})) return this.setPrivateLivestream(id); //Privated/Archived stream
    if (video.liveStreamingDetails.actualEndTime) return this.finishedLive(id); //Stream has ended
    if (!text && !video.liveStreamingDetails.actualStartTime) return this._streamNotYetLive(id, sql, video); //Stream is not live yet and was for some reason sent

    let channelMessages = this.client.channels.cache.get(config.current_live).messages;
    channelMessages.fetch(sql.message_id).then(msg => {
      let thumbnails = video.snippet.thumbnails, details = video.liveStreamingDetails;
      let viewers = details.concurrentViewers ? this.client.subscriberString(details.concurrentViewers) : "-";

      const liveMessage = EmbedBuilder.from(msg.embeds[0])
        .setDescription(video.snippet.title)
        .setImage((thumbnails.maxres || thumbnails.default).url + "?" + Date.now())
        .setFields(
          { name: "🕒 Live", value: `<t:${new Date(sql.premiere) / 1000}:R>`, inline: true },
          { name: "Current Viewers", value: `${text || viewers}`, inline: true },
          { name: "Category", value: categories.categories.filter(x => x.id == video.snippet.categoryId)[0].snippet.title, inline: false }
        )
        .setTimestamp();

      msg.edit({ embeds: [liveMessage] }).catch(err => this.client.log.error(`Error updating message for livestream ID: ${id}\`\`\`${err}\`\`\``));
    }).catch(e => this.client.log.info(`Message was not found for livestream ${id} with message ${sql.message_id} in <#${config.current_live}>. \`\`\`${e}\`\`\``));
  }

  async setPrivateLivestream(id) { this._deleteLivestreamData(id, "private"); }
  async finishedLive(id) { this._deleteLivestreamData(id, "finished"); }

  async _deleteLivestreamData(id, type) {
    //!Consider DMing members if the stream hasn't gone live and is privated
    let sql = (await database.query(`SELECT * FROM \`livestreams\` WHERE \`video_id\`='${id}'`)).results[0];
    if (sql?.message_id) {
      await this.client.channels.cache.get(config.current_live).messages.fetch(sql.message_id).then(msg => msg.delete()).catch(e => { });
      await this.client.channels.cache.get(config.upcoming_live).messages.fetch(sql.message_id).then(msg => msg.delete()).catch(e => { });
    }
    await database.query(`DELETE FROM \`livestreams\` WHERE \`video_id\`='${id}'`);
    await database.query(`DROP TABLE IF EXISTS \`notifs-${id}\``).then(r => this.client.log.debug(`Deleted table for ${type} livestream: notifs-${id}`));
  }

  /**
   * Send a currently live embed message
   * @param {object} video Youtube API video data
   */
  async sendLiveMessage(id, video, sql) {
    let client = this.client;
    const Button = new ActionRowBuilder().addComponents(new ButtonBuilder().setURL(`https://www.youtube.com/watch?v=${id}`).setLabel('Watch Stream').setStyle('Link'),);
    let viewers = video.liveStreamingDetails?.concurrentViewers ? client.subscriberString(video.liveStreamingDetails.concurrentViewers) : "-";
    let channel = await database.getMember(sql.channel).catch(e => client.log.error(e));
    if (!channel) return client.log.info("Channel was not found, Live message was not sent for ID: " + sql.video_id);

    const liveMessage = {
      color: parseInt(channel.color, 16),
      title: `Currently streaming on Youtube`,
      description: video.snippet.title,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      author: { name: video.snippet.channelTitle, url: `https://www.youtube.com/channel/${video.snippet.channelId}` },
      image: { url: (video.snippet.thumbnails.maxres || video.snippet.thumbnails.default).url + "?" + Date.now() },
      fields: [
        { name: "Stream Started", value: `<t:${new Date(sql.premiere) / 1000}:R>`, inline: true },
        { name: "Current Viewers", value: `${viewers}`, inline: true },
        { name: "Category", value: categories.categories.filter(x => x.id == video.snippet.categoryId)[0].snippet.title, inline: false }
      ],
      footer: { text: "Youtube", icon_url: config.youtube_icon },
      timestamp: new Date()
    }

    if (sql.message_id) await client.channels.cache.get(config.upcoming_live).messages.fetch(sql.message_id).then(msg => { msg.delete(); }).catch(e => this.client.log.error(`Error deleting upcoming live message: ${e}`));
    await client.channels.cache.get(config.current_live).send({ content: `<@&${channel.role}>`, embeds: [liveMessage], components: [Button] }).then(async msg => {
      await database.query(`UPDATE \`livestreams\` SET \`status\`='1', \`message_id\`='${msg.id}' WHERE \`video_id\`='${sql.video_id}'`).catch(e => this.client.log.error(e));
    });
  }

  /**
   * Send a DM notification for either an upcoming premiere song or livestream
   * @param {string} id Youtube video ID
   * @param {"ten"|"five"|"live"} type 
   * @param {"music"|"livestream"} notifType Notification type
   */
  async sendNotification(id, type, notifType) {
    let check;
    try {
      check = await this._checkPremiereTime(notifType, id);
    } catch (e) { return this.client.log.debug(e); }
    let { status, data, time, sql } = check;
    let videos = notifType == "music" ? this.client.scheduledVideos : this.client.livestreams;
    let sendFunction = notifType == "music" ? this.sendScheduledMusic.bind(this) : this.sendLiveMessage.bind(this);
    let notificationTime = (type == "live" ? 0 : type == "ten" ? 10 : 5) * 1000 * 60;
    let startTime = new Date(time).getTime();

    switch (status) {
      case "premiered":
      case "over": {
        videos.delete(id);

        if (notifType == "livestream") {
          this.finishedLive(id);
        } else {
          if ((Date.now() - new Date(time)) < (1000 * 60)) this._DMUserNotification({ id, data, type, notifType }); //If it ended within a minute, still send the notification
          this.sendScheduledMusic(id, data, sql);
        }
        break;
      }
      case "ok":
      case "early": {
        let sendData = { id, data, type, notifType };
        if (status == "early") sendData.time = time;
        this._DMUserNotification(sendData);

        if (type == "live") {
          videos.delete(id);
          sendFunction(id, data, sql);
        } else {
          videos.set(id, { type: "live", timeout: setTimeout(() => this.sendNotification(id, "live", notifType), (startTime - Date.now())) });
        }
        break;
      }
      case "delayed": {
        if ((startTime - Date.now()) < 2000000000) return videos.delete(id); //If for some reason it got delayed by a month
        videos.set(id, { type: type, timeout: setTimeout(() => this.sendNotification(id, type, notifType), (startTime - Date.now() - notificationTime)) });
        break;
      }
      default: { this.client.log.debug(`No status was provided when checking the premiere time for livestream ID ${id}`); }
    }
  }

  async _DMUserNotification({ id, data, type, notifType, time }) {
    let sql, videos = notifType == "music" ? this.client.scheduledVideos : this.client.livestreams;
    let tablename = notifType == "music" ? "sched" : "notifs";
    try {
      sql = await database.query(`SELECT * FROM \`${tablename}-${id}\``);
    } catch (e) { return this.client.log.error(e); }
    let { results } = sql;

    for (let i = 0; i < results.length; i++) {
      await this.client.wait(30); //Ensures the bot doesn't get rate limited
      if (type == "live") {
        if (results[i].live_notif == 0) continue;
        const notification = {
          color: config.youtubeEmbedColor,
          title: `${data.snippet.channelTitle} ${notifType == "music" ? "is premiering on Youtube" : "is live on Youtube"}`,
          description: `${data.snippet.title}`,
          image: { url: (data.snippet.thumbnails.maxres || data.snippet.thumbnails.default).url + "?" + Date.now() },
          footer: { text: "Youtube", icon_url: config.youtube_icon },
          timestamp: new Date()
        }

        const Button = new ActionRowBuilder().addComponents(new ButtonBuilder().setURL(`https://www.youtube.com/watch?v=${id}`).setLabel(`${notifType == "music" ? "Video Link" : "Watch Stream"}`).setStyle('Link'),);

        this.client.users.cache.get(results[i].user_id).send({ embeds: [notification], components: [Button] });
      } else {
        let msg = "";
        if ((type == "five") && (results[i]["5_notif"] == 1)) msg = `${data.snippet.channelTitle} is premiering ${time ? "soon" : "in 5 minutes"}: ${data.snippet.title}`;
        if ((type == "ten") && (results[i]["10_notif"] == 1)) msg = `${data.snippet.channelTitle} will be live on Youtube in 10 minutes!`;
        if (msg !== "") this.client.users.cache.get(results[i].user_id).send(msg);
      }
    }

    if (type == "live") {
      videos.delete(id);
      if (notifType == "music") await database.query(`DROP TABLE IF EXISTS \`sched-${id}\``).then(r => this.client.log.debug(`Deleted premiered song table: sched-${id}`));
    }
  }

  async _checkUpcomingScheduled() {
    try {
      let { results } = await database.query(`SELECT * FROM \`music_scheduled\` WHERE \`sent\`='1'`);
      let videos = results.filter(x => (new Date(x.premiere).getTime() - Date.now()) < 1000 * 60 * 60 * 24);
      let scheduled = this.client.scheduledVideos;

      for (const video of videos) {
        let timer = scheduled.get(video.video_id);
        if (!timer) {
          let data = await youtube.getVideo({ client: this.client, id: video.video_id });
          if (data.status == "private") return this.privateScheduled(video.video_id);

          let type = (new Date(video.premiere).getTime() - Date.now()) > (1000 * 60 * 5) ? "five" : "live";
          let time = type == "five" ? (1000 * 60 * 5) : 0;

          scheduled.set(video.video_id, { type: type, timeout: setTimeout(() => this.client.videos.sendNotification(video.video_id, type, "music"), (new Date(video.premiere).getTime() - Date.now() - time)) });
          this.client.log.debug(`Successfully set the notification timer for scheduled video ID: ${video.video_id}.`);
        }
      }
    } catch (e) {
      this.client.log.error(e);
    }
  }

  async privateScheduled(id) {
    await database.query(`DELETE FROM \`music_scheduled\` WHERE \`video_id\`='${id}'`);
    await database.query(`DROP TABLE IF EXISTS \`sched-${id}\``).then(r => { this.client.log.debug(`Deleted private music table: sched-${id}`); });
  }

  async sendScheduledMusic(id, video, sql) {
    let client = this.client;
    let channel = await database.getMember(sql.channel).catch(e => client.log.error(e));
    if (!channel) return client.log.info("Channel was not found, Live message was not sent for ID: " + sql.video_id);

    let title = video.snippet.title.replaceAll("''", "\"");
    title = title.replaceAll(`'`, `\\'`);
    title = title.replaceAll(`"`, `\\"`);
    title = title.replaceAll("`", "\\`");

    client.channels.cache.get(config.covers_channel).send(`**${channel.name}** is Premiering a New **${sql.type == 1 ? "Original" : "Cover"}** Song!\n<@&${config.music_role}> <@&${channel.role}>\nhttps://www.youtube.com/watch?v=${sql.video_id}`).then(async msg => {
      msg.crosspost();
      await database.query(`INSERT INTO music (title, video_id, channel, type, sent, plays, previous_views) VALUES ('${title}', '${sql.video_id}', '${sql.channel}', '${sql.type}', '1', '0', '0')`);
      await database.query(`DELETE FROM \`music_scheduled\` WHERE \`video_id\`='${sql.video_id}'`);
      await client.channels.cache.get(config.premieres_channel).messages.fetch(sql.message_id).then(m => m.delete()).catch(e => {});
    });
    /* //!Put this as the solution if the DROP TABLE query in _DMUserNotification doesn't work
        await client.wait(1000 * 60 * 5);
        await database.query(`DROP TABLE IF EXISTS \`sched-${id}\``).then(r => { this.client.log.debug(`Deleted table: sched-${id}`); });
    */
  }

  async _weeklySongUpdate(sqlData) {
    let { results } = await database.query("SELECT * FROM \`music\` WHERE \`private\`='0'");
    let { strings } = await this.client.sortVideos(results);
    let videos = [], string = "";

    //Get all the video data from youtube
    for (let string of strings) {
      let videoData = await youtube.getVideos({ id: string });
      videos.push(...videoData.data);
    }

    //Update the database with the current number of views for each song
    for (let row of results) {
      let data = videos.filter(x => x.id == row.video_id)[0];
      if (!data || (data == [])) {
        await database.query(`UPDATE \`music\` SET \`private\`='1' WHERE \`video_id\`='${row.video_id}'`).catch(e => this.client.log.error(e));
        continue;
      }

      let title = data.snippet.title.replaceAll("''", "\"");
      title = title.replaceAll(`'`, `\\'`);
      title = title.replaceAll(`"`, `\\"`);
      title = title.replaceAll("`", "\\`");

      if (string == "") {
        string = `SELECT '${row.video_id}' AS id, ${row.views} AS previous, ${data.statistics.viewCount} as current, '${title}' as videotitle`;
      } else string = string + ` UNION ALL SELECT '${row.video_id}', ${row.views}, ${data.statistics.viewCount}, '${title}'`;
    }

    await database.query("SET character_set_results = 'utf8mb4', character_set_client = 'utf8mb4', character_set_connection = 'utf8mb4', character_set_database = 'utf8mb4', character_set_server = 'utf8mb4'");
    await database.query(`UPDATE music m JOIN (${string}) vals ON m.video_id = vals.id SET previous_views = previous, views = current, title = videotitle`).catch(e => {      
      this.client.log.error(e);
    });

    //Update the next weekly songs time and set a timeout
    let nextWeekly = sqlData.next_reset + (1000 * 60 * 60 * 24 * 7);
    await database.query(`Update \`apiusage\` SET \`next_reset\`='${nextWeekly}' WHERE \`id\`='4'`).catch(e => this.client.log.error(e));
    let apiCountData = (await database.query(`SELECT * FROM \`apiusage\` WHERE \`id\`='4'`)).results[0];
    this.timers.weeklySongUpdate = setTimeout(() => this._weeklySongUpdate(apiCountData), (nextWeekly - Date.now()));

    await this.client.wait(5000); //Lets the database update

    //Save this weeks stats
    let lastWeekSongs = await this.getLastWeekTopSongs();
    let songs = (await database.query(`SELECT * FROM \`music\` WHERE \`private\`='0' ORDER BY (views - previous_views) DESC LIMIT 10`).catch(e => this.client.log.error(e))).results, values = "";
    for (let i = 0; i < 10; i++) { values = values + `, '${songs[i].video_id}#${songs[i].views}#${songs[i].previous_views}'`; }
    await database.query(`INSERT INTO \`music_weekly_stats\` (\`week\`, \`1\`, \`2\`, \`3\`, \`4\`, \`5\`, \`6\`, \`7\`, \`8\`, \`9\`, \`10\`) VALUES ('${nextWeekly}'${values})`).catch(e => this.client.log.error(e));

    //Delete the old weekly messages from the channel
    let channel = await this.client.channels.cache.get(config.weekly_channel);
    let old = Array.from(await channel.messages.fetch());
    await channel.bulkDelete(old.length + 5).catch(e => this.client.log.error(e));

    //Create and send the weekly top song embed messages
    let messages = [], content = [], counter = 0;
    let { up, down, neutral, newsong } = config.weeklyEmojis;

    for (let song of songs) {
      let { msg, embed } = await createMessage(song, videos.filter(x => x.id == song.video_id)[0], counter, this.client);
      content.push(msg);
      messages.push(embed);
      counter++;
    }

    messages = messages.reverse();
    messages.push(await finalMessage(content));

    await this.client.wait(5000);
    for (let p = 0; p < messages.length; p++) { sendEmbed(messages[p], p, this.client); }

    function sendEmbed(msg, num, client) {
      setTimeout(() => {
        client.channels.cache.get(config.weekly_channel).send({ content: num == (messages.length - 1) ? `<@&${config.weekly_role}>` : "", embeds: [msg] });
      }, num * 5000);
    }

    async function finalMessage(c) {
      return {
        color: config.informationEmbedColor,
        title: "Weekly Top 10 Hololive Songs",
        description: `Ranking of the top 10 Hololive songs from <t:${Math.round((sqlData.next_reset - (1000 * 60 * 60 * 24 * 7)) / 1000)}:d> to <t:${Math.round(Date.now() / 1000)}:d> based on views.`,
        fields: c
      };
    }

    async function createMessage(song, vid, num, f) {
      return new Promise(async (resolve, reject) => {
        let text, emoji, statsong = lastWeekSongs.songs.filter(x => x.id == vid?.id) || null;

        let views = `${f.subscriberString(vid.statistics.viewCount)}⠀(+${f.commaNumber(vid.statistics.viewCount - song.previous_views)})`;
        let positionText;

        if (song.previous_views == 0) {
          emoji = newsong;
          views = `+${f.commaNumber(song.views)}`;
          positionText = { name: "\u202F", value: `New Song!`, inline: true };
        } else if (statsong?.length !== 0) {
          let position = parseInt(statsong[0].position);
          positionText = { name: "Last Week", value: `Previously in #${statsong[0].position}`, inline: true };
          emoji = position == (num + 1) ? neutral : (position < (num + 1) ? down : up);
        } else {
          emoji = up;
          positionText = { name: "\u202F", value: `New in Top 10!`, inline: true };
        }

        let fields = [
          { name: "Views", value: views, inline: true },
          { name: "Uploaded On", value: `<t:${Math.round(new Date(vid.snippet.publishedAt.replace("T", " ").replace("Z", "")).getTime() / 1000)}:D>`, inline: true }
        ];

        fields.push(positionText);
        let channel = await database.getMember(song.channel);

        const embed = {
          color: parseInt(channel.color, 16),
          url: `https://www.youtube.com/watch?v=${vid.id}`,
          author: { name: vid.snippet.channelTitle, url: `https://www.youtube.com/channel/${vid.snippet.channelId}` },
          title: `${emoji}⠀**${num + 1}**. ${vid.snippet.title}`, //Add blank space after number
          fields: fields,
          image: { url: (vid.snippet.thumbnails.maxres || vid.snippet.thumbnails.default).url + "?" + Date.now() }
        };

        let field = {
          name: `${emoji} **${num + 1}**. ⠀${views}`,
          value: `[${vid.snippet.title}](https://www.youtube.com/watch?v=${vid.id})\n`,
          inline: false
        }

        resolve({ msg: field, embed });
      });
    }
  }

  /**
   * Gets the stats from last weeks top songs
   * @returns {Promise<object>}
   */
  getLastWeekTopSongs() {
    return new Promise(async (resolve, reject) => {
      let { results } = await database.query(`SELECT * FROM \`music_weekly_stats\` WHERE \`id\`=(SELECT MAX(id) FROM \`music_weekly_stats\`)`).catch(e => { this.client.log.error(e); reject(e); });
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

  async checkSongsinPlaylist() {
    await this.client.wait(5000);
    let { results } = await database.query(`SELECT * FROM \`music\` WHERE \`playlist\`='0' OR \`playlist\`='2' OR \`specific_playlist\`='0' OR \`specific_playlist\`='2'`);

    for (let i = 0; i < results.length; i++) { set(results[i], i, this.client); }

    function set(row, num, client) {
      setTimeout(() => client.playlist.addSong(row, row.video_id, row.type == 1 ? "original" : "cover"), num * 5000);
    }
  }

  async getUnclassifiedComponents(video) {
    return new Promise((resolve, reject) => {
      const Button = new ActionRowBuilder();
      let fields = [];
      if (video.liveStreamingDetails) { //Live
        if (video.liveStreamingDetails.actualEndTime) { //Finished live/premiere
          fields.push({ name: "Duration", value: `${ytFormat(video.contentDetails?.duration)}`, inline: true });
          Button.addComponents(
            new ButtonBuilder().setCustomId('unclassified-finished_livestream').setLabel('Finished Livestream').setStyle('Success'),
            new ButtonBuilder().setCustomId('unclassified-premiered_song').setLabel('Premiered Song').setStyle('Secondary'),
            new ButtonBuilder().setCustomId('unclassified-not_music').setLabel('Other').setStyle('Secondary'),
            new ButtonBuilder().setCustomId('unclassified-refresh').setLabel('Refresh').setStyle('Success')
          );
        } else {
          if (video.contentDetails.duration == "P0D") { //Not a prerecorded video
            Button.addComponents(
              new ButtonBuilder().setCustomId('unclassified-livestream').setLabel('Livestream').setStyle('Success'),
              new ButtonBuilder().setCustomId('unclassified-not_music').setLabel('Other').setStyle('Secondary'),
              new ButtonBuilder().setCustomId('unclassified-refresh').setLabel('Refresh').setStyle('Success')
            );
          } else {
            fields.push({ name: "Duration", value: `${ytFormat(video.contentDetails.duration)}`, inline: true });
            Button.addComponents(
              new ButtonBuilder().setCustomId('unclassified-premiere').setLabel('Upcoming Premiere Song').setStyle('Primary'),
              new ButtonBuilder().setCustomId('unclassified-not_music').setLabel('Other').setStyle('Secondary'),
              new ButtonBuilder().setCustomId('unclassified-refresh').setLabel('Refresh').setStyle('Success')
            );
          }
          let startTime = Math.round(new Date(video.liveStreamingDetails.scheduledStartTime).getTime() / 1000);
          fields.push({ name: "Premieres", value: `<t:${startTime}:D> (<t:${startTime}:R>)`, inline: true });
        }
      } else {
        fields.push({ name: "Duration", value: `${ytFormat(video.contentDetails.duration)}`, inline: true });
        Button.addComponents(
          new ButtonBuilder().setCustomId('unclassified-original').setLabel('Original Song').setStyle('Primary'),
          new ButtonBuilder().setCustomId('unclassified-cover').setLabel('Cover Song').setStyle('Primary'),
          new ButtonBuilder().setCustomId('unclassified-not_music').setLabel('Other').setStyle('Secondary'),
          new ButtonBuilder().setCustomId('unclassified-refresh').setLabel('Refresh').setStyle('Success')
        );
      }

      let thumbnails = video.snippet.thumbnails;
      const videoEmbed = {
        color: config.youtubeEmbedColor,
        author: { name: video.snippet.channelTitle },
        description: `**[${video.snippet.title}](https://www.youtube.com/watch?v=${video.id})**`,
        image: { url: (thumbnails.maxres || thumbnails.default).url + "?" + Date.now() }
      };

      if (fields !== []) videoEmbed.fields = fields;

      return resolve({ embeds: [videoEmbed], buttons: [Button] });
    });
  }
}

module.exports = VideoHandler;