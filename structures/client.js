const { ActionRowBuilder, ButtonBuilder, Client, Collection, GatewayIntentBits } = require("discord.js");
const path = require("node:path");
const fs = require("fs");
const YTNotify = require('../scripts/ytnotify.js');
const botdata = require('../config/botdata.json');
const Logger = require('./logger.js');
const Player = require('./player.js');
const config = require('../config/config.json');
const database = require(`../functions/database.js`);
const youtube = require(`../functions/youtube.js`);
const VideoHandler = require('../handlers/VideoHandler.js');
const info = require('../package.json');
const PlaylistHandler = require('../handlers/PlaylistHandler.js');
const { google } = require('googleapis');
const { weightedRandom } = require('../scripts/functions.js');

/**
 * 
 * @class
 * @classdesc Discord bot class
 */
class DiscordBot extends Client {
  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        //!This was only used for the staff embed, enable it when we need to actually use it
        //GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    this.notifier = new YTNotify({ hubCallback: process.env.hubCallback });
    this.player = new Player({
      client: this,
      config: {
        clientID: config.clientID,
        guildID: config.guildID,
        radioConfig: {
          playlist: config.playlists.all,
          stageChannel: config.radiochannel,
          queueInfo: {
            channel: config.radioqueue,
            message: botdata.radio_queue_embed
          },
          queueMessageChannel: config.radiocommands
        }
      }
    });

    this.log = new Logger({
      client: this,
      owner: config.creator,
      channels: {
        member: config.member_logs,
        staff: config.guild_logs,
        server: config.logchannel,
        classification: config.classification_logs
      }
    });

    this.videos = new VideoHandler(this);
    this.playlist = new PlaylistHandler(this);

    this.livestreams = new Collection();
    this.scheduledVideos = new Collection();

    this.intervals = new Collection();
    this.cooldowns = new Collection();
    this.cooldownDuration = 3; //Seconds

    this.userExpCooldown = new Collection();
    this.userExpDuration = 1; //Minutes
    this.userExpAmount = {
      1: 0.80,
      2: 0.12,
      3: 0.05,
      4: 0.02,
      5: 0.01
    }

    this.userBaseLevel = 10;
    //this.userLevelMultiplier = 0.25;

    this.speaker = false;
    this.commands = new Collection();
    this.activityStatus = 0;

    this.APICounter = { status: "ok" };

