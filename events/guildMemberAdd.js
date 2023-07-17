const Event = require('../structures/event.js');
const config = require('../config/config.json');
const database = require('../functions/database.js');

module.exports = new Event("guildMemberAdd", async (client, member) => {
  if (member.guild.id !== config.guildID) return;
  let creation = new Date(member.user.createdAt).getTime();

  client.log.member({
    type: "embed",
    color: config.successEmbedColor,
    author: {
      name: "[INFO] A New User has Joined the Server.",
      icon_url: member.displayAvatarURL()
    },
    description: `<@${member.user.id}> has joined the server.\n\nMember ID: ${member.user.id}\nMember Tag: ${member.user.username}#${member.user.discriminator}`,
    fields: [
      { name: "Account Created On", value: `<t:${Math.round(creation / 1000)}:f> (<t:${Math.round(creation / 1000)}:R>)`, inline: false },
      { name: "Joined", value: `<t:${Math.round(member.joinedTimestamp / 1000)}:f> (<t:${Math.round(member.joinedTimestamp / 1000)}:R>)`, inline: false }
    ]
  });

  member.roles.add(config.member_role);
  database.addUser(client, member.user.id);
});