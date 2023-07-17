const Event = require('../../structures/event.js');
const config = require('../../config/config.json');
const database = require('../../functions/database.js');

module.exports = new Event("notification", async (interaction, params) => {
  let cooldown = await interaction.client.checkCooldown({ interaction, name: params.join("-"), duration: 5 });
  if (cooldown.status == "oncooldown") return interaction.client.interactionOnCooldown({ interaction, time: cooldown.time });

  try {
    let notifType = params[1], type = params[2];
    let tablename = notifType == "premiere" ? "sched" : "notifs";
    let rowname = notifType == "premiere" ? 5 : 10;
    
    let video_id = interaction.message.embeds[0].data.url.split("=")[1];
    let { results } = await database.query(`SELECT * FROM \`${tablename}-${video_id}\` WHERE \`user_id\`='${interaction.user.id}'`);

    if (results.length == 1) {
      let live = results[0].live_notif;
      let second = results[0][`${rowname}_notif`];
      if (type == "live") live = live == 1 ? 0 : 1;
      if (type == rowname) second = second == 1 ? 0 : 1;

      await database.query(`UPDATE \`${tablename}-${video_id}\` SET \`live_notif\`='${live}', \`${rowname}_notif\`='${second}' WHERE \`user_id\`='${interaction.user.id}'`).then(r => {
        let msg;
        if (type == "live") {
          msg = live == 1 ? `You will now be notified when this event goes live.` : `You will now no longer be notified when this event goes live.`;
        } else {
          msg = second == 1 ? `You will now be notified ${rowname} minutes before this event.` : `You will now no longer be notified ${rowname} minutes before this event.`;
        }
        interaction.reply({
          embeds: [{
            color: config.informationEmbedColor,
            description: msg
          }], ephemeral: true
        });
      });
    } else {
      await database.query(`INSERT INTO \`${tablename}-${video_id}\` (user_id, live_notif, \`${rowname}_notif\`) VALUES ('${interaction.user.id}', '${type == "live" ? 1 : 0}', '${type == rowname ? 1 : 0}')`).then(r => {
        let msg = `You will now be notified ${rowname} minutes before this event.`
        if (type == "live") msg = `You will now be notified when this event goes live.`;
        interaction.reply({
          embeds: [{
            color: config.informationEmbedColor,
            description: msg
          }], ephemeral: true
        });
      });
    }
  } catch (e) {
    interaction.client.log.error(e);
    return interaction.reply({content: `Ran into an unexpected error. Please contact a moderator for more information.`, ephemeral: true});
  }
});