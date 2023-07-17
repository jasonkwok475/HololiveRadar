const { REST, Routes } = require('discord.js');
const { clientID, guildID } = require('../config/config.json');
const fs = require('node:fs');
const path = require("path");
const Event = require('../structures/event.js');
require("dotenv").config({ path: path.resolve(__dirname, '../.env') });
require("colors");
const commands = [];

const commandsPath = path.join(__dirname, '../commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
//const commandFiles = fs.readdirSync('../commands').filter(file => file.endsWith('.js'));

module.exports = new Event("deploy-commands", () => {
  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    commands.push(command.data.toJSON());
  }
  
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  
  (async () => {
    try {
      console.log(`Started refreshing ${commands.length} application (/) commands.`.yellow);
  
      const data = await rest.put(
        Routes.applicationGuildCommands(clientID, guildID),
        { body: commands },
      );
  
      console.log(`Successfully reloaded ${data.length} application (/) commands.`.green);
    } catch (error) {
      console.error(error);
    }
  })();
})