const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const Event = require('../../structures/event.js');
const config = require('../../config/config.json');

module.exports = new Event("new_token", async (interaction, params) => {
  let user = await interaction.client.guilds.cache.get(config.logging).members.fetch(interaction.member.id);
  if (!user._roles.includes(config.creator_role)) return interaction.reply({ content: "You do not have the correct permissions to use this.", ephemeral: true });

  const modal = new ModalBuilder()
    .setCustomId(`tokens`)
    .setTitle(`Authorize New Google OAuth2 Tokens`)
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tokens_link').setLabel('Link:').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(await interaction.client.playlist.getOAuthUrl())),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('received_link').setLabel('Authorized Link:').setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(1))
    );

  return await interaction.showModal(modal);
});