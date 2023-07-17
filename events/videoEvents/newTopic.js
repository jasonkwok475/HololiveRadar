const Event = require('../../structures/event.js');
const database = require('../../functions/database.js');
const config = require('../../config/config.json');

module.exports = new Event("newTopic", async (client, song, channel) => {
  client.channels.cache.get(config.topic_channel).send(`https://www.youtube.com/watch?v=${song.video_id}`).then(msg => msg.crosspost());
  
  await database.query(`UPDATE \`music_topic\` SET \`sent\`='1' WHERE \`id\`='${song.id}'`).catch(e => client.log.errorSQL("UPDATE", "music_topic", e));
});
