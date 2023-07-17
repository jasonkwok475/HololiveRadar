const Event = require('../../structures/event.js');
const role = require("./role.js");

module.exports = new Event("memberRole", async (interaction, params) => {
  role.run(interaction, params, params[1]);
});