const { SlashCommandBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const config = require('../config/config.json');

module.exports = {
  data: new SlashCommandBuilder()
  .setName('report')
  .setDescription('Report a fellow server member')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user to report')
      .setRequired(true))
  .addChannelOption(option => 
    option.setName('channel')
      .setDescription('(Optional) The channel to report the user in')
      .setRequired(false)),
  async execute(interaction, client) { 
    let member = interaction.options.getUser('user');
    let gmember = (await interaction.client.guilds.cache.get(config.guildID).members.fetch()).get(member.id);
    let channel = interaction.options.getChannel('channel');

    const modal = new ModalBuilder().setCustomId(`report-${member.id}-${channel?.id || interaction.channel.id}`).setTitle(`Report ${member.username}#${member.discriminator}`).addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(1000).setRequired(true))
    );

    return await interaction.showModal(modal);
  },
};