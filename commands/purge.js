const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config/config.json');

module.exports = {
  data: new SlashCommandBuilder()
  .setName('purge')
  .setDescription('Purges a set amount of messages from the current channel.')
  .addIntegerOption(option =>
    option.setName('amount')
      .setDescription('Set the amount of messages to purge')
      .setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  async execute(interaction, client) {  
    let staff = await interaction.client.guilds.cache.get(config.guildID).members.fetch(interaction.member.id);

    if (!staff.permissions.has(PermissionFlagsBits.KickMembers)) {
      return interaction.reply({ content: "You do not have the correct permissions to use this.", ephemeral: true });
    }
      
    let options = interaction.options;
    let amount = interaction.options.getInteger("amount");

    await interaction.channel.bulkDelete(amount).then(async r => {
      await interaction.reply({ embeds: [{ color: config.successEmbedColor, description: `Successfully purged **${amount}** message(s).`}] });
      setTimeout(() => interaction.deleteReply(), 2000);
  
      interaction.client.log.staff({
        type: "embed",
        staff: interaction.member,
        title: "Messages Purged",
        color: config.amberEmbedColor,
        description: `Purged **${r.size}** message(s) from <#${interaction.channel.id}>`
      });
    }).catch(async error => {
      await interaction.reply({ embeds: [{ color: config.errorEmbedColor, description: ":x: Due to Discord Limitations, I cannot delete messages older than 14 days"}] });
      setTimeout(() => interaction.deleteReply(), 2000);
    });
  },
};