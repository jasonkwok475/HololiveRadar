const Event = require('../structures/event.js');
const config = require('../config/config.json');

module.exports = new Event("guildMemberRemove", async (client, member) => {
  if (member.guild.id !== config.guildID) return;
  let creation = new Date(member.user.createdAt).getTime();

  client.log.member({
    type: "embed",
    color: config.successEmbedColor,
    author: {
      name: "[INFO] A User has Left the Server",
      icon_url: member.displayAvatarURL()
    },
    description: `<@${member.user.id}> has left the server.\n\nMember ID: ${member.user.id}\nMember Tag: ${member.user.username}#${member.user.discriminator}`,
    fields: [
      { name: "Account Created On", value: `<t:${Math.round(creation / 1000)}:f> (<t:${Math.round(creation / 1000)}:R>)`, inline: false },
      { name: "Joined", value: `<t:${Math.round(member.joinedTimestamp / 1000)}:f> (<t:${Math.round(member.joinedTimestamp / 1000)}:R>)`, inline: false },
      { name: "Left", value: `<t:${Math.round(Date.now() / 1000)}:f> (<t:${Math.round(Date.now() / 1000)}:R>)`, inline: false }
    ]
  });
});
