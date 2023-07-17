const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, '../.env') });
const { google } = require('googleapis');
const botdata = require('../config/botdata.json');
const database = require('./database.js');
const categories = require("../config/categories.json");

class YoutubeAPI {

  static _list({ client, id, part, type, list }) {
    return new Promise(async (resolve, reject) => {
      if (!id) throw new Error("Please provide a youtube video ID.");
      if (type == "single" && client.APICounter?.status !== "ok") return;
      await google.youtube('v3')[`${list}`].list({
        auth: process.env.youtube_key,
        part: part || 'snippet,id,liveStreamingDetails,statistics,contentDetails',
        id: id
      }).then(r => {
        if (type == "single") {
          if (client.APICounter[`${id}`]) { client.APICounter[`${id}`] += 1; } else client.APICounter[`${id}`] = 1;
        }
        database.addYoutubeRequestCount(1);
        if ((r.status !== 200) || (r.statusText !== "OK")) return reject(`Error while requesting ${list} data: ${r.status} ${r.errors[0].message}: ${r.errors[0].reason}`);
        resolve({ status: r.data.pageInfo.totalResults == 0 ? "private" : "ok", data: type == "single" ? r.data.items[0] : r.data.items });
      });
    })
  }

  static getRecentChannelVideos({ id, part }) {
    return;
    return new Promise(async (resolve, reject) => {
      if (!id) throw new Error("Please provide a youtube channel ID.");

      await google.youtube('v3').search.list({
        auth: process.env.youtube_key,
        part: part || 'snippet',
        channelId: id,
        order: "date",
        maxResults: "50"
      }).then(r => {
        if ((r.status !== 200) || (r.statusText !== "OK")) return reject(`Error while requesting search data: ${r.status} ${r.errors[0].message}: ${r.errors[0].reason}`);
        resolve(r.data.items);
      });
    })
  }

  static getChannelType(id) {
    return;
    return new Promise(async (resolve, reject) => {
      let videos = await this.getRecentChannelVideos({ id });
      let results = {};

      for (let video of videos) {
        console.log(video.snippet);
        let type = categories.categories.filter(x => x.id == video.snippet.categoryId)[0].snippet.title;
        results[`${type}`] ? results[`${type}`] += 1 : results[`${type}`] = 0;
      }

      let arr = Object.keys(results).map((key) => ({ name: key, value: results[key] }));
      let desc = arr.sort((a, b) => b.value - a.value);
      return resolve(desc[0].name);
    });
  }

  /**
   * Get the data for a youtube video
   * @param {object} params
   * @param {string} params.id Youtube video ID
   * @param {string} [params.part] 
   * @returns {object} 
   */
  static getVideo({ client, id, part }) {
    return new Promise(async (resolve, reject) => {
      await this._list({ client, id, part, type: "single", list: "videos" }).then(r => resolve(r)).catch(e => reject(e));
    });
  }

  static getVideos({ id, part }) {
    return new Promise(async (resolve, reject) => {
      await this._list({ client: "", id, part, type: "multiple", list: "videos" }).then(r => resolve(r)).catch(e => reject(e));
    });
  }

  static getChannel({ client, id, part }) {
    return new Promise(async (resolve, reject) => {
      await this._list({ client, id, part, type: "single", list: "channels" }).then(r => resolve(r)).catch(e => reject(e));
    });
  }
}

module.exports = YoutubeAPI;