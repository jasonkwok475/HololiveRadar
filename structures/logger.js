/**
 * An object of arguments for the message to be logged
 * @typedef {object} LogArgs
 * @property {('message'|'embed')} type Log message type
 * @property {array} [fields] Array of fields to be put in the embed
 * @property {string|integer} [color] Hex Code / Base 16 Integer
 * @property {string} [title] Embed title
 * @property {string} [description] Embed description
 * @property {string} [image] Embed image URL
 * @property {string} [thumbnail] Embed thumbnail URL
 * @property {object} [author] Discord member object
 * @property {object} staff Staff member object (Required for staff logging)
 */

/**
 * @class
 * @classdesc Custom logger made for discord bots
 */
class Logger {
  /**
   * Default logging embed color
   */
  static default_color = "5CB3FF";

  /**
   * 
   * @param {object} params 
   * @param {object} params.client Discord client object
   * @param {object} params.channels
   * @param {string} params.channels.member Channel to send Guild Member logs
   * @param {string} params.channels.staff Channel to send Staff Logs
   * @param {string} params.channels.server Channel to send server side bot logs
   * @param {string} params.channels.classification Channel to send video classification logs
   * @param {string} params.owner Discord ID of the bot owner
   */
  constructor({ client, channels, owner }) {
    if (!client) throw new Error("Please provide a discord client object.");
    if (!channels) throw new Error("Please provide the logging channels.");

    this.client = client;
    this.channels = channels;
    this.owner = owner;
  }

  /**
   * Sends a raw message to the server bot logs channel
   * @param {string} message 
   */
  server(message) {
    if (!message) return console.log(new Error("Please provide a message to send."));
    this.client.channels.cache.get(this.channels["server"]).send(message);
  }

  /**
   * Sends an information log to the server bot logs channel
   * @param {string} message 
   */
  info(message) {
    this._sendServerLog({
      message: message,
      type: "info",
      channel: this.channels["server"]
    });
  }

  /**
   * Sends an SQL error message to server logs
   * @param {string} type Type of SQL query
   * @param {string} table Table the errored SQL query was targeting
   * @param {string} error Error message
   */
  errorSQL(type, table, error) {
    this._sendServerLog({
      message: `Error while running a \`${type}\` SQL query for \`${table}\`: \`\`\`${error}\`\`\``,
      type: "error",
      channel: this.channels["server"]
    });
  }

  /**
   * Sends an error log to the server bot logs channel
   * @param {string} message 
   */
  error(message) {
    let error = message.stack ? `: \`\`\`${message.stack}\`\`\`` : "";
    this._sendServerLog({
      message: message + error,
      type: "error",
      channel: this.channels["server"]
    });
  }

  /**
   * Sends debug messages to both console and the server logs channel
   * @param {string} message 
   */
  debug(message) {
    if (!this.client.debugBot) return;
    if (["discord", "both"].includes(this.client.debugType)) this._sendServerLog({
      message: message,
      type: "debug",
      channel: this.channels["server"]
    });
    if (["console", "both"].includes(this.client.debugType)) console.log(` - ` + message);
  }

  /**
   * Send a log to the guild staff logs channel
   * @param {LogArgs} params 
   */
  staff(params) {
    this._sendGuildLog({
      args: params,
      type: "staff",
      channel: this.channels["staff"]
    });
  }

  /**
   * Send a log to the guild member logs channel
   * @param {LogArgs} params 
   */
  member(params) {
    this._sendGuildLog({
      args: params,
      type: "member",
      channel: this.channels["member"]
    });
  }

  /**
   * Sends a log to the video classification logs channel
   * @param {LogArgs} params 
   */
  classification(params) {
    this._sendGuildLog({
      args: params,
      type: "staff",
      channel: this.channels["classification"]
    });
  }

  /**
   * Sends a log to the server bot logs channel
   * @param {object} params
   * @param {string} params.message
   * @param {('info'|'error'|'debug')} params.type
   * @param {string|integer} params.channel 
   * @protected
   */
  _sendServerLog(params) {
    let { message, type, channel } = params;
    if (!message) return console.log(new Error("Please provide a message to send."));
    if (!["info", "error", "debug"].includes(type)) return console.log(new Error("An invalid log type was provided."));

    let string = type == "info" ? `**[INFO]**   -   ` : type == "debug" ? `**[DEBUG]**   -   ` : `**[ERROR]** | <@${this.owner}> |   -   `;
    this.client.channels.cache.get(channel).send(string + message);
  }

  /**
   * Sends a log to the Guild log channels
   * @param {object} params 
   * @param {LogArgs} params.args
   * @param {'member'|'staff'} params.type
   * @param {string|integer} params.channel 
   * @protected
   */
  _sendGuildLog(params) {
    let { args, type, channel } = params;
    if (!args.type) return console.log(new Error("Please provide a message type."));
    if (!["member", "staff"].includes(type)) throw new Error("An invalid log type was provided.");
    if (!args.fields && !args.title && !args.description) return console.log(new Error("Please provide either a title, fields, or description."));
    if ((args.type == "message") && !args.description) return console.log(new Error("A description must be provided for message log types."));
    if (!args.color) args.color = this.default_color;

    let embed = {
      color: !Number.isNaN(args.color) ? args.color : parseInt(args.color, 16),
      footer: { text: `Hololive Radar.js` },
      timestamp: new Date()
    }
    if (args.thumbnail) embed.thumbnail = { url: args.thumbnail };
    if (args.description) embed.description = args.description;

    if (type == "member") {
      if (!["message", "embed"].includes(args.type)) return console.log(new Error("Please provide a valid message type."));

      if (args.title) embed.title = args.title;
      if (args.author) embed.author = args.author;
      if (args.fields) embed.fields = args.fields;
      if (args.image) embed.image.url = args.image;
      if (args.thumbnail) embed.thumbnail.url = args.thumbnail;
    } else if (type == "staff") {
      if (!args.staff) return console.log(new Error("Please provide a staff member discord object for staff logging."));
      if (!args.title) return console.log(new Error("A title is required for staff logging."));

      let fields = [
        { name: "Staff", value: `<@${args.staff.user.id}>`, inline: true },
        { name: "Time", value: `<t:${Math.trunc(Date.now() / 1000)}:f>`, inline: true }
      ]
      if (args.fields) fields.push(...args.fields);
      embed.fields = fields;
      embed.author = {
        name: `[STAFF] ${args.title}`,
        icon_url: args.staff.displayAvatarURL()
      }
    }

    let message = (args.type == "message") && (type !== "staff") ? args.description : { embeds: [embed] };
    this.client.channels.cache.get(channel).send(message);
  }
}

module.exports = Logger;