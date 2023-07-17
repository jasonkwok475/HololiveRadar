const Event = require('../../structures/event.js');
const config = require('../../config/config.json');
const database = require('../../functions/database.js');

module.exports = new Event("role", async (interaction, params, role) => {
  let type = params[1];
  let roleID = role || config[`${type}_role`];

  let cooldown = await interaction.client.checkCooldown({ interaction, name: "role-" + roleID, duration: 5 });
  if (cooldown.status == "oncooldown") return interaction.client.interactionOnCooldown({ interaction, time: cooldown.time });

  let notif_roles = config.roles;
  notif_roles.push(config.music_role, config.premiere_role, config.weekly_role);
  let member = interaction.guild.members.cache.get(interaction.user.id);
  let roles = interaction.member._roles;
  let title = "", desc = "", msg = "", buttonmsg = "";

  if (roles.includes(roleID)) {
    member.roles.remove(roleID);   
    title = "[INFO] Role Removed";
    desc = `Removed role <@&${roleID}> from`;
    msg = `The role <@&${roleID}> has been removed.`;
    buttonmsg = "Get Member Role";
    let current_roles = interaction.member._roles.filter(x => x !== roleID);
    if (!current_roles.some(x => notif_roles.includes(x))) member.roles.remove(config.seperator_role);
  } else {
    member.roles.add([roleID, config.seperator_role]);
    title = "[INFO] Role Given";
    desc = `Gave role <@&${roleID}> to`;
    msg = `You have been given the role <@&${roleID}>.`;
    buttonmsg = "Remove Member Role";
  }

  interaction.reply({
    embeds: [{
      color: config.informationEmbedColor,
      description: msg
    }], ephemeral: true
  });

  interaction.client.log.member({
    type: "embed",
    color: config.informationEmbedColor,
    author: { name: title, icon_url: member.displayAvatarURL() },
    description: `${desc} <@${member.user.id}>.\n\nRole ID: ${roleID}\nMember ID: ${member.user.id}\nMember Tag: ${member.user.username}#${member.user.discriminator}`
  });

  if (role && (params[2] == "memberCommand")) {
    let buttons = interaction.message.components[interaction.message.components.length - 1];
    buttons.components[0].data.label = buttonmsg;
    interaction.message.edit({ embeds: interaction.message.embeds, components: [interaction.message.components[0], buttons] });
  }
});