    this.debugBot = true;
    this.debugType = "both"; // "console" | "discord" | "both"
  }

  /**
   * Initiate and setup the bot instance
   * @param {string} token Discord bot token
   */
  async init(token) {
    if (!token) throw new Error("Please provide a bot token.");

    //Youtube Notifier
    this.notifier.on("subscribe", data => {
      let type = data.channeltype == "topic" ? " - Topic" : "";
      database.verifiedChannel(data.channel, this);
      this.log.server(`Successfully Subcribed to Push Notifications for **${data.channel.name + type}**`);
    });

    this.notifier.on("failed", data => {
      let type = data.channeltype == "topic" ? " - Topic" : "";
      if (data.type !== "subscribe") return;
      database.failedSub(data.channel.link_id, this);
      this.log.server(`Failed to Subscribe to Push Notifications for **${data.channel.name + type}**: \`\`\`HTTP ${data.response.status} ${data.response.statusText},\`\`\``);
    });

    //Commands
    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    let loadedCommands = 0;
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);
      if ('data' in command && 'execute' in command) {
        this.commands.set(command.data.name, command);
        loadedCommands++;
      } else console.error(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
    console.log(`(+) ${loadedCommands} commands loaded`);

    //Events
    let loadedEvents = 0;
    this.removeAllListeners();
    const eventsPath = path.join(__dirname, '../events');
    const events = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const eventFile of events) {
      const filePath = path.join(eventsPath, eventFile);
      const event = require(filePath);
      this.on(event.event, (...args) => event.run(this, ...args));
      loadedEvents++;
    }
    console.log(`(+) ${loadedEvents} events loaded`);

    //Video Events
    let loadedVideoEvents = 0;
    this.videos.removeAllListeners();
    const videosPath = path.join(__dirname, '../events/videoEvents');
    const videos = fs.readdirSync(videosPath).filter(file => file.endsWith('.js'));

    for (const videoFile of videos) {
      const filePath = path.join(videosPath, videoFile);
      const event = require(filePath);
      this.videos.on(event.event, (...args) => event.run(this, ...args));
      loadedVideoEvents++;
    }
    console.log(`(+) ${loadedVideoEvents} video events loaded`);


    this.login(token);
  }

  sweepCooldowns() {
    this.cooldowns.sweep(x => {
      let remove = true;
      Object.entries(x).forEach(row => { if ((Date.now() - row[1]) < 1000 * 60 * 60 * 12) remove = false; });
      return remove;
    });
  }

  sweepXpCooldowns() {
    this.userExpCooldown.sweep(x => {
      let remove = true;
      Object.entries(x).forEach(row => { if ((Date.now() - row[1]) < 1000 * 60 * 5) remove = false; });
      return remove;
    });
  }

  backupJSONData() {
    let files = ["botdata", "tokens"];

    for (let file of files) {
      const b = require(`../config/${file}.json`);
      if (!b) continue; //Prevents it from saving an empty/corrupted file
      b.backupSaveTime = Date.now();
      fs.writeFile(`./config/${file}-backup.json`, JSON.stringify(b, null, "  "), (err) => {
        if (err) console.error(err);
      });
    }
  }

  wait(milleseconds) {
    return new Promise(resolve => setTimeout(resolve, milleseconds))
  }

  /**
   * Adds commas to a number. <br>
   * Ex. 358912 -> 358,912
   * @param {string|integer} num 
   * @returns {string} Formatted number with commas
   */
  commaNumber(num) {
    return !num ? 0 : parseInt(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  /**
   * Adds periods to a number. <br>
   * Ex. 358912 -> 358.912
   * @param {string|integer} num 
   * @returns {string} Formatted number with periods
   */
  periodNumber(number) {
    return !number ? 0 : parseInt(number).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  /**
   * Sorts videos into strings of 50 for youtube requests
   * @param {array} videoArray Array of youtube video videos from the database
   * @returns {Promise<object>} { strings: [ ], videos: [ ] }
   */
  sortVideos(videoArray) {
    return new Promise(async (resolve, reject) => {
      let idstring = [""];
      for (var i = 0; i < videoArray.length; i++) { await addString(i); }

      function addString(num) {
        let position = Math.floor(num / 50);
        if (num % 50 === 0) idstring[position] = "";

        idstring[position] = idstring[position] + videoArray[num].video_id;
        let currentNum = (num + 1) - (position * 50); //Current position in the id string
        if (currentNum < 50) {
          if (currentNum < (videoArray.length - (position * 50))) {
            idstring[position] = idstring[position] + ",";
          }
        }
      }

      return resolve({ strings: idstring, videos: videoArray });
    });
  }

  pingError(msg) {
    this.channels.cache.get(config.status_channel).send({
      content: msg + ` \n<@&${config.user_role}> <@&${config.creator_role}>`, components: [
        new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("close_error").setLabel("Acknowledge Error").setStyle("Secondary"))
      ]
    });
  }

  /**
   * Get a formatted time string in UTC from milliseconds.
   * @param {string|integer} millis 
   * @returns {string} hh:mm:ss UTC
   */
  getTime(millis) {
    return;
    let d = new Date(millis);
    let datehour = d.getUTCHours();
    let datemin = d.getUTCMinutes();
    let datesec = d.getUTCSeconds();
    if (datehour < 10) datehour = `0${datehour}`;
    if (datemin < 10) datemin = `0${datemin}`;
    if (datesec < 10) datesec = `0${datesec}`;

    return `${datehour}:${datemin}:${datesec} UTC`;
  }

  /**
   * Get a formatted current date-time string in UTC
   * @returns {string} dd/mm/yyyy hh:mm:ss UTC
   */
  newDate(millis) {
    let d = new Date(millis || Date.now());
    let datem = d.getUTCMonth()
    let datemonth = datem += 1;
    let dateday = d.getUTCDate();
    let dateyear = d.getUTCFullYear();
    let datehour = d.getUTCHours();
    let datemin = d.getUTCMinutes();
    let datesec = d.getUTCSeconds();

    if (datemonth < 10) datemonth = `0${datemonth}`;
    if (dateday < 10) dateday = `0${dateday}`;
    if (datehour < 10) datehour = `0${datehour}`;
    if (datemin < 10) datemin = `0${datemin}`;
    if (datesec < 10) datesec = `0${datesec}`;

    return `${dateday}/${datemonth}/${dateyear} ${datehour}:${datemin}:${datesec} UTC`;
  }

  /**
   * Convert an amount of youtube subscribers into a formatted string
   * @param {(number|string)} sub Youtube subscribers
   * @returns {string} Formatted subscriber string - Ex. 2.12m
   */
  subscriberString(sub) {
    if (parseInt(sub) == 0) return "-";
    let final, subs = parseInt(sub);
    let string = this.periodNumber(subs);
    let num = 4;
    if ((subs > 999) && (subs < 1000000)) {
      if (subs.toString().length == 6) num = 3;
      final = string.substring(0, num) + "k";
    } else if ((subs > 999999) && (subs < 1000000000)) {
      if (subs.toString().length == 9) num = 3;
      final = string.substring(0, num) + "m";
    } else if (subs <= 999) {
      final = string.substring(0, 3);
    } else if (subs > 999999999) {
      if (subs.toString().length == 12) num = 3;
      final = string.substring(0, num) + "b"
    }
    return final;
  }

  /**
   * Get a nice progress bar
   * @param {number} value Current value
   * @param {number} maxValue Max value
   * @param {number} size Length of the returned progress bar string
   * @param {string} type "status" or "playback"
   * @returns {string} Progress bar
   */
  progressBar(value, maxValue, size, type) {
    const percentage = value / maxValue; // Calculate the percentage of the bar
    const progress = Math.round((size * percentage)); // Calculate the number of square caracters to fill the progress side.
    const emptyProgress = size - progress; // Calculate the number of dash caracters to fill the empty progress side.

    const progressText = '▇'.repeat(progress); // Repeat is creating a string with progress * caracters in it
    const emptyProgressText = '──'.repeat(emptyProgress); // Repeat is creating a string with empty progress * caracters in it
    const percentageText = Math.round(percentage * 100) + '%'; // Displaying the percentage of the bar

    let bar;
    if (type == "status") bar = '```[' + progressText + emptyProgressText + '] ' + percentageText + '```'; // Creating the bar
    if (type == "playback") bar = '[' + progressText + emptyProgressText + ']'; // Creating the bar
    return bar;
  }

  /**
   * Check the cooldown for the member that initiated an interaction. <br>
   * If the member is not on cooldown, starts a new cooldown for that event.
   * @param {object} params 
   * @param {object} params.interaction Discord interaction object
   * @param {string} [params.name] Name of the event to check a cooldown for
   * @param {number} [params.duration] Number of seconds the cooldown should be 
   * @returns {Promise<String>} { status: "oncooldown" | "ready", time?: integer }
   */
  checkCooldown({ interaction, name, duration }) {
    return new Promise((resolve, reject) => {
      if (interaction.member._roles.includes(config.admin_role)) return resolve({ status: "ready" });
      let type = name || interaction.customId;
      let cooldowns = interaction.client.cooldowns;
      let collec = cooldowns.get(interaction.member.id);
      if (!collec) {
        cooldowns.set(interaction.member.id, { [type]: Date.now() });
        return resolve({ status: "ready" });
      }
      let time = Date.now() - collec[type]; //Time since last command usage
      let cooldown = (duration || interaction.client.cooldownDuration) * 1000;
      if (time < cooldown) return resolve({ status: "oncooldown", time: cooldown - time });
      collec[type] = Date.now();
      cooldowns.set(interaction.member.id, collec);
      resolve({ status: "ready" });
    });
  }

  /**
   * Sends a message to notify the user that there is a cooldown left for an interaction
   * @param {object} params
   * @param {object} params.interaction Discord interaction object to reply to
   * @param {string|integer} params.time Time left until the interaction can be used again in seconds
   */
  interactionOnCooldown({ interaction, time }) {
    let seconds = parseInt(time) / 1000, timeString = "";
    if (seconds <= 60) timeString = Math.round(seconds * 10) / 10 + "s";
    if (seconds > 60) {
      let minutes = Math.floor(seconds / 60);
      timeString = `${minutes}m ${seconds - (minutes * 60)}`;
    }
    interaction.reply({ embeds: [{ color: config.amberEmbedColor, description: `Please slow down! You can use this again in \`${timeString}\`.` }], ephemeral: true });
  }

  async checkSubscriptions() {
    let results;
    try {
      results = (await database.query("SELECT * FROM channels")).results;
    } catch (e) { return this.log.error(e); }

    if (!results) {
      setTimeout(() => this.checkSubscriptions(), 3600000); //Every hour
      return this.log.error(`Error while retreiving \`last_verified\` SQL data from \`channels\`.`);
    }
    let last_verified = new Date(results[0].last_verified);
    if ((Date.now() - last_verified.getTime()) >= 345600000) { //if last_verified was more than 4 days ago
      for (let i = 0; i < results.length; i++) { newChannel(results, i, this); }
      setTimeout(() => this.checkSubscriptions(), 345600000);
    } else setTimeout(() => this.checkSubscriptions(), 3600000); //Every hour

    function newChannel(r, p, client) {
      setTimeout(() => client.notifier.subscribe(r[p]), 1000 * (p + 1));
    }
  }

  async getLevel(exp) {
    let lvl = 0, expNeeded = 0;
    while (true) {
      expNeeded += await this.expNeededToLevelUp(lvl);
      if (exp < expNeeded) break;
      lvl += 1;
    }
    return { level: lvl, xp: exp - await this.totalExpNeeded(lvl), xpNeeded: await this.expNeededToLevelUp(lvl) };
  }

  async totalExpNeeded(lvl) {
    let total = 0;
    for (let i = 0; i < lvl; i++) {
      total += await this.expNeededToLevelUp(i);
    }
    return total;
  }

  async expNeededToLevelUp(lvl) {
    //? EXP needed to level up
    return Math.round((0.5 * Math.pow(lvl, 2)) + (5 * lvl) + this.userBaseLevel); //Mee6 Leveling System
    //return this.userBaseLevel * Math.pow(this.userLevelMultipler + 1, targetLevel - 1);
  }

  async newExp(message) {
    let userId = message.author.id;
    let col = this.userExpCooldown.get(userId);
    if (!col || (Date.now() - col) > (this.userExpDuration * 60 * 1000)) {
      let amount = weightedRandom(this.userExpAmount);
      await database.addExp(userId, amount);
      let user = (await database.query(`SELECT * FROM \`members\` WHERE \`id\`='${userId}'`)).results[0];
      let { level, xp, xpNeeded } = await this.getLevel(user.xp - amount);
      if ((xpNeeded - xp) <= amount) this.levelUp(message, level + 1);
    } 
    this.userExpCooldown.set(userId, Date.now());
  }

  async levelUp(message, level) {
    message.channel.send({ embeds: [{
      color: config.informationEmbedColor,
      title: "Leveled Up!",
      description: `Congratulations! <@${message.author.id}> just leveled up to level \`${level}\`!`,
      thumbnail: { url: message.author.avatarURL() }
    }]});
  }

  /**
   * Update the bot's status messages
   */
  async updateStatusMessages() {
    let channels, api;
    try {
      channels = (await database.query("SELECT * FROM channels")).results;
      api = (await database.query("SELECT * FROM \`apiusage\`")).results;
    } catch (e) { return this.log.error(e); }
    let notVerified = channels.filter(x => x.verify_status == 1);

    let verifiedString = "";
    for (let row of notVerified) { verifiedString += `❌ - ${row.name}\n` }
    verifiedString = `✅ - ${notVerified.length == 0 ? "All" : ""} **${channels.length}** channels verified for push notifications.\n${verifiedString}`;

    const infoMessage = {
      color: config.informationEmbedColor,
      title: `**${config.bot_name} Status**`,
      description: "Discord Bot for Tracking Hololive Covers and Originals.⠀⠀⠀⠀⠀⠀",
      thumbnail: { url: config.botpfp },
      fields: [
        { name: "Users", value: `${this.users.cache.size}`, "inline": true },
        { name: "API Latency", value: Math.round(this.ws.ping) + "ms", "inline": true },
        { name: "Memory", "value": Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100 + "mb", "inline": true },
        { name: `${api[1].name} `, value: `>>> **${this.commaNumber(api[1].current)}** Notifications Since <t:${(api[1].next_reset / 1000) - (60 * 60 * 24)}:f>\nAt a Rate of **${Math.round(api[1].current / ((Date.now() - (api[1].next_reset - (60000 * 60 * 24))) / (1000 * 60 * 60)) * 1000) / 1000}/hr**`, "inline": false },
        { name: "Last Bot Restart", value: `<t:${Math.round(botdata.lastBotRestart / 1000)}:f>`, "inline": true },
        { name: "Script Version", value: "v" + info.version, inline: true, },
        { name: `Channel Subscription Status`, value: `${verifiedString}`, "inline": false }
      ],
      footer: { text: `HoloMusic`, icon_url: config.botpfp },
      timestamp: new Date()
    };

    const apiMessage = {
      color: config.informationEmbedColor,
      title: `**API Quota Status**`,
      description: "Current quota usage and reset times.",
      thumbnail: { url: config.api_icon },
      fields: [
        { "name": `${config.youtube_emoji} ${api[0].name} - \`\`\`${this.commaNumber(api[0].current)}/${this.commaNumber(api[0].max)}\`\`\``, "value": `Next Reset: <t:${api[0].next_reset / 1000}:f>${this.progressBar(api[0].current, api[0].max, 20, "status")}`, "inline": false },
      ]
    }

    let queries, size;
    try {
      queries = await database.getAverageQueries();
      size = await database.getDatabaseSize();
    } catch (e) { this.log.error(e); }

    const mysqlMessage = {
      color: config.informationEmbedColor,
      title: `**MySQL Database Status**`,
      description: "Current database status and usage.⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
      thumbnail: { url: config.mysql_logo },
      fields: [
        { "name": "Queries", "value": `${queries == "Unknown" ? queries : (Math.round(queries * 1000) / 1000)} /s`, "inline": true },
        { "name": "Database Size", "value": `${size == "Unknown" ? size : ((Math.round(size * 100) / 100) + "mb")}`, "inline": true },
      ]
    }

    for (var i = 0; i < botdata.status_message.length; i++) {
      this.channels.cache.get(botdata.status_message[i].channel).messages.fetch(botdata.status_message[i].message).then(msg => { msg.edit({ embeds: [infoMessage, apiMessage, mysqlMessage] }) });
    }
  }

  async updateStaffEmbed() {
    let guildMembers = await this.guilds.cache.get(config.guildID).members.fetch(/*{ withPresences: true }*/);
    const message = {
      color: config.informationEmbedColor,
      title: "**Server Statistics**⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀",
      fields: [
        { name: "Members", value: `${this.commaNumber(guildMembers.filter(x => !x.user.bot).size)}`, inline: true },
        { name: "Online", value: `${this.commaNumber(guildMembers.filter(x => (x.presence?.status !== "offline") && (x.presence !== null) && !x.user.bot).size)}`, inline: true },
        { name: "Bots", value: `${this.commaNumber(guildMembers.filter(x => x.user.bot).size)}`, inline: true },
        { name: "Staff Logs", value: `<#${config.guild_logs}>`, inline: true },
        { name: "Guild Logs", value: `<#${config.member_logs}>`, inline: true },
        { name: "⠀", value: "⠀", inline: true },
        { name: "Debug Logs", value: `${this.debugBot ? "Enabled" : "Disabled"}`, inline: true },
        { name: "Radio", value: `${this.player.disabled ? "Disabled" : "Enabled"}`, inline: true }
      ]
    }

    const button = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel(`${this.player.diabled ? "Enable" : "Disable"} Radio`).setStyle("Danger").setCustomId(`staff-${this.player.disabled ? "enable" : "disable"}Radio`),
      new ButtonBuilder().setLabel(`Reset Radio`).setStyle("Secondary").setCustomId("staff-resetRadio"),
      new ButtonBuilder().setLabel(`Redeploy Commands`).setStyle("Primary").setCustomId("staff-deployCommands")
    );


    const button2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Resend Weekly Top 10").setStyle("Success").setCustomId("staff-resendWeekly"),
      new ButtonBuilder().setLabel(`${this.debugBot ? "Disable" : "Enable"} Debug Logs`).setStyle("Primary").setCustomId(`staff-debug`)
    )

    const button3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Send Rules").setStyle("Secondary").setCustomId("staff-sendRules"),
      //new ButtonBuilder().setLabel("Add 10 Videos to Playlist").setStyle("Danger").setCustomId("staff-video")
    )

    this.channels.cache.get("914027647334498344").messages.fetch(config.staff_embed).then(msg => {
      msg.edit({ embeds: [message], components: [button, button2, button3] });
    })
  }

  sendRules() {
        let embeds = [
          {
            color: config.informationEmbedColor,
            title: "1. Chatting Etiquette",
            description: `
- Spam, racism, and offensive or racial slurs is prohibited
- Harassement over DMs is forbidden and will result in a ban
- Have common sense and be polite, there is a human behind every screen
- Please refrain from cursing excessively`
          }, 
          {
            color: config.informationEmbedColor,
            title: "2. Conversation Topics",
            description: `
- Keep controversial topics such as politics, religion, and scandals out of the server
- Any explicit/direct NSFW is not allowed. Borderline NSFW art may be allowed as long as it is spoilered in the correct channels
- Excessive flirting, PDA, and role-play is not allowed. Keep these in DMs
- Keep memes/shitposts in their respective channels`
          },
          {
            color: config.informationEmbedColor,
            title: "3. Misinformation",
            description: `
- Please refrain from spreading misinformation or rumors about vtubers
- This includes all past/current rumors, and anything about their real/past life`
          },
          {
            color: config.informationEmbedColor,
            title: "4. Advertisment/Self Promotion",
            description: `
- Advertisement of any external servers/links/content is prohibited within our server/DMs and will result in a ban
- This does not include the posting of:
 - Your/others art and the source links
 - Twitter/Youtube links related to hololive
 - Any links/content related to conversations allowed within our server` 
          },
          {
            color: config.informationEmbedColor,
            title: "5. Staff and Mods",
            description: `
- Our staff and mods have the final say in all punishments
- Please report any rule breaking members with /report
- Do not spam ping/DM our staff or mods
- Please be nice to our staff as they are human and trying their best`
          },
          {
            color: config.informationEmbedColor,
            title: "6. Discord TOS",
            description: `
    Discord's guidelines and terms must be followed:
- https://discord.com/guidelines
- https://discord.com/terms`
          }
        ];

        // const button = new ActionRowBuilder().addComponents(
        //   new ButtonBuilder().setLabel("I have read and agree to the rules").setStyle("Primary").setCustomId("rulesAgree"),
        // )

    //Add an embed before with the server title/banner with the word rules

    //Add more embeds after with additional information

    this.channels.cache.get(config.rules_channel).send({ embeds });

    //put a rule saying if someone finds a song that isn't in the system, they get rewarded with a special song hunter role
  }

  sendInformation() {
    this.channels.cache.get("1071615216527347782").send({
      embeds: [{
        color: config.informationEmbedColor,
        title: "24/7 Hololive Music Radio",
        description: `<#1061080915180265602> is a radio channel where hololive songs will be randomly shuffled and played straight from a playlist. Songs are all completely chosen at random to encourage views on older songs. Please report any bugs in <#1079543704286662727> and put your suggestions for new features in <#1079543866010644541>!
        Playlists below are all auto generated by the bot through keyword recognition in video titles.

        *The bot will currently only play when the audience is not empty in order to save memory.`,
        fields: [
          { name: "Youtube Playlists", value: "[Hololive Music Playlist](https://www.youtube.com/playlist?list=PLU5iAxz-gl_h9PWEJzu-xl-hshETkG_Hl)\n[Hololive Original Songs](https://www.youtube.com/playlist?list=PLU5iAxz-gl_i31r_Kh-bOb4VoZvlVwtje)\n[Hololive Cover Songs](https://www.youtube.com/playlist?list=PLU5iAxz-gl_jcO7LUzUXSyk5mX7r5FKOR)\n[Hololive Topic Songs](https://www.youtube.com/playlist?list=PLU5iAxz-gl_gBx8TETllHlUqL_Tf6Nb_N)", inline: false },
        ]
      }]
    });
  }

  memberRole() {
    return;
    //1078068018350919863
    this.channels.cache.get("1078068018350919863").send({
      embeds: [{
        color: config.informationEmbedColor,
        title: "Hololive DEV_IS -ReGLOSS-",
        description: "<@&1148835635961016400> - Ao Ch. 火威青 ‐ ReGLOSS\n<@&1148839232882872360> - Kanade Ch. 音乃瀬奏 ‐ ReGLOSS\n<@&1148839279867469864> - Ririka Ch. 一条莉々華 ‐ ReGLOSS\n<@&1148839356765835294> - Raden Ch. 儒烏風亭らでん ‐ ReGLOSS\n<@&1148839403402297434> - Hajime Ch. 轟はじめ ‐ ReGLOSS",
        footer: {
          text: "Click the button again to remove the role"
        }
      }],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel("Hiodoshi Ao").setCustomId("memberRole-1148835635961016400").setStyle("Secondary"),
          new ButtonBuilder().setLabel("Otonose Kanade").setCustomId("memberRole-1148839232882872360").setStyle("Secondary"),
          new ButtonBuilder().setLabel("Ichijou Ririka").setCustomId("memberRole-1148839279867469864").setStyle("Secondary")
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel("Juufuutei Raden").setCustomId("memberRole-1148839356765835294").setStyle("Secondary"),
          new ButtonBuilder().setLabel("Todoroki Hajime").setCustomId("memberRole-1148839403402297434").setStyle("Secondary")
        )
      ]
    });
  }

  hololiveRole() {
    return;

    this.channels.cache.get("1078068018350919863").messages.fetch("1078075643918565498").then(msg => {
      let comp = msg.components;
      comp[1] = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel("hololive DEV_IS").setCustomId("memberRole-1148839445462782082").setStyle("Secondary")
      )

      let m = {
        color: config.informationEmbedColor,
        title: "Hololive Main Channels",
        description: `<@&1071909003313020958> - hololive ホロライブ - VTuber Group
        <@&1071909003539533926> - hololive English
        <@&1071909004806205501> - hololive Indonesia
        <@&1148839445462782082> - hololive DEV_IS`,
        footer: {
          text: "Click the button again to remove the role"
        }
      };

      msg.edit({ embeds: [m], components: comp });
    });
  }
}

module.exports = DiscordBot;