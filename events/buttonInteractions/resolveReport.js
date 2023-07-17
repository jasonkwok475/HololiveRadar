const Event = require('../../structures/event.js');
const config = require('../../config/config.json');

module.exports = new Event("resolveReport", async (interaction, params) => {
  let [ x, type, user, reported ] = params;
  let embed;

  if (type == "success") {
    embed = {
      color: config.successEmbedColor,
      title: `Your report has been resolved.`,
      description: 'Thank you for taking the time to help protect our community!',
    }
  } else {
    embed = {
      color: config.errorEmbedColor,
      title: `Your report has been deemed as spam.`,
      description: 'Please refrain from making random reports.\nAdditional submissions may result in a timeout.',
    }
  }
  embed.fields = [
    { name: `Reported User`, value: `<@${reported}>`, inline: true },
    { name: `Time of Report`, value: `<t:${Math.round(new Date(interaction.message.createdAt).getTime() / 1000)}:f>`, inline: true },
    { name: `Reason`, value: `${interaction.message.embeds[0].fields[3].value.replace("**Reason:**", "")}`, inline: false }
  ]

  await interaction.client.users.cache.get(user).send({embeds: [embed]});
  await interaction.reply({ embeds: [{
    color: config.successEmbedColor,
    description: type == "success" ? `Successfully resolved report from <@${user}>\nThe user has been notified.` : `Successfully marked report from <@${user}> as spam\nThe user had been notified.`
  }], ephemeral: true });

  let report = interaction.message.embeds[0];
  report.fields.push({
    name: "⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯",
    value: `\u202F`,
    inline: false
  },
  { name: `Result`, value: type == "success" ? "Report Resolved" : "Marked as Spam", inline: true },
  { name: `Moderator`, value: `<@${interaction.member.id}>`, inline: true });

  await interaction.client.channels.cache.get(config.report_logs).send({ embeds: [report] });
  return await interaction.message.delete();
});