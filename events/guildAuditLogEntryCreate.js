const { AuditLogEvent } = require('discord.js');
const fetch = require('node-fetch');
const path = require("node:path");
const Event = require('../structures/event.js');
const config = require('../config/config.json');

module.exports = new Event("guildAuditLogEntryCreate", async (client, entry, guild) => {
  return;

  //!Audit logs are annoying, just don't use them


  if (guild.id !== config.guildID) return;
  let embed = {};
  //console.log(entry);

  switch(entry.action) {
    case AuditLogEvent.GuildUpdate: {
      break;
    }
    case AuditLogEvent.ChannelCreate: {
      break;
    }
    case AuditLogEvent.ChannelUpdate: {
      break;
    }
    case AuditLogEvent.ChannelDelete: {
      break;
    }
    case AuditLogEvent.StageInstanceCreate: {
      embed = {
        color: config.successEmbedColor,
        title: `Stage Instance Created: ${entry.changes.find(x => x.key == "topic").new}`,
        description: `Channel: <#${entry.extra.channel.id}>\nCreated by: <@${entry.executor.id}>\nTime: <t:${Math.round(Date.now() / 1000)}:f>`,
      }
      sendAuditLog(embed);
      break;
    }
    case AuditLogEvent.StageInstanceUpdate: {
      let changes = '';
      for (row of entry.changes) {
        changes = changes + `**${row.key.charAt(0).toUpperCase() + row.key.slice(1)}**: ${row.old} 🠖 ${row.new}\n`;
      }
      embed = {
        color: config.informationEmbedColor,
        title: `Stage Instance Updated`,
        description: `Channel: <#${entry.extra.channel.id}>\nUpdated by: <@${entry.executor.id}>\nTime: <t:${Math.round(Date.now() / 1000)}:f>`,
        fields: [ { name: "Changes", value: changes, inline: false } ]
      }
      sendAuditLog(embed);
      break;
    }
    case AuditLogEvent.StageInstanceDelete: {
      embed = {
        color: config.amberEmbedColor,
        title: `Stage Instance Deleted: ${entry.changes.find(x => x.key == "topic").old}`,
        description: `Channel: <#${entry.extra.channel.id}>\nDeleted by: <@${entry.executor.id}>\nTime: <t:${Math.round(Date.now() / 1000)}:f>`,
      }
      sendAuditLog(embed);
      break;
    }
  }

  function sendAuditLog(e) {
    client.channels.cache.get(config.audit_log).send({ embeds: [e] });
  }
});