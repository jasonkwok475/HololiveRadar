const Event = require('../../structures/event.js');
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, '../../.env') });
const { Publicity, PasteClient, ExpireDate } = require("pastebin-api");
const pClient = new PasteClient(process.env.pastebin_api_key);
const config = require("../../config/config.json");
const database = require("../../functions/database.js");

module.exports = new Event("post", async (interaction, params) => {
  let type = params[1];
  if (type == "close") {
    if (interaction.member.id !== interaction.channel.ownerId) return interaction.reply({ content: "This is not your post, you are not allowed to use this.", ephemeral: true  });
    interaction.deferUpdate();

    interaction.channel.send(`This forum post will be closed in 5 seconds.`);

    logMessages();
    await interaction.client.wait(5000);
    await interaction.channel.delete();
  }

  //!This only works for messages sent within 2 weeks
  async function logMessages() {
    let thread = interaction.channel;
    let messages = await thread.messages.fetch();
    let code = "", counter = 0;

    for (let [messageID, message] of Array.from(messages).reverse()) {
      if (counter == 0) {
        code += `${message.author.username} > ${message.content}`;
        code += "\n-------------------------------------------------------\n";
      } else {
        code += `\n${interaction.client.newDate(message.createdTimestamp)} - ${message.author.username} > ${message.content}`
      }
      counter++;
    }

    code += `\n\n\nForum post closed at ${interaction.client.newDate()}.`;

    const userToken = await pClient.login({ name: process.env.pasteName, password: process.env.pastePassword });
    const url = await pClient.createPaste({
      code: code,
      expireDate: ExpireDate.Never,
      name: `${thread.parent.name} > ${thread.name}`,
      publicity: Publicity.Unlisted,
      apiUserKey: userToken
    });
    logPaste(url);
  }

  async function logPaste(link) {
    let linkArray = link.split("/");
    let thread = interaction.channel;

    const e = {
      color: config.informationEmbedColor,
      title: `Forum thread post closed`,
      fields: [
        { name: "Post", value: `${thread.parent.name} > ${thread.name}`, inline: false },
        { name: "Log", value: `${link}`, inline: false }
      ]
    }
    interaction.client.channels.cache.get(config.forum_logs).send({ embeds: [e] });

    await database.query(`INSERT INTO \`forum-log\` SET \`link\`='${linkArray[linkArray.length - 1]}', \`member\`='${interaction.member.id}'`);
  }
});