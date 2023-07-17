const { ActionRowBuilder, ButtonBuilder } = require("discord.js");
const EventEmitter = require("events");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, '../.env') });
const { google } = require('googleapis');
const tokens = require('../config/tokens.json');
const fs = require("fs");
const fetch = require("node-fetch");
const database = require("../functions/database.js");
const config = require("../config/config.json");
const scopes = ['https://www.googleapis.com/auth/youtube'];

class PlaylistHandler extends EventEmitter {
  oauth2Client = new google.auth.OAuth2(
    process.env.client_id,
    process.env.client_secret,
    process.env.callback_url
  );

  grant = "valid";
  grantEmbed = null;

  constructor(client) {
    super();
    this.client = client;
  }

  init() {
    let t = tokens.tokens;
    t.refresh_token = tokens.refresh_token;
    this.oauth2Client.setCredentials(t);
    this.client.log.debug(`Set OAuth2 credentials for Google API usage`);
  }

  getOAuthUrl() {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      include_granted_scopes: true
    });
  }

  async saveTokensFromAuthCode(auth) {
    let { tokens } = await this.oauth2Client.getToken(auth);
    this._saveTokens(tokens);
  }

  _saveTokens(tokens) {
    this.oauth2Client.setCredentials(tokens);

    const t = require("../config/tokens.json");
    if (tokens.refresh_token) t.refresh_token = tokens.refresh_token;
    t.tokens = tokens;
    fs.writeFile('./config/tokens.json', JSON.stringify(t, null, "  "), (err) => {
      if (err) console.error(err);
    });
  }

  _getNewTokensFromLink(link) {
    return new Promise(async (resolve, reject) => {
      let url = new URL(link);
      let params = url.searchParams;
    
      if (params.get("error")) return reject(params.get("error"));

      let auth_code = params.get("code");
      let tokens = await this.oauth2Client.getToken(auth_code);

      const t = require('../config/tokens.json');
      if (tokens.tokens.refresh_token) t.refresh_token = tokens.tokens.refresh_token;
      t.tokens = tokens.tokens;
      fs.writeFile('./config/tokens.json', JSON.stringify(t, null, "  "), (err) => {
        if (err) console.error(err);
      });

      this.oauth2Client.setCredentials(tokens);
      this.grant = "valid";
      return resolve(tokens);
    });
  }

  _getNewAccessToken() {
    return new Promise(async (resolve, reject) => {
      const t = require('../config/tokens.json');
      let data = await fetch(`https://oauth2.googleapis.com/token`, {
        method: 'POST',
        body: JSON.stringify({
          client_id: process.env.client_id,
          client_secret: process.env.client_secret,
          refresh_token: t.refresh_token,
          grant_type: "refresh_token"
        }),
        headers: {
          "Content-Type": "application/json"
        }
      });

      let info = JSON.parse(await data.text());
      if (info.error) {
        if (info.error == "invalid_grant") this.invalidGrant();
        return reject(info.error);
      }
      resolve(info);
    })
  }

  async addSong(sql, id, type) { //video id
    if (this.grant == "invalid") return;
    let tokens = await this._getNewAccessToken();
    await this.oauth2Client.setCredentials(tokens);

    if (type == "topic") return this._addToPlaylist(id, type);
    if (sql.playlist == 0) this._addToPlaylist(id, "all");
    if (sql.specific_playlist == 0) setTimeout(() => this._addToPlaylist(id, type), 500);
  }

  async _addToPlaylist(id, type) {
    await google.youtube('v3').playlistItems.insert({
      auth: this.oauth2Client,
      part: 'snippet',
      resource: {
        snippet: {
          playlistId: config.playlists[type],
          resourceId: {
            kind: 'youtube#video',
            videoId: id
          }
        }
      }
    }).then(async r => {
      database.addYoutubeRequestCount(50); //This api call costs 50 points
      if ((r.status == 200) || (r.statusText == "OK")) {
        this.client.log.debug(`Successfully inserted video ID ${id} into the ${type} playlist`);
        await database.query(`UPDATE \`${type == "topic" ? "music_topic" : "music"}\` SET \`${["topic", "all"].includes(type) ? "playlist" : "specific_playlist"}\`='1' WHERE \`video_id\`='${id}'`).catch(e => this.client.log.error(e));
        if (type == "all") {
          let queue = this.client.player.nodes.get(config.guildID);
          let song = await this.client.player.search(`https://www.youtube.com/watch?v=${id}`, {
            requestedBy: this.client.guilds.cache.get(config.guildID).members.cache.get(config.clientID)
          }).then(x => x.tracks[0]);
          if (song) {
            let number = Math.floor(Math.random() * (queue.tracks.size - 5));
            await queue.insertTrack(song, (number + 5));
            this.client.log.debug(`Inserted ${song.title} into track #${number + 5}.`);
          }
        }
      } else this.client.log.error(`Error while inserting video into playlist: \`\`\`${r.status} ${r.errors[0].message}: ${r.errors[0].reason}\`\`\``);
    }).catch(async error => {
      this.client.log.error(error);
      await database.query(`UPDATE \`${type == "topic" ? "music_topic" : "music"}\` SET \`${["topic", "all"].includes(type) ? "playlist" : "specific_playlist"}\`='2' WHERE \`video_id\`='${id}'`).catch(e => this.client.log.error(e));
    });
  }

  async invalidGrant() {
    this.grant = "invalid";
    if (this.grantEmbed || this.grantEmbed !== null) return;
    const tokens = require("../config/tokens.json");
    const buttons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("new_token").setLabel("Authorize New Tokens").setStyle("Primary"))

    const embed = {
      color: config.amberEmbedColor,
      title: "[ALERT] Action Needed",
      description: "Google OAuth2 tokens have expired.",
      fields: [{ name: "Expiry Date", value: `<t:${Math.round(tokens.tokens.expiry_date / 1000)}:f>`, inline: true }]
    }

    this.client.channels.cache.get(config.status_channel).send({ content: `Google OAuth2 tokens have expired. <@&${config.creator_role}>`, embeds: [embed], components: [buttons] }).then(msg => {
      this.grantEmbed = msg.id;
    });
  }
}

module.exports = PlaylistHandler;