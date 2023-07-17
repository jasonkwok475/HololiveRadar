const Event = require('../../structures/event.js');
const config = require('../../config/config.json');

module.exports = new Event("close_error", async (interaction, params) => {
  let user = await interaction.client.guilds.cache.get(config.logging).members.fetch(interaction.member.id);
  if (!user._roles.includes(config.creator_role)) {
    return interaction.reply({ content: "You do not have the correct permissions to use this.", ephemeral: true });
  }
  //interaction.reply({ content: "Error has been acknowledged.", ephemeral: true });
  interaction.client.log.info(`The following error has been acknowledged: \`\`\`${interaction.message.content}\`\`\``);
  return interaction.message.delete();
});