const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, InteractionType, ButtonStyle, ComponentType } = require('discord.js');
const fetch = require('node-fetch');
const path = require("node:path");
const Event = require('../structures/event.js');
const config = require('../config/config.json');
const fs = require("fs");

module.exports = new Event("interactionCreate", async (client, interaction) => {
  //https://discordjs.guide/slash-commands/permissions.html#member-permissions

  if (interaction.isAutocomplete()) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return console.error(`No command matching ${interaction.commandName} was found.`);

    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error(error);
    }
  } else if (interaction.isChatInputCommand()) {  
    //interaction.client.newExp(interaction.member.id);

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return interaction.client.log.error(`No command matching ${interaction.commandName} was found.`);

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
  } else if (interaction.isButton() || interaction.isModalSubmit()) {

    //Don't handle the interactions that will be handled by collectors in the commands
    if (config.collectorInteractions.includes(interaction.customId.split("-")[0])) return;

    const interactionsPath = path.join(__dirname, `./${interaction.isButton() ? "button" : "modal"}Interactions`);
    const interactions = fs.readdirSync(interactionsPath).filter(file => file.endsWith('.js'));

    let params = interaction.customId.split("-");
    const event = require(path.join(interactionsPath, params[0]));
    event.run(interaction, params);
  }
});