const { Player } = require("discord-player");
const { ChannelType } = require("discord.js");
const config = require("../config/config.json");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, '../.env') });
const database = require('../functions/database.js');
const botdata = require('../config/botdata.json');
const fetch = require('node-fetch');
const ytFormat = require("youtube-duration-format");
const youtube = require('../functions/youtube.js');

/**
 * Configuration for all the variables the player needs
 * @typedef {object} RadioConfig
 * @property {string} [playlist] Default youtube playlist to queue into the player
 * @property {string|integer} stageChannel Default voice channel to host the radio stage channel in
 * @property {object} queueInfo 
 * @property {string|integer} queueInfo.channel Channel ID that hosts the radio queue information
 * @property {string|integer} queueInfo.message Embed message ID for the radio queue information
 * @property {string|integer} queueMessageChannel Channel to send currently playing messages in 
 */

/**
 * @class
 * @classdesc Class to access discord-player with custom functions
 */
class player extends Player {

  disabled = true; //!temp
  
  /**
   * Option to show the discord-player debug mesages 
   * @member {boolean} 
   * @default false
   * */
  debugPlayer = false;

  playerOptions = { smoothVolume: true };
  stageOptions = {
    topic: '"24/7" Hololive Radio',
    privacyLevel: 2
  };
  guildID = null;
  botID = null;
  initialized = false; //Whether the player has been initialized yet
  queuePaused; //if the queue has been paused because of a leave
  radioEmpty; //If the radio is empty with only the bot
  trackPlaying = false; //Helps to prevent a double track start message
  radioConfig = {
    playlist: null,
    stageChannel: null,
    queueInfo: {
      channel: null,
      message: null
    },
    queueMessageChannel: null
  }

  queueOptions = {
    leaveOnEmpty: false,
    leaveOnEnd: false,
    autoSelfDeaf: true,
    volume: config.volume,
    leaveOnStop: false,
    ytdlOptions: {/*
      filter: "audioonly",
      opusEncoded: true,*/
      quality: "highestaudio",
      highWaterMark: 1 << 30,
    }
  }

  /**
   * 
   * @param {object} params
   * @param {object} params.client Discord client object
   * @param {object} [params.playerOptions] discord-player options 
   * @param {object} params.config 
   * @param {string|integer} params.config.clientID Client ID of the bot
   * @param {string|integer} params.config.guildID Guild ID to link the player to
   * @param {RadioConfig} params.config.radioConfig Configuration for the radio
   */
  constructor({ client, playerOptions, config }) {
    if (!config) throw new Error(`A config object is required.`);
    let { clientID, guildID, radioConfig } = config;
    if (!guildID) throw new Error(`Please provide a guild ID to link this player to.`);
    if (!clientID) throw new Error(`Please provide the ID of the bot that is hosting the player.`);
    if (!radioConfig) throw new Error(`A radio config object is required.`);

    if (playerOptions) this.playerOptions = playerOptions;
    super(client, playerOptions);

    this.guildID = guildID;
    this.botID = clientID;

    this.radioConfig = {
      ...this.radioConfig,
      ...radioConfig
    }

    //Arrow functions allow for the use of "this" inside the handler
    this.events.on("playerStart", (...args) => this._playerStart(...args));
    this.events.on("playerFinish", (...args) => this._playerFinish(...args));
    this.events.on("playerSkip", (...args) => this._playerSkip(...args));
    this.events.on("playerError", (...args) => this._playerError(...args));
    this.events.on("error", (...args) => this._playerError(...args));

        //!Add a timer to check every hour or so if the stage channel is up, if it isn't, then run the init function again

  }

  //Events
  debug(message) {
    if (this.debugPlayer) console.log(message);
  }

  async _playerStart(queue, track) {
    if (this.disabled) {
      queue.node.pause();
      queue.metadata.channel.send(`Player has been disabled. Unable to play the radio.`);
      return console.error("Player is disabled. Unable to play track.");
    }
    if (this.trackPlaying) return console.log("Track has already started");
    this.trackPlaying = true;
    queue.metadata.channel.send(`🎶⠀|⠀Now playing **${track.title}** by **${track.author}**!`);
    this.updateCurrentlyPlayingEmbed();

    if (queue.tracks.size == 0) { //Add more songs into the queue
      try {
        await this.queuePlaylist({ playlist: this.radioConfig.playlist, requester: this.botID, shuffle: true });
      } catch(e) { this.client.log.error(e) }
      await this.updateRadioCurrent();
    }
  }

  async _playerFinish(queue, track) {
    this.trackPlaying = false;
    database.addTimesPlayed(this.client, track);
  }

