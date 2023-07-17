const { ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle  } = require('discord.js');
const Event = require('../structures/event.js');

module.exports = new Event("threadCreate", async (client, channel) => {
  if (channel.parent.type == ChannelType.GuildForum) {
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Close Post").setCustomId(`post-close`).setStyle(ButtonStyle.Danger)
    );

    channel.send({ content: `**Post Guidelines**\n` + channel.parent.topic, components: [buttons] });
  }
});