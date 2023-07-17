const Event = require('../../structures/event.js');
const database = require('../../functions/database.js');
const config = require('../../config/config.json');

module.exports = new Event("newSong", async (client, song, channel) => {
  let type = song.type == 1 ? "Original" : "Cover";
  client.channels.cache.get(config.covers_channel).send(`**${channel.name}** Uploaded a New **${type}** Song!\n<@&${config.music_role}> <@&${channel.role}>\nhttps://www.youtube.com/watch?v=${song.video_id}`).then(msg => msg.crosspost());
  
  await database.query(`UPDATE \`music\` SET \`sent\`='1' WHERE \`id\`='${song.id}'`).catch(e => client.log.errorSQL("UPDATE", "music", e));
});