  async _playerSkip(queue, track) {
    queue.metadata.send(`Track **${track.title}** has been skipped due to an issue.`);
  }

  _playerError(queue, error) {
    console.log(1);
    console.error(`There was an error with the player: \`\`\`${error.message}\`\`\``);
    console.error(error);
    this.client.log.error(error);
    queue.node.skip();
  }

  /**
   * If the player is currently disabled
   */
  isDisabled() {
    return this.disabled;
  }

  /**
   * Create a new stage event for an existing guild channel
   * @param {object} params
   * @param {string} [params.guildID] Guild ID
   * @param {string} params.channel Voice channel ID
   * @param {string} [params.name] Stage event topic
   * @returns {Promise<Object>} Returns the created stageInstance 
   */
  createStage({ guildID, channel, name }) {
    return new Promise(async (resolve, reject) => {
      if (!channel) return reject("Please provide the ID of the channel to create the stage in.");
      if (guildID) this.guildID = guildID;
      let guild = this.client.guilds.cache.get(this.guildID);
      this.client.log.debug("Fetching an existing stage instance.");
      await guild.stageInstances.fetch(channel)?.then(async stageInstance => {
        if (stageInstance) await stageInstance.delete();
        this.client.log.debug("Deleted existing stage instance.");
      }).catch(err => this.client.log.debug("An existing stage instance was not found. Creating a new stage..."));

      if (name) this.stageOptions.topic = name;
      guild.stageInstances.create(channel, this.stageOptions).then(stageInstance => {
        this.radioConfig.stageChannel = channel;
        this.client.log.debug("Created a new stage instance.");
        resolve(stageInstance);
      }).catch(e => reject(e));
    });
  }

  /**
   * Initiate and setup the player queue
   * @param {object} params
   * @param {object} [params.queue_options] discord-player queue options
   * @param {string} params.playlist ID of the youtube playlist to queue
   */
  async initQueue({ queue_options, playlist }) {
    this.client.log.debug("Initiating player queue");
    this.radioConfig.playlist = playlist;
    if (this.disabled) return console.error("Player is disabled. Unable to initiate the player queue.");
    if (queue_options) this.queueOptions = queue_options;
    this.queueOptions.metadata = { channel: this.client.channels.cache.get(this.radioConfig.stageChannel/*queueMessageChannel*/) };
    const queue = await this.nodes.create(this.guildID, this.queueOptions);

    let channel = this.client.channels.cache.get(this.radioConfig.stageChannel);
    let commands = this.client.channels.cache.get(this.radioConfig.stageChannel/*queueMessageChannel*/);

    try {
      await this.createStage({ channel: this.radioConfig.stageChannel });
      await queue.connect(this.client.channels.cache.get(this.radioConfig.stageChannel));
      await this.queuePlaylist({ playlist, requester: this.botID, shuffle: true });
      await this.setSpeaker();
    } catch(e) {
      commands.send("Radio has failed to initiate. Please contact a staff member.");
      return this.client.log.error(e);
    }

    commands.messages.fetch({ limit: 1 }).then(async msg => {
      let lastMessage = msg.first();
      if (Array.from(channel.members).length > 1) {
      let string = "⏱️⠀|⠀Queue has restarted. Loading songs from playlist . . .";
        if (lastMessage.content !== string) commands.send(string);
        await queue.node.play();
        this.radioEmpty = false;
      } else {
        let string = "⏱️⠀|⠀Queue has restarted. Radio has been paused as there are no active listeners.";
        if (lastMessage.content !== string) commands.send(string);
        this.radioEmpty = true;
        this.pauseRadioEmbed();
      }

      this.initialized = true;
    });
  }

  /**
   * Queues a youtube playlist into the queue
   * @param {object} params
   * @param {string} params.playlist Youtube playlist ID
   * @param {string|integer} params.requester Id of the user who requested the playlist
   * @param {boolean} [params.shuffle] Shuffle the Playlist
   * @returns {Promise} (queue, playlistTracks)
   */
  queuePlaylist({ playlist, requester, shuffle = false }) {
    return new Promise(async (resolve, reject) => {
      this.client.log.debug("Queuing youtube playlist");
      if (this.disabled) return reject("Player is disabled. Unable to queue the playlist.");
      let playlistTracks = await this.search(`https://www.youtube.com/playlist?list=${playlist}`, {
        requestedBy: requester
      }).then(x => x.tracks);
      if (playlistTracks.length == 0) return reject(`Error retreiving playlist videos. Playlist is either empty or does not exist.`);
      let queue = this.nodes.get(this.guildID);
      //!Don't add the entire playlist, only add maybe 100 every time, and add weight based on views taken from the database
      //Videos with 0 views have the most weight, since they are new
      if (shuffle) playlistTracks.sort(() => Math.random() - 0.5);

      await queue.addTrack(playlistTracks);
      this.client.log.debug("Successfully queued youtube playlist");
      resolve(queue, playlistTracks);
    });
  }

