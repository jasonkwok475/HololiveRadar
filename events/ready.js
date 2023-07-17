const { ActivityType, ActionRowBuilder, ButtonBuilder, EmbedBuilder, InteractionType, ButtonStyle, ComponentType } = require('discord.js');
const fetch = require('node-fetch');
const path = require("node:path");
const Event = require('../structures/event.js');
const config = require('../config/config.json');
const botdata = require('../config/botdata.json');
const database = require('../functions/database.js');
const youtube = require('../functions/youtube.js');
const fs = require("fs");
require("colors");

const activities = [
  { name: "Hololive Covers", type: ActivityType.Listening, status: "online" },
  { name: "with Poyoyo", type: ActivityType.Playing, status: "online" },
  { name: "a Stream", type: ActivityType.Watching, status: "online" },
  { name: "with the Radio Knob", type: ActivityType.Playing, status: "online" },
  { name: "the Youtube Algorithm", type: ActivityType.Watching, status: "online" }
]
//adjusting the satellite

module.exports = new Event("ready", async (client) => {
  client.APICounter.time = Math.round(Date.now() / 1000);

  client.log.server(`:white_check_mark:         Bot has successfully restarted on <t:${Math.round(Date.now() / 1000)}:f>\n`);
  console.log(`Bot has started successfully, with ${client.users.cache.size} users, in ${client.channels.cache.size} channels of ${client.guilds.cache.size} guilds.`.green);

  client.intervals.set("activity", setInterval(() => {
    let s = client.activityStatus == (activities.length - 1) ? 0 : client.activityStatus + 1;
    client.user.setPresence({ activities: [{ name: activities[s].name, type: activities[s].type }], status: activities[s].status || "online" });
    client.activityStatus = s;
  }, 1000 * 60));

  //Initiate and setup all the custom classes and modules
  client.player.disabled = botdata.playerDisabled;
  client.player.initQueue({ playlist: config.playlists.all });
  client.videos.init();
  client.playlist.init();

  //client.sendRules();

  //!TEMP
  //client.sendInformation();

  //Status and Staff Embeds
  client.updateStatusMessages();
  client.updateStaffEmbed();
  client.intervals.set("statusMessage", setInterval(() => client.updateStatusMessages(), 1000 * 60 * 5));
  client.intervals.set("staffEmbed", setInterval(() => client.updateStaffEmbed(), 1000 * 60 * 5));
  client.intervals.set("sweepCooldowns", setInterval(() => client.sweepCooldowns(), 1000 * 60 * 60 * 24));
  client.intervals.set("sweepXpCooldowns", setInterval(() => client.sweepXpCooldowns(), 1000 * 60 * 60 * 24));

  client.checkSubscriptions(); //Check if subscriptions have expired

  //!TEMP
  //client.sendInformation();

  database.getNextYoutubeQuotaReset(client);
  
  const b = require("../config/botdata.json");
  b.lastBotRestart = Date.now();
  fs.writeFile('./config/botdata.json', JSON.stringify(b, null, "  "), (err) => {
    if (err) console.error(err);
  });

  client.intervals.set("APICountChecker", setInterval(() => {
    if (client.APICounter.status == "over") return;
    for (const [key, value] of Object.entries(client.APICounter)) {
      if (["status", "time"].includes(key)) continue;
      if (value >= 5) {
        client.APICounter.status = "over";
        let msg = `Hololive Radar has been automatically rate limited due to too many requests being sent per minute.\nVideo ID \`${key}\` had **${value}** requests in the past minute.`;
        client.pingError(msg);
        client.log.debug(msg);
        break;
      }
    }
    client.APICounter = {
      status: client.APICounter.status,
      time: Math.round(Date.now() / 1000)
    };
  }, 1000 * 60));

  await client.wait(1000);
  setInterval(() => client.backupJSONData(), 1000 * 60 * 60);
});