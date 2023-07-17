const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Event = require('../../structures/event.js');
const config = require('../../config/config.json');

module.exports = new Event("mod", async (interaction, params) => {
  let type = params[1], id = params[2];

  let guildBans = await interaction.guild.bans.fetch();
  let guildMembers = await interaction.client.guilds.cache.get(config.guildID).members.fetch();
  let gmember = guildMembers.get(id) || guildBans.get(id);
  let staff = await interaction.client.guilds.cache.get(config.guildID).members.fetch(interaction.member.id);

  if (!staff._roles.includes(config.admin_role) && !staff._roles.includes(config.staff_role)) {
    return interaction.reply({ content: "You do not have the correct permissions to use this.", ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId(`modmodal-${type}-${id}`)
    .setTitle(`${type.charAt(0).toUpperCase() + type.slice(1)} ${gmember.user.username}`)
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(`reason`).setLabel('Reason:').setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(type == "unban" ? false : true).setMinLength(1).setPlaceholder(type == "unban" ? "A reason is not required." : ""))
    );

  if (type == "timeout") modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duration').setLabel('Duration (d,h,m):').setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(5).setPlaceholder(`20m / 1h / 3d`).setRequired(true)));

  await interaction.showModal(modal);
});