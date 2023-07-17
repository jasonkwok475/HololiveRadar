const mysql = require('mysql');
const path = require("path");
const self = require("./database.js");
require("dotenv").config({ path: path.resolve(__dirname, '../.env') });
const encodeQuery = "SET character_set_results = 'utf8mb4', character_set_client = 'utf8mb4', character_set_connection = 'utf8mb4', character_set_database = 'utf8mb4', character_set_server = 'utf8mb4'";

//CTRL K C - comment
//CTRL K U - undo comment

let database = mysql.createConnection({
  host: process.env.HOST,
  user: "holomusic_user",//process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DATABASE
});

/**
 * @typedef {object} QueryResult
 * @property {array} results Results of the query, if any
 * @property {array} fields Information about the returned result fields, if any
 */

/**
 * Discord client object
 * @typedef {object} DiscordClient
 */

/**
 * @class
 * @classdesc Class for interacting with the local MYSQL Database
 */
class Database {

  /**
   * Run a query
   * @param {string} query 
   * @returns {Promise<QueryResult>} Returns the results of the query, if any.
   */
  static query(query) {
    //!In the future, if fields is not used, just return results without the object and change all references to query()
    //This makes it so that results does not neet to be gotten from the .query() function, and can just be stored into a variable
    return new Promise((resolve, reject) => {
      database.query(query, (error, results, fields) => {
        if (error) return reject(error);
        resolve({ results, fields });
      });
    });
  }

  /**
   * Increase the youtube request counter by an amount
   * @param {integer} num Amount to increase the request amount by
   */
  static async addYoutubeRequestCount(num) {
    await this.query(`UPDATE \`apiusage\` SET \`current\`=\`current\`+${num} WHERE id=1`).catch(e => console.log(e));
  }

  static failedSub(id, client) {
    this.query(`UPDATE channels SET verify_status=1 WHERE id='${id}'`).catch(e => client.log.errorSQL("UPDATE", "channels", e));
  }

  static verifiedChannel(channel, client) {
    this.query(`UPDATE channels SET verify_status=0, last_verified=CURRENT_TIMESTAMP WHERE id='${channel.id}'`).catch(e => client.log.errorSQL("UPDATE", "channels", e));
  }

  static addTimesPlayed(client, track) {
    let url = new URL(track.url);
    let params = url.searchParams;

    this.query(`UPDATE \`music\` SET \`plays\`=\`plays\`+1 WHERE \`video_id\`='${params.get("v")}'`).catch(e => {
      client.log.errorSQL("UPDATE", "music", e);
    });
  }

  static async addUser(client, id) {
    try {
      if (!id) return console.log(new Error(`A discord user ID must be provided.`));
      let data = await this.query(`SELECT * FROM \`members\` WHERE \`id\`='${id}'`);

      if (data.results.length !== 0) return;
      await this.query(`INSERT INTO \`members\` (\`id\`) VALUES ('${id}')`);
    } catch (e) { client.log.error(e); }
  }

  static getAllMembers() {
    return new Promise(async (resolve, reject) => {
      try {
        await this.query(encodeQuery);
        let data = await this.query("SELECT * FROM channels");
        resolve(data.results);
      } catch (e) { reject(e); }
    });
  }

  static getMember(id) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.query(encodeQuery);
        let data = await this.query(`SELECT * FROM channels WHERE \`id\`='${id}'`);
        resolve(data.results[0]);
      } catch (e) { reject(e); }
    })
  }

  static getAverageQueries() {
    return new Promise(async (resolve, reject) => {
      try {
        let data = await this.query("SELECT s1.variable_value / s2.variable_value AS queries FROM information_schema.global_status s1, information_schema.global_status s2 WHERE s1.variable_name='queries' AND s2.variable_name ='uptime';");
        if (data.results.length == 0) return resolve("Unknown");
        return resolve(data.results[0].queries);
      } catch (e) { reject(e); }
    });
  }

  static getDatabaseSize() {
    return new Promise(async (resolve, reject) => {
      try {
        let data = await this.query("SELECT table_schema 'DB Name', SUM(data_length + index_length) / 1024 / 1024 'DB Size in MB' FROM information_schema.tables WHERE table_schema='HoloMusic' GROUP BY table_schema; ");
        if (data.results.length == 0) return resolve("Unknown");
        return resolve(data.results[0]["DB Size in MB"]);
      } catch (e) { reject(e); }
    });
  }

  static getAllSongs() {
    return new Promise(async (resolve, reject) => {
      try {
        let data = await this.query("SELECT * FROM \`music\` WHERE \`private\`='0'");
        return resolve(data.results);
      } catch (e) { reject(e); }
    });
  }

  static getTopicSongs(id) {
    return new Promise(async (resolve, reject) => {
      try {
        let data = await this.query(`SELECT * FROM \`music_topic\` WHERE \`channel\`='${id}'`);
        return resolve(data.results);
      } catch (e) {reject(e)}
    });
  }


  /**
   * Gets the next time the youtube quota resets, then sets a timeout for that time
   * @param {DiscordClient} client Discord client object
   */
  static async getNextYoutubeQuotaReset(client) {
    let { results } = await this.query("SELECT * FROM `apiusage` WHERE id='1'").catch(e => client.log.error(e));

    if (Date.now() >= results[0].next_reset) {
      this._resetYoutubeQuota(client);
    } else {
      setTimeout(() => this._resetYoutubeQuota(client), (results[0].next_reset - Date.now()));
    }
  }

  /**
   * Resets the saved youtube quota
   * @param {DiscordClient} client Discord client object
   */
  static async _resetYoutubeQuota(client) {
    let { results } = await this.query("SELECT * FROM `apiusage`").catch(e => client.log.error(e));

    let oldreset = parseInt(results[0].next_reset);
    let newreset = oldreset += (1000 * 60 * 60 * 24); //Add a day

    await this.query(`UPDATE \`apiusage\` SET \`current\`='0', \`next_reset\`='${newreset}' WHERE id=1`).then(r => {
      client.log.info(`Youtube Daily Quota reset. Total Usage: ${client.commaNumber(results[0].current)}/10,000. Next reset at: <t:${newreset / 1000}:f>`);
      if (newreset > 0) { setTimeout(() => { this._resetYoutubeQuota(client); }, (newreset - Date.now())); }
      else { this._resetYoutubeQuota(client); }
    }).catch(e => client.log.error(e));

    await this.query(`UPDATE \`apiusage\` SET \`current\`='0', \`next_reset\`='${newreset}' WHERE id=2`).then(r => {
      client.log.info(`Daily Video Notifications Count reset. Total Notifications: ${client.commaNumber(results[1].current)}. Next reset at: <t:${newreset / 1000}:f>`);
    }).catch(e => client.log.error(e));
  }

  static async addExp(user, amount) {
    await this.query(`UPDATE \`members\` SET \`xp\`=\`xp\`+${amount} WHERE \`id\`='${user}'`).catch(e => console.error(e));
  }
}

module.exports = Database;