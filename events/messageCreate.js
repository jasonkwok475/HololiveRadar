const Event = require('../structures/event.js');
const config = require('../config/config.json');
const botdata = require('../config/botdata.json');
const database = require('../functions/database.js');
const { weightedRandom } = require('../scripts/functions.js');

module.exports = new Event("messageCreate", async (client, message) => {
  if (config.delete_channels.includes(message.channel.id) && !message.author.bot) return message.delete();
  if (message.author.bot) return;

  client.newExp(message);

  if (message.content == `<@${config.clientID}>`) return message.reply("<:pingedsock:1094740889689141295>");

  //Delete message if it was sent in one of the status channels
  let status = botdata.status_message.filter(x => x.channel == message.channel.id);
  if (status[0]) message.delete();
});