  /**
   * Set the bot as a speaker within a stage channel
   */
  async setSpeaker() {
    await this.client.guilds.cache.get(this.guildID).members.me.voice.setRequestToSpeak(false);
    await this.client.guilds.cache.get(this.guildID).members.me.voice.setSuppressed(false);
    this.client.log.debug("Bot has been set as a speaker");
  }

  /**
   * Updates the currently playing radio embed
   */
  async updateCurrentlyPlayingEmbed() {
    if (this.disabled) return console.error("Player is disabled. Unable to update the embed.");
    let queue = this.nodes.get(this.guildID);
    let currentTrack = queue.currentTrack;
    let tracks = queue.tracks.toArray();
    if (!currentTrack?.url) return setTimeout(() => this.updateCurrentlyPlayingEmbed(), 1000 * 60);
    let urlParams = (new URL(currentTrack.url)).searchParams, videoData, video;

    try {
      videoData = (await youtube.getVideo({ client: this.client, id: urlParams.get("v") })).data;
      video = await database.query(`SELECT * FROM music WHERE \`video_id\`='${urlParams.get("v")}'`);
    } catch(e) {
      return this.client.log.error(e);
    } 

    let timesPlayed = video.results[0].plays || 0;
    let timeString = (timesPlayed == 1) ? "time" : "times";

    const infoMessage = {
      color: config.amberEmbedColor,
      title: `Hololive Music Radio⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀`,
      thumbnail: { url: currentTrack.thumbnail },
      fields: [
        { name: "Currently Playing:", value: `[${currentTrack.title}](${currentTrack.url}) *(${ytFormat(videoData.contentDetails.duration)})*`, inline: false },
        { name: "By", value: `[${currentTrack.author}](https://www.youtube.com/channel/${videoData.snippet.channelId})`, inline: false },
        { name: "Likes", value: `👍 ${this.client.commaNumber(videoData.statistics.likeCount)}`, inline: true },
        { name: "Comments", value: `💬 ${this.client.commaNumber(videoData.statistics.commentCount)}`, inline: true },
        { name: "Views", value: `${this.client.commaNumber(videoData.statistics.viewCount)}`, inline: true },
        { name: "Uploaded On", value: `<t:${Math.round(new Date(videoData.snippet.publishedAt.replace("T", " ").replace("Z", "")).getTime() / 1000)}:D>`, inline: true },
        { name: "Songs in Queue", value: `🎵 ${queue.tracks.size} songs`, inline: true },
        { name: "Times Played", value: `${timesPlayed} ${timeString}`, inline: true },
        { name: "Playing Next", value: tracks.length == 0 ? "🚫 No more songs left in the queue." : `[${tracks[0].title}](${tracks[0].url})`, inline: false }
      ],
      footer: { text: `HoloMusic`, icon_url: config.botpfp },
      timestamp: new Date()
    }

    let queueMsg = "🚫 No more songs left in the queue.";
    if (queue.tracks.size > 0) { 
      queueMsg = "";
      for (var i = 0; (i < 5) && (i < tracks.length); i++) {
        queueMsg = queueMsg + `**${i + 1})** ⠀[${tracks[i].title}](${tracks[i].url})\n`;
      }
    }
    const queueMessage = {
      color: config.informationEmbedColor,
      title: `Radio Queue`,
      description: queueMsg
    }
    this.client.channels.cache.get(this.radioConfig.queueInfo.channel).messages.fetch(this.radioConfig.queueInfo.message).then(msg => { 
      msg.edit({ embeds: [infoMessage, queueMessage], components: [] }); 
    });
  }

  /**
   * Pause the currently playing radio embed
   */
  pauseRadioEmbed() {
    let channelMessages = this.client.channels.cache.get(this.radioConfig.queueInfo.channel).messages;
    channelMessages.fetch(this.radioConfig.queueInfo.message).then(msg => {
      let embed = msg.embeds[0];
      if (embed.title.includes("[Paused]")) return;

      const infoMessage = {
        color: config.errorEmbedColor,
        title: "[Paused]⠀" + embed.title.slice(0, -7),
        thumbnail: { url: embed.thumbnail.url },
        fields: embed.fields,
        footer: embed.footer,
        timestamp: new Date()
      }

      msg.edit({ embeds: [infoMessage, msg.embeds[1]] });
    });
  }
}

module.exports = player;