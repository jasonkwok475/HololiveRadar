const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Event = require('../../structures/event.js');
const config = require('../../config/config.json');
const database = require('../../functions/database.js');

module.exports = new Event("modmodal", async (interaction, params) => {
  [ x, type, id ] = params, f = interaction.fields, client = interaction.client;
  let reason = f.getTextInputValue('reason') || "None";
  let user = client.users.cache.get(id);
  let staff = await client.guilds.cache.get(config.guildID).members.fetch(interaction.member.id);

  if (!staff._roles.includes(config.admin_role) && !staff._roles.includes(config.staff_role)) {
    return interaction.reply({ content: "You do not have the correct permissions to use this.", ephemeral: true });
  }

  let guildMembers = client.guilds.cache.get(config.guildID).members;
  if (type == "unban") return guildMembers.unban(id, { reason }).then(info => sendLog(info, "unbanned")).catch(err => interaction.reply("Unban failed."));
  if (type == "ban") return guildMembers.ban(id, { reason }).then(info => sendLog(info, "banned")).catch(err => interaction.reply("Ban failed."));
  if (type == "kick") return guildMembers.kick(id, { reason }).then(info => sendLog(info, "kicked")).catch(err => interaction.reply("Kick failed."));
  if (type == "timeout") {
    let duration = interaction.fields.getTextInputValue(`duration`);
    let secs = getSeconds(duration);
    if (secs == "error") return interaction.reply("Please provide a valid duration.");
    let mem = await client.guilds.cache.get(config.guildID).members.fetch(id);
    if (!mem || !mem.user) return interaction.reply("Error: User was not found.");
    if (mem.isCommunicationDisabled()) return interaction.reply({ embeds: [{color: config.amberEmbedColor, description: `<@${user_id}> is already timed out until <t:${Math.round(mem.communicationDisabledUntilTimestamp / 1000)}:f>`}] })
    return mem.timeout(secs, reason).then(info => sendLog(info, "timed out")).catch(err => {
      console.log(err);
      interaction.reply("Timeout failed.");
    });
  }
  if (type == "warn") return sendLog("", "warned");

  async function sendLog(info, text) {
    let i = text == "warned" ? "warned\n" : text == "timed out" ? `timed out for ${f.getTextInputValue('duration')}.\n⠀` : `${text} from the server.\n`;
    let des = `<@${user.id}> has been ` + i;

    //!In the future, integrate mod action logs in the logger
    const infoMessage = {
      color: ["timeout", "warn"].includes(type) ? config.amberEmbedColor : (text == "unbanned" ? config.successEmbedColor : config.errorEmbedColor),
      author: {
        name: `[MOD] A User has Been ${text.charAt(0).toUpperCase() + text.slice(1)}`,
        icon_url: user.displayAvatarURL()
      },
      description: des,
      fields: [
        { name: "Moderator", value: `<@${interaction.member.id}>`, inline: true },
        { name: "Member", value: `Tag: ${user.username}#${user.discriminator}\nID: ${user.id}`, inline: true },
        { name: "Reason", value: `${reason}`, inline: false }
      ],
      footer: { text: `${config.bot_name}.js` },
      timestamp: new Date()
    };
    
    client.channels.cache.get(config.guild_logs).send({ embeds: [infoMessage] });
    if (!["timeout", "warn"].includes(type)) client.channels.cache.get(config.member_logs).send({ embeds: [infoMessage] });

    const notification = {
      color: config.errorEmbedColor,
      title: `Moderation Notification`,
      description: text == "warned" ? "A Moderator from Hololive Music Hub has issued you a warning." : `You have been **${text}** from Hololive Music Hub.`,
      fields: [{name: "Moderator", value:`<@${interaction.member.id}>`, inline: true}],
      footer: { text: config.bot_name },
      timestamp: new Date()
    }
    if (["timed out", "warned"].includes(text)) {
      notification.color = config.amberEmbedColor;
      if (text == "timed out") notification.fields.push({name: "Duration", value: `${f.getTextInputValue('duration')}`, inline: true });
    } else if (text == "unbanned") notification.color = config.successEmbedColor;
    notification.fields.push({name: "Reason", value:`${reason}`, inline: false});

    client.users.cache.get(user.id).send({ embeds: [notification] });

    const msg = {
      color: config.successEmbedColor,
      description: `Successfully ${text} <@${user.id}>.`
    }
    await interaction.reply({ embeds: [msg] });

    let num = type == "warn" ? 0 : type == "timeout" ? 1 : type == "kick" ? 2 : 3;
    await database.query(`INSERT INTO \`moderator-log\` (\`moderator\`, \`user\`, \`type\`, \`reason\`, \`duration\`) VALUES ('${interaction.member.id}', '${user.id}', '${num}', '${reason}', '${type == "timeout" ? f.getTextInputValue('duration') : null}')`).catch(e => {
      client.log.error(e);
    });
  }

  function getSeconds(text) {
    let t = text[text.length - 1].toLowerCase();
    let time = text.slice(0, text.length - 1);
    let seconds;

    if (!["d", "h", "m"].includes(t) || isNaN(parseInt(time))) return "error";

    if (t == "d") seconds = time * 1000 * 60 * 60 * 24;
    if (t == "h") seconds = time * 1000 * 60 * 60;
    if (t == "m") seconds = time * 1000 * 60;

    return seconds;
  }
});