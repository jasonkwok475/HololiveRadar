const { ActionRowBuilder, ButtonBuilder } = require("discord.js");
const Event = require('../../structures/event.js');
const config = require("../../config/config.json");

module.exports = new Event("report", async (interaction, params) => {
  let [ x, reportedId, channelId ] = params;
  let reason = interaction.fields.getTextInputValue("reason");
  let reportedUser = (await interaction.client.guilds.cache.get(config.guildID).members.fetch()).get(reportedId);

  const embed = {
    color: config.informationEmbedColor,
    // author: {
    //   name: interaction.member.username,
    //   icon_url: interaction.member.avatarURL()
    // },
    fields: [
      { name: `Submitted By`, value: `<@${interaction.member.id}>`, inline: false },
      { name: `Reported User`, value: `<@${reportedId}>`, inline: true },
      { name: `Channel`, value: `<#${channelId}>`, inline: true },
      { name: `⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯`, value: `**Reason:**\n${reason}`, inline: false }
    ],
    timestamp: new Date()
  }

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`resolveReport-success-${interaction.member.id}-${reportedId}`).setLabel("Resolve Report").setStyle("Success"),
    new ButtonBuilder().setCustomId(`resolveReport-warn-${interaction.member.id}-${reportedId}`).setLabel("Spam (Send Warning)").setStyle("Danger")
  )

  await interaction.client.channels.cache.get(config.reports).send({ embeds: [embed], components: [buttons] });
  await interaction.reply({embeds: [{ color: config.successEmbedColor, description: `Successfully submitted report for <@${reportedId}>!`}], ephemeral: true});
});