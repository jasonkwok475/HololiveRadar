const Event = require('../../structures/event.js');

module.exports = new Event("post", async (interaction, params) => {
  let link = interaction.fields.getTextInputValue("received_link");

  await interaction.client.playlist._getNewTokensFromLink(link).then(tokens => {
    interaction.message.delete();
    interaction.reply({ content: "Successfully authorized new Google tokens.", ephemeral: true });
    interaction.client.playlist.grantEmbed = null;

    interaction.client.log.debug("Successfully authorized new Google OAuth2 tokens.");

  }).catch(e => interaction.reply({ content: "Error. Failed to get new tokens: " + e, ephemeral: true }));
});